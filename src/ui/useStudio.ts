import { reactive, ref } from 'vue';
import { classifyEmotion } from '../core/emotion-engine';
import { coverPresetFor } from '../core/cover-presets';
import type { AudioFeatures, CoverConfig, EmotionLabel, EmotionResult, StudioStage, VoiceMeme } from '../core/models';
import type { RecorderPort } from '../ports/recorder.port';
import type { AudioAnalyzerPort } from '../ports/audio-analyzer.port';
import type { AudioCropperPort } from '../ports/audio-cropper.port';
import type { AudioPreviewPort } from '../ports/audio-preview.port';
import type { CoverRendererPort } from '../ports/cover-renderer.port';
import type { MemeRepository } from '../ports/meme-repository.port';
import type { SharePort } from '../ports/share.port';
import { PreviewStaleError } from '../adapters/web-audio-preview.adapter';

export interface StudioDependencies { recorder: RecorderPort; analyzer: AudioAnalyzerPort; cropper: AudioCropperPort; preview: AudioPreviewPort; renderer: CoverRendererPort; repository: MemeRepository; share: SharePort }
export interface PreviewState { ready: boolean; playing: boolean; paused: boolean; looping: boolean; duration: number; error: string }
export function useStudio(deps: StudioDependencies) {
  const stage = ref<StudioStage>('record'); const error = ref(''); const notice = ref(''); const level = ref(0);
  const draft = reactive<{ id?: string; title: string; audio?: Blob; duration: number; cropStart: number; cropEnd: number }>({ title: '我的声音表情', duration: 0, cropStart: 0, cropEnd: 0 });
  const emotion = ref<EmotionResult>(); const features = ref<AudioFeatures>(); const cover = ref<CoverConfig>(coverPresetFor('元气满满')); const collection = ref<VoiceMeme[]>([]);
  const preview = reactive<PreviewState>({ ready: false, playing: false, paused: false, looping: true, duration: 0, error: '' });
  /** 每次 prepare 的代号：范围拖动、换音源都会前进，旧准备结果迟到时直接丢弃。 */
  let prepareToken = 0;

  function resetPlayback() { preview.playing = false; preview.paused = false; }

  async function preparePreview() {
    if (!draft.audio) return;
    const token = ++prepareToken;
    deps.preview.stop();
    resetPlayback(); preview.error = ''; preview.ready = false;
    try {
      const result = await deps.preview.prepare(draft.audio, { start: draft.cropStart, end: draft.cropEnd });
      if (token !== prepareToken) return; // 更慢的旧准备结果不得覆盖新选择
      if (result.status === 'failed') { preview.error = result.error; return; } // 解码失败：范围选择保留，可直接重试
      preview.ready = true; preview.duration = result.duration;
    } catch (cause) {
      if (cause instanceof PreviewStaleError || token !== prepareToken) return;
      preview.error = cause instanceof Error ? cause.message : '试听准备失败';
    }
  }

  // 拖动过程中只断开旧播放（不重新解码）；连续拖动结束后由组件再触发 preparePreview。
  function invalidatePreview() { prepareToken += 1; deps.preview.stop(); resetPlayback(); preview.ready = false; }
  function updateCropStart(value: number) { draft.cropStart = value; invalidatePreview(); }
  function updateCropEnd(value: number) { draft.cropEnd = value; invalidatePreview(); }

  async function togglePreview() {
    if (!draft.audio) { preview.error = '请先录制或导入一段声音'; return; }
    if (preview.playing && !preview.paused) { await deps.preview.pause(); preview.paused = true; return; }
    if (preview.paused) { await deps.preview.resume(preview.looping); preview.paused = false; return; }
    preview.error = '';
    const range = { start: draft.cropStart, end: draft.cropEnd };
    // 尚未准备好（例如刚解码失败后点试听）：直接走播放路径，失败时保留当前选择供重试。
    await deps.preview.play(draft.audio, range, preview.looping).catch((cause) => { preview.error = cause instanceof Error ? cause.message : '试听失败'; });
    if (!preview.error) { preview.playing = true; preview.paused = false; preview.ready = true; void deps.preview.ended().then(() => { if (!preview.looping) resetPlayback(); }); }
  }
  function stopPreview() { prepareToken += 1; deps.preview.stop(); resetPlayback(); }
  function toggleLoop() {
    preview.looping = !preview.looping;
    deps.preview.setLoop(preview.looping);
    // 循环只改变播放方式：不重新裁剪、不生成音频，作品时长始终等于选择范围。
  }

  async function startRecording() { error.value = ''; try { await deps.recorder.start((value) => { level.value = value; }); notice.value = '正在录音，最长 10 秒'; } catch { error.value = '无法使用麦克风权限，请在浏览器设置中允许访问或导入音频。'; } }
  async function stopRecording() { try { const blob = await deps.recorder.stop(); stopPreview(); draft.audio = blob; const info = await deps.cropper.inspect(draft.audio); draft.duration = info.duration; draft.cropStart = 0; draft.cropEnd = Math.min(10, info.duration); stage.value = 'crop'; notice.value = info.needsCrop ? '音频超过 10 秒，请选择保留片段' : '录音完成，可以试听并分析'; void preparePreview(); } catch (cause) { error.value = cause instanceof Error ? cause.message : '录音结束失败'; } }
  async function importAudio(blob: Blob) { stopPreview(); draft.audio = blob; const info = await deps.cropper.inspect(blob); draft.duration = info.duration; draft.cropStart = 0; draft.cropEnd = Math.min(10, info.duration); stage.value = 'crop'; void preparePreview(); }
  async function analyze() {
    if (!draft.audio) { error.value = '请先录制或导入一段声音'; return; }
    // 离开裁剪页：结束旧播放，避免分析、保存期间继续出声。
    stopPreview();
    const cropped = await deps.cropper.crop(draft.audio, { start: draft.cropStart, end: draft.cropEnd }); draft.audio = cropped.blob; draft.duration = cropped.duration; const result = await deps.analyzer.analyze(cropped.blob); features.value = result.features; emotion.value = classifyEmotion(result.features); cover.value = coverPresetFor(emotion.value.label); stage.value = 'emotion';
  }
  function selectEmotion(label: EmotionLabel) { const current = emotion.value ?? classifyEmotion({ loudness:0,dynamics:0,pitch:0,zeroCrossing:0,pauseRatio:1,tempoVariation:0 }); emotion.value = { ...current, label, explanation: `已手动选择「${label}」标签。` }; cover.value = { ...coverPresetFor(label), title: cover.value.title || label }; }
  function goCover() { stage.value = 'cover'; }
  async function save(target?: HTMLCanvasElement) { if (!draft.audio || !emotion.value || !features.value) { error.value = '作品信息尚未完整，请先完成声音分析'; return; } try { const coverBlob = await deps.renderer.render(cover.value, target); const meme: VoiceMeme = { id: draft.id ?? `meme-${Date.now()}`, title: draft.title.trim() || '未命名声音', emotion: emotion.value.label, confidence: emotion.value.confidence, features: features.value, audio: draft.audio, duration: draft.duration, cover: coverBlob, coverConfig: { ...cover.value }, createdAt: new Date().toISOString() }; await deps.repository.save(meme); await loadCollection(); stage.value = 'collection'; notice.value = '作品已保存到本地'; } catch { error.value = '保存失败，本次编辑内容仍保留，请检查浏览器存储空间。'; } }
  async function loadCollection() { collection.value = (await deps.repository.list()).sort((a,b) => b.createdAt.localeCompare(a.createdAt)); }
  function editMeme(meme: VoiceMeme) { stopPreview(); Object.assign(draft, { id:meme.id,title:meme.title,audio:meme.audio,duration:meme.duration,cropStart:0,cropEnd:meme.duration }); features.value = meme.features; emotion.value = { label:meme.emotion,confidence:meme.confidence,explanation:'编辑已保存作品',scores:{'暴躁老哥':0,'温柔姐姐':0,'阴阳怪气':0,'元气满满':0} }; cover.value = { ...meme.coverConfig }; stage.value = 'cover'; }
  async function deleteMeme(id: string) { await deps.repository.delete(id); await loadCollection(); }
  async function shareMeme(meme: VoiceMeme) { const result = await deps.share.share(meme); notice.value = result === 'shared' ? '已打开系统分享' : '浏览器不支持文件分享，已下载音频和封面'; }
  function newRecording() { stopPreview(); draft.id = undefined; draft.title = '我的声音表情'; draft.audio = undefined; emotion.value = undefined; features.value = undefined; stage.value = 'record'; error.value = ''; }
  return { stage,error,notice,level,draft,emotion,features,cover,collection,preview,preparePreview,updateCropStart,updateCropEnd,togglePreview,stopPreview,toggleLoop,startRecording,stopRecording,importAudio,analyze,selectEmotion,goCover,save,loadCollection,editMeme,deleteMeme,shareMeme,newRecording };
}
