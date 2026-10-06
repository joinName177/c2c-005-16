import { describe, expect, it } from 'vitest';
import { classifyEmotion } from '../emotion-engine';
import { coverPresetFor } from '../cover-presets';
import type { AudioFeatures, EmotionLabel } from '../models';

const cases: Array<[EmotionLabel, AudioFeatures]> = [
  ['暴躁老哥', { loudness: .95, dynamics: .85, pitch: .55, zeroCrossing: .7, pauseRatio: .08, tempoVariation: .8 }],
  ['温柔姐姐', { loudness: .22, dynamics: .2, pitch: .45, zeroCrossing: .2, pauseRatio: .35, tempoVariation: .18 }],
  ['阴阳怪气', { loudness: .45, dynamics: .7, pitch: .4, zeroCrossing: .62, pauseRatio: .58, tempoVariation: .75 }],
  ['元气满满', { loudness: .75, dynamics: .55, pitch: .8, zeroCrossing: .62, pauseRatio: .12, tempoVariation: .6 }],
];

describe('classifyEmotion', () => {
  it.each(cases)('maps a canonical vector to %s', (label, features) => {
    const result = classifyEmotion(features);
    expect(result.label).toBe(label);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.explanation.length).toBeGreaterThan(4);
    expect(result.scores[label]).toBeGreaterThan(0);
  });
  it('provides an editable preset for the selected label', () => {
    const preset = coverPresetFor('元气满满');
    expect(preset.label).toBe('元气满满');
    expect(preset.title).toContain('元气');
  });
});
