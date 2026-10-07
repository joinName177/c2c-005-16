import { clampCropRange, type CropRange } from '../core/models';
import type { AudioPreviewPort } from '../ports/audio-preview.port';
import type { DecodedAudio } from './web-audio-cropper.adapter';

export interface PreviewPlayer { position(): number; dispose(): void }
export type StartPreviewPlayer = (audio: DecodedAudio, range: CropRange, loop: boolean, offset: number, onEnded: () => void) => PreviewPlayer;
interface Dependencies { decode(blob: Blob): Promise<DecodedAudio>; startPlayer?: StartPreviewPlayer }

async function browserDecode(blob: Blob): Promise<DecodedAudio> {
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const result = { sampleRate: buffer.sampleRate, duration: buffer.duration, channels: Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice()) };
  await context.close();
  return result;
}

function browserStartPlayer(audio: DecodedAudio, range: CropRange, loop: boolean, offset: number, onEnded: () => void): PreviewPlayer {
  const context = new AudioContext();
  const buffer = context.createBuffer(Math.max(1, audio.channels.length), Math.max(1, Math.ceil(audio.duration * audio.sampleRate)), audio.sampleRate);
  audio.channels.forEach((channel, index) => { if (index < buffer.numberOfChannels) buffer.copyToChannel(channel.subarray(0, buffer.length), index); });
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  if (loop) { source.loopStart = range.start; source.loopEnd = range.end; }
  source.connect(context.destination);
  const startedAt = context.currentTime;
  const length = range.end - range.start;
  source.onended = () => { void context.close(); onEnded(); };
  if (loop) source.start(0, offset); else source.start(0, offset, range.end - offset);
  let disposed = false;
  return {
    position() {
      const elapsed = Math.max(0, context.currentTime - startedAt);
      if (loop && length > 0) return range.start + ((offset - range.start + elapsed) % length);
      return Math.min(range.end, offset + elapsed);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      source.onended = null;
      try { source.stop(); } catch { /* 节点可能已自然结束 */ }
      void context.close();
    },
  };
}

export class WebAudioPreviewAdapter implements AudioPreviewPort {
  onended?: () => void;
  private audio?: DecodedAudio;
  private player?: PreviewPlayer;
  private current?: { range: CropRange; loop: boolean };
  private pausedAt = 0;
  private prepareTicket = 0;

  constructor(private readonly deps: Dependencies = { decode: browserDecode }) {}

  async prepare(blob: Blob) {
    const ticket = ++this.prepareTicket;
    this.stopPlayer();
    this.audio = undefined;
    const audio = await this.deps.decode(blob);
    if (ticket !== this.prepareTicket) return; // 较慢的旧准备结果不能覆盖新选择
    this.audio = audio;
  }

  play(range: CropRange, loop: boolean) {
    const audio = this.audio;
    if (!audio) throw new Error('试听尚未准备好');
    this.stopPlayer(); // 连续拖动时先结束旧片段的播放
    const safe = clampCropRange(range, audio.duration);
    this.current = { range: safe, loop };
    this.pausedAt = safe.start;
    this.startFrom(safe.start);
  }

  pause() {
    if (!this.player) return;
    this.pausedAt = this.player.position();
    this.stopPlayer();
  }

  resume() {
    if (!this.current || this.player) return;
    this.startFrom(this.pausedAt);
  }

  stop() {
    this.prepareTicket += 1; // 让进行中的 prepare 失效
    this.stopPlayer();
    this.audio = undefined;
    this.current = undefined;
  }

  private startFrom(offset: number) {
    const audio = this.audio; const current = this.current;
    if (!audio || !current) return;
    const { range, loop } = current;
    const start = Math.min(Math.max(offset, range.start), range.end);
    if (range.end - start <= 0) { this.player = undefined; this.onended?.(); return; } // 极短片段不能越过终点
    const startPlayer = this.deps.startPlayer ?? browserStartPlayer;
    this.player = startPlayer(audio, range, loop, start, () => { this.player = undefined; this.onended?.(); });
  }

  private stopPlayer() { this.player?.dispose(); this.player = undefined; }
}
