import type { AudioFeatures } from './models';
export interface RawAudioFeatures { rms?: number; dynamicRange?: number; pitchHz?: number; zeroCrossingRate?: number; pauseRatio?: number; tempoVariation?: number }
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export function normalizeFeatures(raw: RawAudioFeatures): AudioFeatures {
  return {
    loudness: clamp((raw.rms ?? 0) / .8),
    dynamics: clamp(raw.dynamicRange ?? 0),
    pitch: raw.pitchHz ? clamp((raw.pitchHz - 80) / 320) : 0,
    zeroCrossing: clamp(raw.zeroCrossingRate ?? 0),
    pauseRatio: clamp(raw.pauseRatio ?? 0),
    tempoVariation: clamp(raw.tempoVariation ?? 0),
  };
}
