import { describe, expect, it } from 'vitest';
import { WebAudioPreviewAdapter, type PreviewPlayer } from '../web-audio-preview.adapter';
import type { DecodedAudio } from '../web-audio-cropper.adapter';
import type { CropRange } from '../../core/models';

const decoded = (duration = 12): DecodedAudio => ({ sampleRate: 10, duration, channels: [Float32Array.from({ length: duration * 10 }, () => .4)] });

interface PlayCall { range: CropRange; loop: boolean; offset: number; player: PreviewPlayer & { disposed: boolean } }
function recorder(calls: PlayCall[], positions: number[] = []) {
  return (_audio: DecodedAudio, range: CropRange, loop: boolean, offset: number, _onEnded: () => void) => {
    const player = { disposed: false, position: () => positions.shift() ?? offset, dispose: () => { player.disposed = true; } };
    calls.push({ range, loop, offset, player });
    return player;
  };
}

describe('WebAudioPreviewAdapter', () => {
  it('keeps only the latest range playing during continuous drags', async () => {
    const calls: PlayCall[] = [];
    const adapter = new WebAudioPreviewAdapter({ decode: async () => decoded(12), startPlayer: recorder(calls) });
    await adapter.prepare(new Blob());
    adapter.play({ start: 1, end: 5 }, false);
    adapter.play({ start: 2, end: 6 }, false);
    adapter.play({ start: 3, end: 7 }, true);
    expect(calls).toHaveLength(3);
    expect(calls[0].player.disposed).toBe(true);
    expect(calls[1].player.disposed).toBe(true);
    expect(calls[2].player.disposed).toBe(false);
    expect(calls[2].range).toEqual({ start: 3, end: 7 });
    expect(calls[2].loop).toBe(true);
  });
  it('clamps the loop range to the decoded bounds so it never plays past the end', async () => {
    const calls: PlayCall[] = [];
    const adapter = new WebAudioPreviewAdapter({ decode: async () => decoded(4), startPlayer: recorder(calls) });
    await adapter.prepare(new Blob());
    adapter.play({ start: 3.9, end: 99 }, true);
    expect(calls[0].range).toEqual({ start: 3.9, end: 4 });
    expect(calls[0].offset).toBe(3.9);
  });
  it('does not start a player for an empty fragment and reports it as ended', async () => {
    const calls: PlayCall[] = [];
    let ended = 0;
    const adapter = new WebAudioPreviewAdapter({ decode: async () => decoded(4), startPlayer: recorder(calls) });
    adapter.onended = () => { ended += 1; };
    await adapter.prepare(new Blob());
    adapter.play({ start: 4, end: 4 }, false);
    expect(calls).toHaveLength(0);
    expect(ended).toBe(1);
  });
  it('pauses with the current position and resumes from it inside the same range', async () => {
    const calls: PlayCall[] = [];
    const adapter = new WebAudioPreviewAdapter({ decode: async () => decoded(12), startPlayer: recorder(calls, [2.5]) });
    await adapter.prepare(new Blob());
    adapter.play({ start: 1, end: 5 }, true);
    adapter.pause();
    expect(calls[0].player.disposed).toBe(true);
    adapter.resume();
    expect(calls).toHaveLength(2);
    expect(calls[1].offset).toBe(2.5);
    expect(calls[1].range).toEqual({ start: 1, end: 5 });
    expect(calls[1].loop).toBe(true);
  });
  it('keeps the newest source when an older prepare resolves later', async () => {
    const resolvers: ((audio: DecodedAudio) => void)[] = [];
    const calls: PlayCall[] = [];
    const adapter = new WebAudioPreviewAdapter({ decode: () => new Promise((resolve) => { resolvers.push(resolve); }), startPlayer: recorder(calls) });
    const first = adapter.prepare(new Blob(['old']));
    const second = adapter.prepare(new Blob(['new']));
    resolvers[1](decoded(6));
    await second;
    resolvers[0](decoded(12));
    await first;
    adapter.play({ start: 0, end: 99 }, false);
    expect(calls[0].range.end).toBe(6);
  });
  it('releases everything on stop so a stale play cannot continue', async () => {
    const calls: PlayCall[] = [];
    const adapter = new WebAudioPreviewAdapter({ decode: async () => decoded(12), startPlayer: recorder(calls) });
    await adapter.prepare(new Blob());
    adapter.play({ start: 0, end: 5 }, true);
    adapter.stop();
    expect(calls[0].player.disposed).toBe(true);
    expect(() => adapter.play({ start: 0, end: 5 }, false)).toThrow('试听尚未准备好');
  });
});
