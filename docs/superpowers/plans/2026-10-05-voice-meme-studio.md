# 声音表情包工坊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付浏览器内录音、裁剪、情绪识别、Canvas 封面编辑、收藏和分享导出的声音表情包工坊。

**Architecture:** 核心层处理可测试的特征归一化、情绪规则和作品模型；端口隔离录音、Web Audio、Canvas、IndexedDB 与分享能力；Vue 控制器驱动阶段式工作流。音频 Blob 留在浏览器，链接只承载可序列化的卡片预览数据。

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, Vue Test Utils, Web Audio, MediaRecorder, Canvas, IndexedDB, native CSS, Nginx

**Spec:** `docs/superpowers/specs/2026-10-05-voice-meme-studio-design.md`

## Global Constraints

- 录音或最终裁剪时长不得超过 10 秒。
- 不上传声音、不调用远程 AI、不在 URL 中嵌入音频。
- 核心层不得依赖浏览器 API；所有权限和文件操作通过端口。
- 原生 CSS；录音状态不可只用颜色表达。
- Docker 生产端口映射固定为 `8105:80`。

## Review Focus

- 全静音输入：Task 2 测试必须返回低置信度且不得产生 NaN。
- 超过 10 秒导入：Task 3 测试必须要求裁剪并将输出限制到 10 秒。
- 麦克风权限拒绝：Task 4 测试必须转成可恢复的中文错误状态。
- IndexedDB 存储配额失败：Task 4 测试必须保留当前作品并提示未保存。
- Web Share 存在但拒绝文件：Task 4 测试必须回退为下载而非丢失作品。

---

