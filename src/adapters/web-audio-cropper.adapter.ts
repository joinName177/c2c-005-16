import { validateCropRange, type CropRange } from '../core/models';
import type { AudioCropperPort } from '../ports/audio-cropper.port';

export interface DecodedAudio { sampleRate: number; duration: number; channels: Float32Array[] }
interface Dependencies { decode(blob: Blob): Promise<DecodedAudio> }
async function browserDecode(blob: Blob): Promise<DecodedAudio> {
  const context = new AudioContext();
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const result = { sampleRate: buffer.sampleRate, duration: buffer.duration, channels: Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index).slice()) };
  await context.close();
  return result;
}
function encodeWav(audio: DecodedAudio, range: CropRange) {
  const start = Math.floor(range.start * audio.sampleRate);
  const end = Math.floor(range.end * audio.sampleRate);
  const channels = audio.channels.map((channel) => channel.slice(start, end));
  const length = end - start;
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
    const safe = { start: Math.max(0, range.start), end: Math.min(audio.duration, range.start + Math.min(10, range.end - range.start)) };
    const error = validateCropRange(safe, audio.duration); if (error) throw new Error(error);
    return { blob: encodeWav(audio, safe), duration: safe.end - safe.start };
  }
}
