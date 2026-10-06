import { describe, expect, it } from 'vitest';
import { MediaRecorderAdapter, type RecorderLike } from '../media-recorder.adapter';

function setup() {
  let timeout = () => {};
  let interval = () => {};
  let stoppedTracks = 0;
  const stream = { getTracks: () => [{ stop: () => { stoppedTracks += 1; } }] } as unknown as MediaStream;
  const recorder: RecorderLike = {
    state: 'inactive', ondataavailable: null, onstop: null,
    start() { this.state = 'recording'; },
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['voice'], { type: 'audio/webm' }) }); this.onstop?.(); },
  };
  const adapter = new MediaRecorderAdapter({
    getUserMedia: async () => stream,
    createRecorder: () => recorder,
    setTimeout: (callback) => { timeout = callback; return 1; },
    clearTimeout: () => {},
    setInterval: (callback) => { interval = callback; return 2; },
    clearInterval: () => {},
  });
  return { adapter, runTimeout: () => timeout(), runInterval: () => interval(), stoppedTracks: () => stoppedTracks };
}

describe('MediaRecorderAdapter', () => {
  it('emits levels and returns a blob on manual stop', async () => {
    const { adapter, runInterval, stoppedTracks } = setup();
    const levels: number[] = [];
    await adapter.start((level) => levels.push(level));
    runInterval();
    const blob = await adapter.stop();
    expect(levels).toEqual([0.5]);
    expect(blob.size).toBe(5);
    expect(blob.type).toBe('audio/webm');
    expect(stoppedTracks()).toBe(1);
  });

  it('automatically stops at ten seconds', async () => {
    const { adapter, runTimeout, stoppedTracks } = setup();
    await adapter.start(() => {});
    runTimeout();
    const blob = await adapter.stop();
    expect(blob.size).toBeGreaterThan(0);
    expect(stoppedTracks()).toBe(1);
  });
});
