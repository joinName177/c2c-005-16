import type { AudioFeatures, EmotionLabel, EmotionResult } from './models';

const PROFILES: Record<EmotionLabel, AudioFeatures> = {
  '暴躁老哥': { loudness: .95, dynamics: .85, pitch: .55, zeroCrossing: .7, pauseRatio: .08, tempoVariation: .8 },
  '温柔姐姐': { loudness: .22, dynamics: .2, pitch: .45, zeroCrossing: .2, pauseRatio: .35, tempoVariation: .18 },
  '阴阳怪气': { loudness: .45, dynamics: .7, pitch: .4, zeroCrossing: .62, pauseRatio: .58, tempoVariation: .75 },
  '元气满满': { loudness: .75, dynamics: .55, pitch: .8, zeroCrossing: .62, pauseRatio: .12, tempoVariation: .6 },
};
const COPY: Record<EmotionLabel, string> = {
  '暴躁老哥': '音量高、起伏大、节奏紧，能量像一记重拍。',
  '温柔姐姐': '音量柔和、停顿自然、节奏平稳，听感很松弛。',
  '阴阳怪气': '语调起伏和停顿都很明显，自带反转感。',
  '元气满满': '音调明亮、停顿少、节奏活跃，能量持续在线。',
};
const keys = Object.keys(PROFILES[Object.keys(PROFILES)[0] as EmotionLabel]) as Array<keyof AudioFeatures>;

export function classifyEmotion(features: AudioFeatures): EmotionResult {
  const scores = Object.fromEntries((Object.keys(PROFILES) as EmotionLabel[]).map((label) => {
    const distance = keys.reduce((sum, key) => sum + Math.abs(features[key] - PROFILES[label][key]), 0) / keys.length;
    return [label, Math.max(0, 1 - distance)];
  })) as Record<EmotionLabel, number>;
  const ranking = (Object.keys(scores) as EmotionLabel[]).sort((a, b) => scores[b] - scores[a]);
  const label = ranking[0];
  const confidence = Math.max(0, Math.min(1, .55 + (scores[label] - scores[ranking[1]]) * .9));
  return { label, confidence, explanation: COPY[label], scores };
}
