import { describe, expect, it } from 'vitest';
import { decodePreview, encodePreview } from '../share-link.adapter';
import { coverPresetFor } from '../../core/cover-presets';

describe('share preview links', () => {
  it('round trips serializable cover metadata', () => {
    const payload = { title: '哈哈哈', emotion: '元气满满' as const, coverConfig: coverPresetFor('元气满满') };
    expect(decodePreview(encodePreview(payload))).toEqual(payload);
  });
  it('returns null for malformed fragments', () => expect(decodePreview('#voice-meme=bad%')).toBeNull());
});
