import { describe, expect, it } from 'vitest';
import { WebAudioCropperAdapter, type DecodedAudio } from '../web-audio-cropper.adapter';
import { WebAudioAnalyzerAdapter } from '../web-audio-analyzer.adapter';

const decoded = (duration = 12): DecodedAudio => ({ sampleRate: 10, duration, channels: [Float32Array.from({ length: duration * 10 }, (_, index) => index % 5 ? .4 : 0)] });

describe('WebAudioCropperAdapter', () => {
  it('marks imports over ten seconds as requiring crop', async () => {
    const adapter = new WebAudioCropperAdapter({ decode: async () => decoded(12) });
    expect(await adapter.inspect(new Blob())).toEqual({ duration: 12, needsCrop: true });
  });
  it('caps encoded output range at ten seconds', async () => {
    const adapter = new WebAudioCropperAdapter({ decode: async () => decoded(12) });
    const result = await adapter.crop(new Blob(), { start: 1, end: 11 });
    expect(result.duration).toBe(10);
    expect(result.blob.type).toBe('audio/wav');
  });
});

describe('WebAudioAnalyzerAdapter', () => {
  it('extracts finite normalized features and duration', async () => {
    const result = await new WebAudioAnalyzerAdapter({ decode: async () => decoded(2) }).analyze(new Blob());
    expect(result.duration).toBe(2);
    expect(Object.values(result.features).every(Number.isFinite)).toBe(true);
  });
});
