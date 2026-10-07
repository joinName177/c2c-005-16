import type { CropRange } from '../core/models';

export interface AudioPreviewPort {
  /** 解码并缓存音源供按范围试听；并发调用时以最新一次为准 */
  prepare(blob: Blob): Promise<void>;
  /** 按范围从头播放；loop 只改变播放方式，不改变任何时长数据 */
  play(range: CropRange, loop: boolean): void;
  /** 暂停并记住片段内位置 */
  pause(): void;
  /** 从暂停位置继续 */
  resume(): void;
  /** 结束播放并释放缓存的音源（离开裁剪页或换音源时调用） */
  stop(): void;
  /** 非循环播放自然结束时回调 */
  onended?: () => void;
}
