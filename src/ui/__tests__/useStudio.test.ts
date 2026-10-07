import { describe, expect, it, vi } from 'vitest';
import { useStudio, type StudioDependencies } from '../useStudio';
import { coverPresetFor } from '../../core/cover-presets';
import type { AudioPreviewPort } from '../../ports/audio-preview.port';
import type { VoiceMeme } from '../../core/models';

export function fakePreview(overrides: Partial<AudioPreviewPort> = {}) {
  const calls: { type: string; range?: { start: number; end: number }; loop?: boolean }[] = [];
  const endResolvers: Array<() => void> = [];
  const api: AudioPreviewPort & { calls: typeof calls; finish(): void } = {
    calls,
    prepare: vi.fn(async (_blob, range) => { calls.push({ type: 'prepare', range }); return { status: 'ready' as const, duration: range.end - range.start }; }),
    play: vi.fn(async (_blob, range, loop) => { calls.push({ type: 'play', range, loop }); }),
    pause: vi.fn(async () => { calls.push({ type: 'pause' }); }),
    resume: vi.fn(async (loop) => { calls.push({ type: 'resume', loop }); }),
    setLoop: vi.fn((loop) => { calls.push({ type: 'setLoop', loop }); }),
    stop: vi.fn(() => { calls.push({ type: 'stop' }); }),
    ended: vi.fn(() => new Promise<void>((resolve) => endResolvers.push(resolve))),
    finish() { endResolvers.forEach((resolve) => resolve()); endResolvers.length = 0; },
  };
  Object.assign(api, overrides);
  return api;
}

function dependencies(overrides: Partial<StudioDependencies> = {}, preview = fakePreview()): StudioDependencies & { preview: ReturnType<typeof fakePreview> } {
  const saved: VoiceMeme[] = [];
  const { preview: overridePreview, ...rest } = overrides;
  void overridePreview;
  return {
    recorder: { isRecording: false, start: async () => {}, stop: async () => new Blob(['voice'], { type: 'audio/webm' }) },
    analyzer: { analyze: async () => ({ duration: 2, features: { loudness:.75,dynamics:.55,pitch:.8,zeroCrossing:.62,pauseRatio:.12,tempoVariation:.6 } }) },
    cropper: { inspect: async () => ({duration:2,needsCrop:false}), crop: async (blob, range) => ({blob,duration:range.end-range.start}) },
    preview,
    renderer: { render: async () => new Blob(['cover'], { type: 'image/png' }) },
    repository: { list: async()=>saved, save: async(m)=>{saved.push(m)}, rename:async()=>{}, delete:async()=>{} },
    share: { share: async () => 'shared' },
    ...rest,
  };
}

