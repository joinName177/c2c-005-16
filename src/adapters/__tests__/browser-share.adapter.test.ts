import { describe, expect, it } from 'vitest';
import { BrowserShareAdapter } from '../browser-share.adapter';
import { coverPresetFor } from '../../core/cover-presets';
import type { VoiceMeme } from '../../core/models';
const meme = (): VoiceMeme => ({ id: '1', title: '笑声', emotion: '元气满满', confidence: .8, features: { loudness:.7,dynamics:.5,pitch:.8,zeroCrossing:.6,pauseRatio:.1,tempoVariation:.6 }, audio: new Blob(['a'], {type:'audio/webm'}), duration: 1, cover: new Blob(['p'], {type:'image/png'}), coverConfig: coverPresetFor('元气满满'), createdAt: '2026-10-05' });

describe('BrowserShareAdapter', () => {
  it('uses file share when supported', async () => {
    let shared = false; const adapter = new BrowserShareAdapter({ canShare: () => true, share: async () => { shared = true; }, download: () => {} });
    expect(await adapter.share(meme())).toBe('shared'); expect(shared).toBe(true);
  });
  it('falls back to both downloads when sharing is rejected', async () => {
    const downloads: string[] = []; const adapter = new BrowserShareAdapter({ canShare: () => true, share: async () => { throw new Error('denied'); }, download: (_, name) => downloads.push(name) });
    expect(await adapter.share(meme())).toBe('downloaded'); expect(downloads).toEqual(['笑声.webm', '笑声.png']);
  });
});
