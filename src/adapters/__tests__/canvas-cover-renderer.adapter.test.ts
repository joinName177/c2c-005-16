import { describe, expect, it } from 'vitest';
import { CanvasCoverRendererAdapter } from '../canvas-cover-renderer.adapter';
import { coverPresetFor } from '../../core/cover-presets';

describe('CanvasCoverRendererAdapter', () => {
  it('applies ratio, filter and bubble text and returns PNG', async () => {
    const operations: string[] = [];
    const canvas = { width: 0, height: 0, getContext: () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', globalAlpha: 1,
      fillRect: () => operations.push('fill'), beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, arc: () => {},
      fillText: (text: string) => operations.push(text), save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    }), toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['png'], { type: 'image/png' })) } as unknown as HTMLCanvasElement;
    const config = { ...coverPresetFor('阴阳怪气'), ratio: 'portrait' as const, filter: 'mono' as const, bubbleText: '你说得都对' };
    const blob = await new CanvasCoverRendererAdapter(() => canvas).render(config, canvas);
    expect(canvas.width).toBe(900);
    expect(canvas.height).toBe(1200);
    expect(operations).toContain('你说得都对');
    expect(blob.type).toBe('image/png');
  });
});
