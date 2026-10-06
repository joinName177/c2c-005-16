import { describe, expect, it } from 'vitest';
import { normalizeFeatures } from '../feature-normalizer';

describe('normalizeFeatures', () => {
  it('clamps raw values into zero and one', () => {
    expect(normalizeFeatures({ rms: 2, dynamicRange: -3, pitchHz: 900, zeroCrossingRate: 1.5, pauseRatio: -1, tempoVariation: 4 })).toEqual({ loudness: 1, dynamics: 0, pitch: 1, zeroCrossing: 1, pauseRatio: 0, tempoVariation: 1 });
  });
  it('handles missing pitch and silence without non-finite values', () => {
    const result = normalizeFeatures({ rms: 0, dynamicRange: 0, zeroCrossingRate: 0, pauseRatio: 1, tempoVariation: 0 });
    expect(result.pitch).toBe(0);
    expect(Object.values(result).every(Number.isFinite)).toBe(true);
  });
});
