import { describe, expect, it } from 'vitest';
import { validateCropRange } from '../models';

describe('validateCropRange', () => {
  it('rejects a negative start', () => expect(validateCropRange({ start: -1, end: 3 }, 5)).toContain('起点'));
  it('rejects reversed endpoints', () => expect(validateCropRange({ start: 4, end: 2 }, 5)).toContain('终点'));
  it('rejects clips longer than ten seconds', () => expect(validateCropRange({ start: 0, end: 11 }, 12)).toContain('10 秒'));
  it('accepts an exact ten-second clip', () => expect(validateCropRange({ start: 0, end: 10 }, 10)).toBeUndefined());
});
