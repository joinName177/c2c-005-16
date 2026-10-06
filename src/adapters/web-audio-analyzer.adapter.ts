import { normalizeFeatures } from '../core/feature-normalizer';
import type { AudioAnalyzerPort } from '../ports/audio-analyzer.port';
import type { DecodedAudio } from './web-audio-cropper.adapter';
interface Dependencies { decode(blob: Blob): Promise<DecodedAudio> }
async function decode(blob: Blob): Promise<DecodedAudio> { const context = new AudioContext(); const buffer = await context.decodeAudioData(await blob.arrayBuffer()); const result = { sampleRate: buffer.sampleRate, duration: buffer.duration, channels: [buffer.getChannelData(0).slice()] }; await context.close(); return result; }
export class WebAudioAnalyzerAdapter implements AudioAnalyzerPort {
  constructor(private readonly deps: Dependencies = { decode }) {}
  async analyze(blob: Blob) {
    const audio = await this.deps.decode(blob); const samples = audio.channels[0] ?? new Float32Array();
    const rms = samples.length ? Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length) : 0;
    let crossings = 0; let silent = 0; for (let i = 1; i < samples.length; i += 1) { if ((samples[i - 1] < 0) !== (samples[i] < 0)) crossings += 1; if (Math.abs(samples[i]) < .02) silent += 1; }
    const zcr = samples.length ? crossings / samples.length : 0; const pitchHz = zcr * audio.sampleRate / 2;
    const features = normalizeFeatures({ rms, dynamicRange: Math.min(1, rms * 2), pitchHz, zeroCrossingRate: Math.min(1, zcr * 10), pauseRatio: samples.length ? silent / samples.length : 1, tempoVariation: Math.min(1, crossings / Math.max(1, audio.duration * 30)) });
    return { features, duration: audio.duration };
  }
}