describe('useStudio', () => {
  it('turns microphone denial into a recoverable error', async () => {
    const studio = useStudio(dependencies({ recorder: { isRecording:false, start:async()=>{throw new DOMException('denied','NotAllowedError')}, stop:async()=>new Blob() } }));
    await studio.startRecording();
    expect(studio.error.value).toContain('麦克风权限');
    expect(studio.stage.value).toBe('record');
  });
  it('moves recording through crop and emotion with manual override', async () => {
    const studio = useStudio(dependencies()); await studio.startRecording(); await studio.stopRecording();
    expect(studio.stage.value).toBe('crop'); await studio.analyze(); expect(studio.emotion.value?.label).toBe('元气满满');
    studio.selectEmotion('温柔姐姐'); expect(studio.cover.value.label).toBe('温柔姐姐'); expect(studio.stage.value).toBe('emotion');
  });
  it('keeps the draft when saving fails and can edit an existing work', async () => {
    const studio = useStudio(dependencies({ repository: { list:async()=>[], save:async()=>{throw new DOMException('full','QuotaExceededError')}, rename:async()=>{}, delete:async()=>{} } }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 1; studio.cover.value = coverPresetFor('温柔姐姐'); studio.emotion.value = { label:'温柔姐姐',confidence:.8,explanation:'柔和',scores:{'暴躁老哥':0,'温柔姐姐':1,'阴阳怪气':0,'元气满满':0} };
    studio.features.value = { loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2 };
    await studio.save(); expect(studio.error.value).toContain('保存失败'); expect(studio.draft.audio?.size).toBe(1);
    const existing = { id:'old',title:'旧作品',emotion:'温柔姐姐' as const,confidence:.8,features:{loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2},audio:new Blob(['a']),duration:1,cover:new Blob(['c']),coverConfig:coverPresetFor('温柔姐姐'),createdAt:'2026-10-05' };
    studio.editMeme(existing); expect(studio.draft.title).toBe('旧作品'); expect(studio.stage.value).toBe('cover');
  });

  it('prepares an audition after recording and imports, on the original audio once', async () => {
    const preview = fakePreview();
    const studio = useStudio(dependencies({}, preview));
    await studio.startRecording(); await studio.stopRecording();
    await Promise.resolve();
    expect(preview.calls.filter((c) => c.type === 'prepare')).toHaveLength(1);
    expect(preview.calls.some((c) => c.type === 'stop')).toBe(true); // 新录音先结束可能存在的旧播放
    const blob2 = new Blob(['b']);
    await studio.importAudio(blob2);
    await Promise.resolve();
    expect(preview.calls.filter((c) => c.type === 'prepare')).toHaveLength(2);
  });

  it('toggles play/pause/resume against the current range', async () => {
    const preview = fakePreview();
    const studio = useStudio(dependencies({}, preview));
    await studio.stopRecording(); await Promise.resolve();
    studio.draft.cropStart = 2; studio.draft.cropEnd = 5;
    await studio.togglePreview();
    expect(studio.preview.playing).toBe(true);
    expect(preview.calls.at(-1)).toMatchObject({ type: 'play', range: { start: 2, end: 5 }, loop: true });
    await studio.togglePreview();
    expect(studio.preview.paused).toBe(true);
    expect(preview.calls.at(-1)).toEqual({ type: 'pause' });
    await studio.togglePreview();
    expect(studio.preview.paused).toBe(false);
    expect(preview.calls.at(-1)).toMatchObject({ type: 'resume', loop: true });
  });

  it('invalidates the audition on continuous drags without re-decoding until drag ends', async () => {
    const preview = fakePreview();
    const studio = useStudio(dependencies({}, preview));
    await studio.stopRecording(); await Promise.resolve();
    preview.calls.length = 0;
    for (const value of [1, 1.1, 1.2, 1.3]) studio.updateCropStart(value); // 连续拖动
    expect(studio.preview.ready).toBe(false);
    expect(preview.calls.filter((c) => c.type === 'stop')).toHaveLength(4); // 旧片段不再作为当前试听
    expect(preview.calls.some((c) => c.type === 'prepare')).toBe(false);   // 拖动中不重复解码/准备
    await studio.preparePreview();
    expect(preview.calls.filter((c) => c.type === 'prepare')).toHaveLength(1);
    expect(studio.preview.ready).toBe(true);
  });

  it('lets a slower stale preparation lose to the newest selection', async () => {
    let resolveSlow: (r: { status: 'ready'; duration: number }) => void = () => {};
    const slow = vi.fn(() => new Promise((resolve) => { resolveSlow = resolve; }));
    const fast = vi.fn(async (_blob: Blob, range: { start: number; end: number }) => ({ status: 'ready' as const, duration: range.end - range.start }));
    const preview = fakePreview();
    preview.prepare = slow as unknown as AudioPreviewPort['prepare'];
    const studio = useStudio(dependencies({}, preview));
    await studio.stopRecording(); await Promise.resolve();
    const older = studio.preparePreview();      // 慢的旧选择
    await Promise.resolve();
    preview.prepare = fast as unknown as AudioPreviewPort['prepare'];
    const newer = studio.preparePreview();      // 快的新选择
    await newer;
    resolveSlow({ status: 'ready', duration: 99 });
    await older;
    expect(studio.preview.duration).toBe(studio.draft.cropEnd - studio.draft.cropStart);
    expect(studio.preview.duration).not.toBe(99);
  });

  it('keeps the selection when preparation fails so it can be retried', async () => {
    const preview = fakePreview({ prepare: vi.fn(async () => ({ status: 'failed' as const, error: 'decode boom' })) });
    const studio = useStudio(dependencies({}, preview));
    await studio.stopRecording(); await Promise.resolve();
    studio.draft.cropStart = 3; studio.draft.cropEnd = 7;
    await studio.preparePreview();
    expect(studio.preview.error).toBe('decode boom');
    expect(studio.preview.ready).toBe(false);
    expect(studio.draft.cropStart).toBe(3); // 选择保留
    expect(studio.draft.cropEnd).toBe(7);
  });

  it('looping never changes the saved work duration', async () => {
    const preview = fakePreview();
    const studio = useStudio(dependencies({}, preview));
    await studio.stopRecording(); await Promise.resolve();
    studio.draft.cropStart = 0; studio.draft.cropEnd = 2;
    await studio.togglePreview();
    studio.toggleLoop();
    expect(preview.calls.at(-1)).toMatchObject({ type: 'setLoop', loop: false });
    await studio.analyze();
    expect(studio.draft.duration).toBe(2); // 循环次数不影响作品时长
  });

  it('stops playback when analyzing, creating a new recording, editing, or importing another source', async () => {
    const preview = fakePreview();
    const studio = useStudio(dependencies({}, preview));
    await studio.stopRecording(); await Promise.resolve();
    await studio.togglePreview();
    preview.calls.length = 0;
    await studio.analyze();
    expect(preview.calls.some((c) => c.type === 'stop')).toBe(true);
    expect(studio.preview.playing).toBe(false);

    await studio.newRecording(); await studio.stopRecording(); await Promise.resolve();
    await studio.togglePreview(); preview.calls.length = 0;
    await studio.importAudio(new Blob(['x'])); await Promise.resolve();
    expect(preview.calls.some((c) => c.type === 'stop')).toBe(true); // 换音源结束旧播放
  });
});
