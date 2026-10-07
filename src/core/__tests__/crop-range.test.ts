import { describe, expect, it } from 'vitest';
import { resolveFrameRange } from '../crop-range';

describe('resolveFrameRange', () => {
  it('maps seconds to inclusive-exclusive sample frames', () => {
    expect(resolveFrameRange({ start: 1, end: 4 }, 100, 12)).toEqual({ startFrame: 100, endFrame: 400 });
  });
  it('keeps at least one frame and never crosses the end for tiny clips', () => {
    expect(resolveFrameRange({ start: 9.999, end: 10 }, 100, 10)).toEqual({ startFrame: 999, endFrame: 1000 });
    expect(resolveFrameRange({ start: 11, end: 12 }, 100, 10)).toEqual({ startFrame: 999, endFrame: 1000 });
    expect(resolveFrameRange({ start: 5, end: 5 }, 100, 10)).toEqual({ startFrame: 500, endFrame: 501 });
  });
  it('anchors the ten-second cap at the start', () => {
    expect(resolveFrameRange({ start: 1, end: 11 }, 100, 12)).toEqual({ startFrame: 100, endFrame: 1100 });
  });
  it('pulls back to the final frame when the start is within one frame of the end', () => {
    expect(resolveFrameRange({ start: 12, end: 12 }, 100, 12)).toEqual({ startFrame: 1199, endFrame: 1200 });
  });
});
