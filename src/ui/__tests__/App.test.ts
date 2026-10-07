import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import App from '../App.vue';
import type { StudioDependencies } from '../useStudio';
import type { AudioPreviewPort } from '../../ports/audio-preview.port';
import type { VoiceMeme } from '../../core/models';

function fakePreview(): AudioPreviewPort & { plays: Array<{ blob: Blob; range: { start: number; end: number }; loop: boolean }>; stops: number } {
  const plays: Array<{ blob: Blob; range: { start: number; end: number }; loop: boolean }> = [];
  return {
    plays, stops: 0,
    prepare: vi.fn(async () => ({ status: 'ready' as const, duration: 2 })),
    play: vi.fn(async (blob, range, loop) => { plays.push({ blob, range, loop }); }),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    setLoop: vi.fn(),
    stop: vi.fn(function (this: { stops: number }) { this.stops += 1; }),
    ended: vi.fn(() => new Promise<void>(() => {})),
  };
}

function deps(options: { denied?: boolean } = {}): StudioDependencies {
  const works: VoiceMeme[] = [];
  return {
    recorder:{isRecording:false,start:async()=>{if(options.denied)throw new DOMException('denied','NotAllowedError')},stop:async()=>new Blob(['voice'],{type:'audio/webm'})},
    analyzer:{analyze:async()=>({duration:2,features:{loudness:.75,dynamics:.55,pitch:.8,zeroCrossing:.62,pauseRatio:.12,tempoVariation:.6}})},
    cropper:{inspect:async()=>({duration:2,needsCrop:false}),crop:async(blob,range)=>({blob,duration:range.end-range.start})},
    preview:fakePreview(),
    renderer:{render:async()=>new Blob(['cover'],{type:'image/png'})},
    repository:{list:async()=>works,save:async(m)=>{works.push(m)},rename:async()=>{},delete:async(id)=>{const i=works.findIndex(w=>w.id===id);if(i>=0)works.splice(i,1)}},
    share:{share:async()=> 'shared'},
  };
}

async function nextTicks(times = 4) { for (let i = 0; i < times; i += 1) await Promise.resolve(); }

describe('Voice meme App', () => {
  it('shows the studio stages, time limit and sharing disclosure', () => {
    const wrapper = mount(App,{props:{dependencies:deps()}});
    expect(wrapper.text()).toContain('声音表情包工坊');
    expect(wrapper.text()).toContain('00:10 MAX');
    expect(wrapper.text()).toContain('分享链接不包含原始声音');
  });
  it('shows a recoverable microphone permission error', async () => {
    const wrapper=mount(App,{props:{dependencies:deps({denied:true})}}); await wrapper.get('[data-testid="record"]').trigger('click'); await Promise.resolve();
    expect(wrapper.text()).toContain('麦克风权限');
  });
  it('creates, labels, edits and saves a work to the gallery', async () => {
    const wrapper=mount(App,{props:{dependencies:deps()}}); await wrapper.get('[data-testid="record"]').trigger('click'); await wrapper.get('[data-testid="stop"]').trigger('click'); await nextTicks();
    await wrapper.get('[data-testid="analyze"]').trigger('click'); await nextTicks(); await wrapper.get('[data-emotion="温柔姐姐"]').trigger('click'); expect(wrapper.text()).toContain('已手动选择');
    await wrapper.get('[data-testid="to-cover"]').trigger('click'); await wrapper.get('[aria-label="气泡文字"]').setValue('轻轻说一句'); await wrapper.get('[data-testid="save-work"]').trigger('click'); await nextTicks();
    expect(wrapper.text()).toContain('作品集'); expect(wrapper.text()).toContain('我的声音表情');
  });

  it('auditions the current range with pause and loop controls', async () => {
    const provided = deps();
    const preview = provided.preview as ReturnType<typeof fakePreview>;
    const wrapper = mount(App, { props: { dependencies: provided } });
    await wrapper.get('[data-testid="record"]').trigger('click');
    await wrapper.get('[data-testid="stop"]').trigger('click');
    await nextTicks();
    const startInput = wrapper.findAll('input[type="range"]')[0]!;
    await startInput.setValue('1');
    await startInput.trigger('change');
    await nextTicks();
    await wrapper.get('[data-testid="preview-toggle"]').trigger('click');
    await nextTicks();
    expect(preview.plays.at(-1)?.range).toEqual({ start: 1, end: 2 });
    await wrapper.get('[data-testid="preview-toggle"]').trigger('click');
    expect(preview.pause).toHaveBeenCalledTimes(1);
    await wrapper.get('[data-testid="preview-loop"]').trigger('click');
    expect(preview.setLoop).toHaveBeenCalledWith(false);
    expect(wrapper.text()).toContain('与分析、保存的声音一致');
  });

  it('stops the old audition on continuous drags and ends playback when leaving the crop page', async () => {
    const provided = deps();
    const preview = provided.preview as ReturnType<typeof fakePreview>;
    const wrapper = mount(App, { props: { dependencies: provided } });
    await wrapper.get('[data-testid="record"]').trigger('click');
    await wrapper.get('[data-testid="stop"]').trigger('click');
    await nextTicks();
    await wrapper.get('[data-testid="preview-toggle"]').trigger('click');
    await nextTicks();
    const startInput = wrapper.findAll('input[type="range"]')[0]!;
    const stopsBefore = preview.stops;
    await startInput.setValue('0.5');
    await startInput.setValue('0.8'); // 连续拖动：旧片段必须被停止，且不会继续作为当前试听
    expect(preview.stops).toBeGreaterThan(stopsBefore);
    expect(preview.plays).toHaveLength(1); // 拖动本身不触发播放
    await wrapper.get('[data-testid="analyze"]').trigger('click');
    await nextTicks();
    expect(preview.stops).toBeGreaterThan(stopsBefore + 1); // 离开裁剪页结束旧播放
  });

  it('auditions the new source after switching audio, not the old decoded clip', async () => {
    const provided = deps();
    const preview = provided.preview as ReturnType<typeof fakePreview>;
    const wrapper = mount(App, { props: { dependencies: provided } });
    // 先导入一段音源（停留在裁剪页）
    const importedA = new Blob(['imported-a'], { type: 'audio/webm' });
    const fileInput = wrapper.get('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', { value: [importedA], configurable: true });
    await fileInput.trigger('change');
    await nextTicks();
    await wrapper.get('[data-testid="preview-toggle"]').trigger('click');
    await nextTicks();
    expect(preview.plays.at(-1)!.blob).toBe(importedA);
    // 换音源：旧播放必须结束，随后听到的是新音源的缓冲而不是旧解码片段
    const importedB = new Blob(['imported-b'], { type: 'audio/webm' });
    const studio = (wrapper.vm as unknown as { studio: { importAudio(b: Blob): Promise<void> } }).studio;
    await studio.importAudio(importedB);
    await nextTicks();
    await wrapper.get('[data-testid="preview-toggle"]').trigger('click');
    await nextTicks();
    expect(preview.plays.at(-1)!.blob).toBe(importedB);
    expect(preview.plays.at(-1)!.blob).not.toBe(importedA);
  });
});
