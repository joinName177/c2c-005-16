import { validateCropRange, type CropRange } from '../core/models';
import { resolveFrameRange } from '../core/crop-range';
import type { AudioCropperPort } from '../ports/audio-cropper.port';

export interface DecodedAudio { sampleRate: number; duration: number; channels: Float32Array[] }
interface Dependencies { decode(blob: Blob): Promise<DecodedAudio> }
export async function browserDecode(blob: Blob): Promise<DecodedAudio> {
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const result = { sampleRate: buffer.sampleRate, duration: buffer.duration, channels: Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice()) };
  await context.close();
  return result;
}
function encodeWav(audio: DecodedAudio, frames: { startFrame: number; endFrame: number }) {
  const { startFrame, endFrame } = frames;
  const channels = audio.channels.map((channel) => channel.slice(startFrame, endFrame));
  const length = endFrame - startFrame;
  const buffer = new ArrayBuffer(44 + length * channels.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + length * channels.length * 2, true); write(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true); view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * channels.length * 2, true); view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length * channels.length * 2, true);
  let offset = 44;
  for (let i = 0; i < length; i += 1) for (const channel of channels) { const value = Math.max(-1, Math.min(1, channel[i] ?? 0)); view.setInt16(offset, value < 0 ? value * 32768 : value * 32767, true); offset += 2; }
  return new Blob([buffer], { type: 'audio/wav' });
}
export class WebAudioCropperAdapter implements AudioCropperPort {
  constructor(private readonly deps: Dependencies = { decode: browserDecode }) {}
  async inspect(blob: Blob) { const audio = await this.deps.decode(blob); return { duration: audio.duration, needsCrop: audio.duration > 10 }; }
  async crop(blob: Blob, range: CropRange) {
    const audio = await this.deps.decode(blob);
    // 试听与裁剪共用 resolveFrameRange：钳制规则一致，试听内容与保存内容逐帧相同。
    const frames = resolveFrameRange(range, audio.sampleRate, audio.duration);
    const safe = { start: frames.startFrame / audio.sampleRate, end: Math.min(frames.endFrame / audio.sampleRate, audio.duration) };
    const error = validateCropRange(safe, audio.duration); if (error) throw new Error(error);
    return { blob: encodeWav(audio, frames), duration: safe.end - safe.start };
  }
}
