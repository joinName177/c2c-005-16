import { describe, expect, it, vi } from 'vitest';
import { WebAudioPreviewAdapter, PreviewStaleError, type PreviewEngine } from '../web-audio-preview.adapter';
import type { DecodedAudio } from '../web-audio-cropper.adapter';

const decoded = (duration = 12, sampleRate = 100): DecodedAudio => ({ sampleRate, duration, channels: [Float32Array.from({ length: duration * sampleRate }, (_, index) => index % 5 ? .4 : 0)] });

interface FakeSource { loopStart: number; loopEnd: number; loop: boolean; onended: (() => void) | null; stopped: boolean; disconnected: boolean; stop(): void; disconnect(): void }
interface StartedCall { buffer: AudioBuffer; offset: number; duration: number; loop: boolean; source: FakeSource }

function fakeEngine() {
  const started: StartedCall[] = [];
  const engine: PreviewEngine & { started: StartedCall[]; paused: number; resumed: number; disposed: boolean; buffers: AudioBuffer[] } = {
    started, paused: 0, resumed: 0, disposed: false, buffers: [],
    load(audio) {
      const buffer = { length: audio.channels[0]?.length ?? 0, duration: audio.duration, sampleRate: audio.sampleRate, numberOfChannels: audio.channels.length } as unknown as AudioBuffer;
      this.buffers.push(buffer);
      return buffer;
    },
    start(buffer, offset, duration, loop) {
      const source: FakeSource = { loopStart: offset, loopEnd: offset + duration, loop, onended: null, stopped: false, disconnected: false, stop() { this.stopped = true; }, disconnect() { this.disconnected = true; } };
      started.push({ buffer, offset, duration, loop, source });
      return source as unknown as AudioBufferSourceNode;
    },
    pause: async () => { engine.paused += 1; },
    resume: async () => { engine.resumed += 1; },
    dispose() { engine.disposed = true; },
  };
  return engine;
}

describe('WebAudioPreviewAdapter', () => {
  it('decodes each blob once and schedules the exact frame range on the original buffer', async () => {
    const decode = vi.fn(async () => decoded(12));
    const engine = fakeEngine();
    const adapter = new WebAudioPreviewAdapter({ decode, createEngine: () => engine });
    const blob = new Blob();
    await adapter.prepare(blob, { start: 1, end: 4 });
    await adapter.play(blob, { start: 1, end: 4 }, true);
    await adapter.play(blob, { start: 2, end: 5 }, false);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(engine.buffers).toHaveLength(1);
    const first = engine.started[0];
    expect(first.offset).toBe(1); expect(first.duration).toBe(3); expect(first.loop).toBe(true);
    expect(first.source.loopStart).toBe(1); expect(first.source.loopEnd).toBe(4);
    expect(engine.started[1].buffer).toBe(first.buffer); // 同一份原始缓冲，无独立试听片段
    expect(engine.started[1].offset).toBe(2); expect(engine.started[1].duration).toBe(3);
    expect(engine.started[0].source.stopped).toBe(true); // 新播放先停掉旧 source
  });

  it('loops inside the range and resolves ended only at a natural finish', async () => {
    const engine = fakeEngine();
    const adapter = new WebAudioPreviewAdapter({ decode: async () => decoded(12), createEngine: () => engine });
    await adapter.play(new Blob(), { start: 1, end: 4 }, true);
    let finished = false; void adapter.ended().then(() => { finished = true; });
    engine.started[0].source.onended!(); // 循环由 AudioBufferSourceNode 内部处理，stop 之外不会触发结束
    expect(finished).toBe(false);
  });

  it('pauses via context suspend and resumes without repositioning', async () => {
    const engine = fakeEngine();
    const adapter = new WebAudioPreviewAdapter({ decode: async () => decoded(12), createEngine: () => engine });
    await adapter.play(new Blob(), { start: 1, end: 4 }, false);
    await adapter.pause();
    expect(engine.paused).toBe(1);
    await adapter.resume(true);
    expect(engine.resumed).toBe(1);
    expect(engine.started).toHaveLength(1); // 恢复不重新调度，定位不漂移
    expect(engine.started[0].source.loop).toBe(true); // 暂停期间切换的循环方式随恢复生效
  });

  it('supersedes slower stale preparations and keeps the newest range', async () => {
    let resolveOld: (a: DecodedAudio) => void = () => {};
    const oldDecode = () => new Promise<DecodedAudio>((resolve) => { resolveOld = resolve; });
    const newDecode = vi.fn(async () => decoded(12));
    const engine = fakeEngine();
    const adapter = new WebAudioPreviewAdapter({ decode: (blob) => (blob as Blob & { which?: string }).which === 'new' ? newDecode() : oldDecode(), createEngine: () => engine });
    const oldBlob = Object.assign(new Blob(), { which: 'old' });
    const newBlob = Object.assign(new Blob(), { which: 'new' });
    const stale = adapter.prepare(oldBlob, { start: 0, end: 3 });
    const fresh = adapter.prepare(newBlob, { start: 5, end: 8 });
    resolveOld(decoded(8));
    await expect(stale).rejects.toBeInstanceOf(PreviewStaleError);
    await expect(fresh).resolves.toEqual({ status: 'ready', duration: 3 });
    expect(newDecode).toHaveBeenCalledTimes(1);
  });

  it('stops invalidate pending preparations and tears the source down', async () => {
    const resolvers: Array<(a: DecodedAudio) => void> = [];
    const engine = fakeEngine();
    const adapter = new WebAudioPreviewAdapter({ decode: () => new Promise((resolve) => { resolvers.push(resolve); }), createEngine: () => engine });
    const blob = new Blob();
    const pending = adapter.prepare(blob, { start: 0, end: 3 });
    await Promise.resolve();
    adapter.stop();
    resolvers.shift()!(decoded(12));
    await expect(pending).rejects.toBeInstanceOf(PreviewStaleError);
    await adapter.play(blob, { start: 0, end: 3 }, false); // 解码结果已缓存，直接调度
    adapter.stop();
    expect(engine.started[0].source.stopped).toBe(true);
    expect(engine.started[0].source.disconnected).toBe(true);
    await expect(adapter.ended()).resolves.toBeUndefined();
  });

  it('reports decode failure without throwing so the selection stays for retry', async () => {
    const engine = fakeEngine();
    const adapter = new WebAudioPreviewAdapter({ decode: async () => { throw new Error('bad data'); }, createEngine: () => engine });
    await expect(adapter.prepare(new Blob(), { start: 0, end: 3 })).resolves.toMatchObject({ status: 'failed', error: 'bad data' });
  });

  it('clamps extremely short clips near the end to the last sample frame', async () => {
    const engine = fakeEngine();
    const adapter = new WebAudioPreviewAdapter({ decode: async () => decoded(10), createEngine: () => engine });
    await adapter.play(new Blob(), { start: 9.999, end: 10.5 }, false);
    expect(engine.started[0].offset).toBe(9.99);
    expect(engine.started[0].duration).toBeCloseTo(0.01, 10);
    expect(engine.started[0].source.loopEnd).toBe(10);
  });
});
