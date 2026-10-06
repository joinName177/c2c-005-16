import type { CoverConfig, EmotionLabel } from './models';
const PALETTES: Record<EmotionLabel, [string, string, string]> = {
  '暴躁老哥': ['#ff4f2e', '#1b1029', '#ffd84a'],
  '温柔姐姐': ['#efb9ce', '#532f68', '#fff2dd'],
  '阴阳怪气': ['#8ce637', '#40235f', '#ff7ad9'],
  '元气满满': ['#ffe445', '#f44897', '#4137b5'],
};
export function coverPresetFor(label: EmotionLabel): CoverConfig {
  return { label, title: label, bubbleText: label === '元气满满' ? '今天元气超标！' : `本声音属于「${label}」`, bubbleX: 50, bubbleY: 72, palette: PALETTES[label], filter: 'none', ratio: 'square' };
}
