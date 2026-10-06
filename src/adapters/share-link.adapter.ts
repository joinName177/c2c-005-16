import type { CoverConfig, EmotionLabel } from '../core/models';
export interface PreviewPayload { title: string; emotion: EmotionLabel; coverConfig: CoverConfig }
export function encodePreview(payload: PreviewPayload): string { return `#voice-meme=${encodeURIComponent(JSON.stringify(payload))}`; }
export function decodePreview(fragment: string): PreviewPayload | null {
  try { const prefix = '#voice-meme='; if (!fragment.startsWith(prefix)) return null; const value = JSON.parse(decodeURIComponent(fragment.slice(prefix.length))) as PreviewPayload; return value?.title && value?.coverConfig ? value : null; } catch { return null; }
}
