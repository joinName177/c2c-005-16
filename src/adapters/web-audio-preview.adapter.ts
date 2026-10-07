import type { CropRange } from '../core/models';
import { resolveFrameRange } from '../core/crop-range';
import type { AudioPreviewPort, PreviewPreparation } from '../ports/audio-preview.port';
import { browserDecode, type DecodedAudio } from './web-audio-cropper.adapter';

/** 迟到的旧准备结果被新选择（或 stop）取代时抛出。上层捕获后应静默丢弃。 */
export class PreviewStaleError extends Error {
  constructor() { super('preview preparation superseded'); this.name = 'PreviewStaleError'; }
}

interface ActiveSource {
  source: AudioBufferSourceNode;
  /** 本次播放使用的循环设置（暂停期间保持不变）。 */
  loop: boolean;
}

/** Web Audio 播放引擎，抽成接口便于在 jsdom 中用假引擎验证调度逻辑。 */
export interface PreviewEngine {
  load(audio: DecodedAudio): AudioBuffer;
  start(buffer: AudioBuffer, offsetSeconds: number, duration: number, loop: boolean): AudioBufferSourceNode;
  pause(): Promise<void>;
  resume(): Promise<void>;
  dispose(): void;
}

export class WebAudioPreviewEngine implements PreviewEngine {
  private context?: AudioContext;
  private ensure() { if (!this.context) this.context = new AudioContext(); return this.context; }
  load(audio: DecodedAudio): AudioBuffer {
    const context = this.ensure();
    const buffer = context.createBuffer(audio.channels.length, audio.channels[0]?.length ?? 0, audio.sampleRate);
    audio.channels.forEach((channel, index) => buffer.copyToChannel(Float32Array.from(channel), index));
    return buffer;
  }
  start(buffer: AudioBuffer, offsetSeconds: number, duration: number, loop: boolean): AudioBufferSourceNode {
    const context = this.ensure();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    // 循环边界始终设置：播放中途切换循环开关也能立即生效；
    // 非循环时靠 start 的 duration 参数在范围终点自然停止，听到的内容恰好等于裁剪片段。
    source.loopStart = offsetSeconds;
    source.loopEnd = offsetSeconds + duration;
    source.connect(context.destination);
    source.start(0, offsetSeconds, duration);
    return source;
  }
  pause() { return this.ensure().suspend(); }
  resume() { return this.ensure().resume(); }
  dispose() { const context = this.context; this.context = undefined; void context?.close(); }
}

interface Dependencies {
  decode(blob: Blob): Promise<DecodedAudio>;
  createEngine?(): PreviewEngine;
  /** 播放自然结束（含循环外的最后一遍）时回调，用于把 UI 复位到“试听”。 */
  onIdle?(): void;
}

/**
 * 在**原声音的单一解码缓冲区**上做范围播放，而不是为每次拖动生成独立试听片段：
 * - 每个 Blob 只解码一次并复用 AudioBuffer（拖动只改 start/stop 偏移，零额外解码、零逐帧拷贝）；
 * - 偏移直接以采样帧换算，loopStart/loopEnd 与 WAV 裁剪共用 resolveFrameRange，定位逐帧精确；
 * - 内存常驻的只有一份与原声音等长的缓冲，停止播放仅断开 source，不复制、不改写原声音；
 * - seq 序号保证换范围/换音源后，迟到的旧准备结果不会覆盖新选择。
 */
export class WebAudioPreviewAdapter implements AudioPreviewPort {
  private readonly engine: PreviewEngine;
  /** 单调递增的选择代号：prepare、play 和 stop 都会让旧代号失效。 */
  private seq = 0;
  /** 当前音源的已解码缓冲（仅一份，换音源后旧缓冲可被回收）。 */
  private cached?: { blob: Blob; buffer: AudioBuffer; audio: DecodedAudio };
  /** 每个 Blob 各自的在途解码：换音源时不会错误地复用前一个音源的解码。 */
  private readonly loading = new Map<Blob, Promise<{ buffer: AudioBuffer; audio: DecodedAudio }>>();
  private active?: ActiveSource;
  private endWaiters: Array<() => void> = [];

  constructor(private readonly deps: Dependencies = { decode: browserDecode }) {
    this.engine = deps.createEngine ? deps.createEngine() : new WebAudioPreviewEngine();
  }

  private load(blob: Blob): Promise<{ buffer: AudioBuffer; audio: DecodedAudio }> {
    if (this.cached?.blob === blob) return Promise.resolve(this.cached);
    const pending = this.loading.get(blob);
    if (pending) return pending;
    // 解码只与 Blob 有关：结果先入缓存，调用方再凭各自的 token 判断是否已被新选择取代。
    const task = this.deps.decode(blob)
      .then((audio) => {
        const buffer = this.engine.load(audio);
        this.cached = { blob, buffer, audio };
        return { buffer, audio };
      })
      .finally(() => { this.loading.delete(blob); });
    this.loading.set(blob, task);
    return task;
  }

  private teardownSource(notify = false) {
    const active = this.active;
    if (!active) return;
    try { active.source.onended = null; active.source.stop(); } catch { /* 已停止 */ }
    try { active.source.disconnect(); } catch { /* 已断开 */ }
    this.active = undefined;
    if (notify) { this.endWaiters.forEach((resolve) => resolve()); this.endWaiters = []; this.deps.onIdle?.(); }
  }

  async prepare(blob: Blob, range: CropRange): Promise<PreviewPreparation> {
    const token = ++this.seq;
    try {
      const { audio } = await this.load(blob);
      if (token !== this.seq) throw new PreviewStaleError(); // 更慢的旧准备结果不得覆盖新选择
      const frames = resolveFrameRange(range, audio.sampleRate, audio.duration);
      return { status: 'ready', duration: (frames.endFrame - frames.startFrame) / audio.sampleRate };
    } catch (cause) {
      if (cause instanceof PreviewStaleError) throw cause;
      return { status: 'failed', error: cause instanceof Error ? cause.message : '试听准备失败' };
    }
  }

  async play(blob: Blob, range: CropRange, loop: boolean): Promise<void> {
    const token = ++this.seq;
    try {
      const { buffer, audio } = await this.load(blob);
      if (token !== this.seq) throw new PreviewStaleError();
      this.teardownSource();
      const frames = resolveFrameRange(range, audio.sampleRate, audio.duration);
      const offset = frames.startFrame / audio.sampleRate;
      const duration = (frames.endFrame - frames.startFrame) / audio.sampleRate;
      const source = this.engine.start(buffer, offset, duration, loop);
      source.onended = () => {
        if (this.active?.source !== source) return;
        this.teardownSource(true);
      };
      this.active = { source, loop };
    } catch (cause) {
      if (!(cause instanceof PreviewStaleError)) throw cause;
    }
  }

  async pause(): Promise<void> { if (this.active) await this.engine.pause(); }
  async resume(loop: boolean): Promise<void> {
    const active = this.active;
    if (!active) return;
    // 循环方式可在暂停期间切换：source.loop 直接生效，循环边界在播放起点已按片段固定。
    active.loop = loop;
    active.source.loop = loop;
    await this.engine.resume();
  }
  setLoop(loop: boolean) { if (this.active) { this.active.loop = loop; this.active.source.loop = loop; } }
  stop(): void {
    this.seq += 1;
    this.teardownSource();
  }
  ended(): Promise<void> {
    return this.active ? new Promise((resolve) => this.endWaiters.push(resolve)) : Promise.resolve();
  }
}
