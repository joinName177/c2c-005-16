import type { CropRange } from './models';

export interface FrameRange { startFrame: number; endFrame: number }

/**
 * 把秒级裁剪范围解析成与解码缓冲区一致的采样帧范围。
 *
 * 试听与裁剪（WAV 编码）共用这一份钳制逻辑，保证“听到什么”与
 * “分析、保存的是什么”逐帧一致：
 * - 先把起点钳到 [0, totalFrames-1]，极短片段至少保留一个采样帧，且永不越过音频终点；
 * - 终点同样按帧取整、钳制，短于一个采样帧的片段自动扩展一个帧；
 * - 超过 10 秒时以起点为锚向后截断（与既有裁剪行为保持一致），
 *   若起点贴近终点导致不足一帧，则退回为终点前最后一个帧。
 */
export function resolveFrameRange(range: CropRange, sampleRate: number, duration: number, maxSeconds = 10): FrameRange {
  const total = Math.max(1, Math.round(duration * sampleRate));
  const startFrame = Math.max(0, Math.min(Math.floor(range.start * sampleRate), total - 1));
  const wantedEnd = Math.max(Math.ceil(range.end * sampleRate), startFrame + 1);
  const cappedEnd = startFrame + Math.floor(maxSeconds * sampleRate);
  const endFrame = Math.min(wantedEnd, cappedEnd, total);
  return { startFrame, endFrame: endFrame > startFrame ? endFrame : Math.min(total, startFrame + 1) };
}

export function frameRangeSeconds(frames: FrameRange, sampleRate: number): CropRange {
  return { start: frames.startFrame / sampleRate, end: frames.endFrame / sampleRate };
}