### Task 1: 工程骨架与作品模型

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/vite-env.d.ts`
- Create: `src/core/models.ts`, `src/core/__tests__/models.test.ts`
- Create: `.gitignore`, `.dockerignore`

**Interfaces:**
- Produces: `AudioFeatures`, `EmotionLabel`, `EmotionResult`, `CoverConfig`, `VoiceMeme`, `StudioStage`, `CropRange`, and `validateCropRange(range,duration)`.

- [ ] **Step 1: Write the failing model test** for negative crop start, reversed endpoints and ranges above 10 seconds, plus a valid exact-10-second range.
- [ ] **Step 2: Run the model test** and confirm missing exports fail.
- [ ] **Step 3: Add Vite/Vitest/Vue configuration and implement the domain models and crop validation.**
- [ ] **Step 4: Run `npm test -- models.test.ts` and `npm run build`**; both must exit 0.
- [ ] **Step 5: Commit** with `feat: scaffold voice meme domain`.

### Task 2: 声学特征归一化与情绪规则

**Files:**
- Create: `src/core/feature-normalizer.ts`, `src/core/emotion-engine.ts`, `src/core/cover-presets.ts`
- Test: `src/core/__tests__/feature-normalizer.test.ts`, `src/core/__tests__/emotion-engine.test.ts`

**Interfaces:**
- Produces: `normalizeFeatures(raw): AudioFeatures`, `classifyEmotion(features): EmotionResult`, `coverPresetFor(label): CoverConfig`.

- [ ] **Step 1: Write failing normalization tests** for boundary clamping, missing pitch, all-silence input and finite outputs.
- [ ] **Step 2: Run the normalization test** and confirm feature failures.
- [ ] **Step 3: Implement explicit numeric ranges and silence-safe normalization.**
- [ ] **Step 4: Run the normalization test** and confirm pass.
- [ ] **Step 5: Write failing classification tests** with one canonical feature vector for each of four labels, confidence bounds, explanation text and manual override-compatible output.
- [ ] **Step 6: Run the emotion test** and confirm missing rules fail.
- [ ] **Step 7: Implement deterministic scoring and cover presets.**
- [ ] **Step 8: Run the full suite** and confirm zero failures.
- [ ] **Step 9: Commit** with `feat: add explainable emotion matching`.

### Task 3: 音频分析、录音、裁剪与 Canvas 适配器

**Files:**
- Create: `src/ports/recorder.port.ts`, `audio-analyzer.port.ts`, `audio-cropper.port.ts`, `cover-renderer.port.ts`
- Create: `src/adapters/media-recorder.adapter.ts`, `web-audio-analyzer.adapter.ts`, `web-audio-cropper.adapter.ts`, `canvas-cover-renderer.adapter.ts`
- Test: `src/adapters/__tests__/media-recorder.adapter.test.ts`, `web-audio-cropper.adapter.test.ts`, `canvas-cover-renderer.adapter.test.ts`

**Interfaces:**
- Produces: `RecorderPort.start/onLevel/stop`, `AudioAnalyzerPort.analyze(blob)`, `AudioCropperPort.crop(blob,range)`, `CoverRendererPort.render(config,target): Promise<Blob>`.

- [ ] **Step 1: Write failing recorder tests** for emitted levels, manual stop, automatic stop at 10 seconds and cleanup of media tracks.
- [ ] **Step 2: Run the recorder test** and confirm missing adapter fails.
- [ ] **Step 3: Implement MediaRecorder with injected clock/media devices for deterministic tests.**
- [ ] **Step 4: Run the recorder test** and confirm pass.
- [ ] **Step 5: Write failing crop/analyzer tests** for duration inspection, overlength import requiring crop, and encoded output capped at 10 seconds.
- [ ] **Step 6: Implement Web Audio decode, feature extraction and offline crop rendering.**
- [ ] **Step 7: Write failing Canvas tests** for selected ratio, filter, bubble text and PNG blob output; implement renderer.
- [ ] **Step 8: Run the full suite** and confirm zero failures.
- [ ] **Step 9: Commit** with `feat: add browser audio and cover adapters`.

### Task 4: 收藏、分享端口与工作流控制器

**Files:**
- Create: `src/ports/meme-repository.port.ts`, `share.port.ts`
- Create: `src/adapters/indexeddb-meme.repository.ts`, `browser-share.adapter.ts`, `share-link.adapter.ts`
- Create: `src/ui/useStudio.ts`
- Test: `src/adapters/__tests__/indexeddb-meme.repository.test.ts`, `browser-share.adapter.test.ts`, `share-link.adapter.test.ts`, `src/ui/__tests__/useStudio.test.ts`

**Interfaces:**
- Produces: repository CRUD; `SharePort.share(meme): Promise<'shared'|'downloaded'>`; `encodePreview(config): string`; `decodePreview(fragment): PreviewPayload|null`; `useStudio(deps)` stage actions.

- [ ] **Step 1: Write failing repository tests** for Blob round trip, rename/delete and quota failure surfaced without clearing draft.
- [ ] **Step 2: Implement IndexedDB repository and run its test to green.**
- [ ] **Step 3: Write failing share tests** for serializable preview round trip, malformed fragment, successful file share and rejected-file fallback download.
- [ ] **Step 4: Implement URL-fragment and share/download adapters; run share tests to green.**
- [ ] **Step 5: Write failing workflow tests** for permission denial, recording-to-crop transition, analysis, manual label override, save success/failure and edit-existing flow.
- [ ] **Step 6: Implement the stage controller with explicit recoverable error states.**
- [ ] **Step 7: Run the full suite** and confirm zero failures.
- [ ] **Step 8: Commit** with `feat: add voice meme workflow and persistence`.

### Task 5: Vue 录音室、封面工坊与作品集

**Files:**
- Create: `src/ui/App.vue`, `src/ui/components/RecorderPanel.vue`, `CropTimeline.vue`, `EmotionPanel.vue`, `CoverWorkshop.vue`, `MemeGallery.vue`, `SharePanel.vue`, `WaveformMeter.vue`
- Create: `src/ui/styles.css`
- Test: `src/ui/__tests__/App.test.ts`

**Interfaces:**
- Consumes: `useStudio`; CoverWorkshop edits `CoverConfig`; gallery emits play/edit/delete/filter actions.

- [ ] **Step 1: Write failing component tests** for stage labels, permission error, 10-second counter, manual emotion selection, cover text editing, save and gallery filter.
- [ ] **Step 2: Run the component test** and confirm missing components fail.
- [ ] **Step 3: Implement the responsive, keyboard-accessible studio and native-CSS visual system.**
- [ ] **Step 4: Run component and full tests** and confirm zero failures.
- [ ] **Step 5: Add download/share controls and disclosure that generated links exclude audio; assert the copy in the component test.**
- [ ] **Step 6: Run `npm run build`** and confirm exit 0.
- [ ] **Step 7: Commit** with `feat: build voice meme studio interface`.

### Task 6: 容器化、文档与最终重构

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `nginx.conf`, `README.md`
- Modify: files identified by cohesion review only within this project.

**Interfaces:**
- Produces: reproducible Nginx image and documented privacy/browser requirements.

- [ ] **Step 1: Review dependency directions and split any UI/browser adapter with more than one responsibility; keep tests green after each extraction.**
- [ ] **Step 2: Document microphone permission, HTTPS browser requirement, local privacy, unsupported APIs and export fallbacks.**
- [ ] **Step 3: Add multi-stage Docker/Nginx configuration.**
- [ ] **Step 4: Run `npm test`, `npm run build`, and `docker build -t c2c-005 .`**; all must exit 0.
- [ ] **Step 5: Inspect `git diff --check` and `git status --short`.**
- [ ] **Step 6: Commit** with `chore: finalize voice meme studio delivery`.
