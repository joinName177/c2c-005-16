import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { useStudio, type StudioDependencies } from '../useStudio';
import { coverPresetFor } from '../../core/cover-presets';
import type { VoiceMeme } from '../../core/models';

function dependencies(overrides: Partial<StudioDependencies> = {}): StudioDependencies {
  const saved: VoiceMeme[] = [];
  return {
    recorder: { isRecording: false, start: async () => {}, stop: async () => new Blob(['voice'], { type: 'audio/webm' }) },
    analyzer: { analyze: async () => ({ duration: 2, features: { loudness:.75,dynamics:.55,pitch:.8,zeroCrossing:.62,pauseRatio:.12,tempoVariation:.6 } }) },
    cropper: { inspect: async () => ({duration:2,needsCrop:false}), crop: async (blob, range) => ({blob,duration:range.end-range.start}) },
    preview: { prepare: async () => {}, play: () => {}, pause: () => {}, resume: () => {}, stop: () => {} },
    renderer: { render: async () => new Blob(['cover'], { type: 'image/png' }) },
    repository: { list: async()=>saved, save: async(m)=>{saved.push(m)}, rename:async()=>{}, delete:async()=>{} },
    share: { share: async () => 'shared' },
    ...overrides,
  };
}

describe('useStudio', () => {
  it('turns microphone denial into a recoverable error', async () => {
    const studio = useStudio(dependencies({ recorder: { isRecording:false, start:async()=>{throw new DOMException('denied','NotAllowedError')}, stop:async()=>new Blob() } }));
    await studio.startRecording();
    expect(studio.error.value).toContain('麦克风权限');
    expect(studio.stage.value).toBe('record');
  });
  it('moves recording through crop and emotion with manual override', async () => {
    const studio = useStudio(dependencies()); await studio.startRecording(); await studio.stopRecording();
    expect(studio.stage.value).toBe('crop'); await studio.analyze(); expect(studio.emotion.value?.label).toBe('元气满满');
    studio.selectEmotion('温柔姐姐'); expect(studio.cover.value.label).toBe('温柔姐姐'); expect(studio.stage.value).toBe('emotion');
  });
  it('keeps the draft when saving fails and can edit an existing work', async () => {
    const studio = useStudio(dependencies({ repository: { list:async()=>[], save:async()=>{throw new DOMException('full','QuotaExceededError')}, rename:async()=>{}, delete:async()=>{} } }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 1; studio.cover.value = coverPresetFor('温柔姐姐'); studio.emotion.value = { label:'温柔姐姐',confidence:.8,explanation:'柔和',scores:{'暴躁老哥':0,'温柔姐姐':1,'阴阳怪气':0,'元气满满':0} };
    studio.features.value = { loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2 };
    await studio.save(); expect(studio.error.value).toContain('保存失败'); expect(studio.draft.audio?.size).toBe(1);
    const existing = { id:'old',title:'旧作品',emotion:'温柔姐姐' as const,confidence:.8,features:{loudness:.2,dynamics:.2,pitch:.4,zeroCrossing:.2,pauseRatio:.3,tempoVariation:.2},audio:new Blob(['a']),duration:1,cover:new Blob(['c']),coverConfig:coverPresetFor('温柔姐姐'),createdAt:'2026-10-05' };
    studio.editMeme(existing); expect(studio.draft.title).toBe('旧作品'); expect(studio.stage.value).toBe('cover');
  });
});

describe('useStudio preview', () => {
  it('plays, pauses and resumes the current selection', async () => {
    const events: string[] = [];
    const preview = { prepare: async () => {}, play: () => { events.push('play'); }, pause: () => { events.push('pause'); }, resume: () => { events.push('resume'); }, stop: () => { events.push('stop'); } };
    const studio = useStudio(dependencies({ preview }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 8; studio.draft.cropStart = 0; studio.draft.cropEnd = 4;
    await studio.togglePreview(); expect(studio.previewState.value).toBe('playing');
    await studio.togglePreview(); expect(studio.previewState.value).toBe('paused');
    await studio.togglePreview(); expect(studio.previewState.value).toBe('playing');
    expect(events.join(',')).toBe('stop,play,pause,resume');
  });
  it('invalidates the playing audition when the range changes during a drag', async () => {
    const ranges: { start: number; end: number }[] = [];
    const preview = { prepare: async () => {}, play: (range: { start: number; end: number }) => { ranges.push(range); }, pause: () => {}, resume: () => {}, stop: () => {} };
    const studio = useStudio(dependencies({ preview }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 8; studio.draft.cropStart = 1; studio.draft.cropEnd = 5;
    await studio.togglePreview();
    expect(studio.previewState.value).toBe('playing');
    studio.updateCropStart(2); studio.updateCropStart(2.5); studio.updateCropEnd(6);
    expect(studio.previewState.value).toBe('ready'); // 旧片段不再被当作当前试听
    await studio.togglePreview();
    expect(ranges).toEqual([{ start: 1, end: 5 }, { start: 2.5, end: 6 }]); // 重新播放的是最新选择
  });
  it('stops the old audition when the source changes and never lets a slower prepare override it', async () => {
    let resolveSlow: (() => void) | undefined;
    const events: string[] = [];
    const flush = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    let calls = 0;
    const preview = {
      prepare: async () => { calls += 1; events.push(`prepare:${calls}`); if (calls === 1) await new Promise<void>((resolve) => { resolveSlow = resolve; }); },
      play: () => {}, pause: () => {}, resume: () => {}, stop: () => { events.push('stop'); },
    };
    const studio = useStudio(dependencies({ preview }));
    const slow = studio.importAudio(new Blob(['slow']));
    await flush();
    const fast = studio.importAudio(new Blob(['fast']));
    await fast; await flush();
    expect(studio.previewState.value).toBe('ready');
    resolveSlow?.(); await slow; await flush();
    expect(studio.previewState.value).toBe('ready'); // 慢的旧准备结果没有覆盖新选择
    expect(events.filter((event) => event === 'stop').length).toBeGreaterThanOrEqual(2); // 每次换音源都结束旧播放
  });
  it('ends playback when leaving the crop stage', async () => {
    const events: string[] = [];
    const preview = { prepare: async () => {}, play: () => { events.push('play'); }, pause: () => {}, resume: () => {}, stop: () => { events.push('stop'); } };
    const studio = useStudio(dependencies({ preview }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 2; studio.draft.cropStart = 0; studio.draft.cropEnd = 2; studio.stage.value = 'crop';
    await studio.togglePreview();
    expect(studio.previewState.value).toBe('playing');
    await studio.analyze();
    expect(events).toContain('stop');
    expect(studio.previewState.value).toBe('idle');
  });
  it('also ends playback when the stage watcher leaves crop', async () => {
    const events: string[] = [];
    const preview = { prepare: async () => {}, play: () => { events.push('play'); }, pause: () => {}, resume: () => {}, stop: () => { events.push('stop'); } };
    const studio = useStudio(dependencies({ preview }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 2; studio.draft.cropStart = 0; studio.draft.cropEnd = 2; studio.stage.value = 'crop';
    await studio.togglePreview();
    studio.stage.value = 'collection'; await nextTick();
    expect(events).toContain('stop');
    expect(studio.previewState.value).toBe('idle');
  });
  it('keeps the crop selection when decoding fails so the user can retry', async () => {
    let attempts = 0;
    const preview = { prepare: async () => { attempts += 1; if (attempts === 1) throw new Error('decode failed'); }, play: () => {}, pause: () => {}, resume: () => {}, stop: () => {} };
    const studio = useStudio(dependencies({ preview }));
    studio.draft.audio = new Blob(['a']); studio.draft.duration = 8; studio.draft.cropStart = 1.5; studio.draft.cropEnd = 6.5;
    await studio.togglePreview();
    expect(studio.previewState.value).toBe('idle');
    expect(studio.error.value).toContain('试听');
    expect(studio.draft.cropStart).toBe(1.5);
    expect(studio.draft.cropEnd).toBe(6.5);
    await studio.togglePreview();
    expect(studio.previewState.value).toBe('playing');
  });
  it('never rewrites the source audio and never changes the work duration by looping', async () => {
    const studio = useStudio(dependencies());
    const source = new Blob(['original']);
    studio.draft.audio = source; studio.draft.duration = 8; studio.draft.cropStart = 1; studio.draft.cropEnd = 5;
    studio.setPreviewLoop(true);
    await studio.togglePreview();
    expect(studio.previewState.value).toBe('playing');
    expect(studio.draft.audio).toBe(source);
    expect(studio.draft.duration).toBe(8);
  });
});
