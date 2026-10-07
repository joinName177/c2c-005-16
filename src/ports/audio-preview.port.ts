import type { CropRange } from '../core/models';

export type PreviewPreparation =
  | { status: 'ready'; duration: number }
  | { status: 'failed'; error: string };

/**
 * 试听端口：在**同一份已解码原声音频**上按裁剪范围控制播放，
 * 不为每次拖动生成独立片段。范围变化、换音源、离开裁剪页时
 * 由上层调用 stop，旧的异步准备结果通过序号机制失效。
 */
export interface AudioPreviewPort {
  /** 准备音源（只解码一次，重复调用同一 Blob 命中缓存）。旧音源/旧范围的迟到结果会抛出 STALE。 */
  prepare(blob: Blob, range: CropRange): Promise<PreviewPreparation>;
  /** 从范围起点播放；loop 为 true 时在范围内循环。循环只重复播放，不产生任何新的音频数据。 */
  play(blob: Blob, range: CropRange, loop: boolean): Promise<void>;
  /** 暂停：挂起音频时钟，恢复后定位误差为 0（不会漂移到范围外）。 */
  pause(): Promise<void>;
  /** 从暂停位置继续；若循环开关在暂停期间变化，按新循环方式继续。 */
  resume(loop: boolean): Promise<void>;
  /** 结束本次试听并复位播放位置；序号前进，使进行中的旧准备结果失效。 */
  stop(): void;
  /** 播放中途切换循环开关（立即生效，不重新调度、不生成新音频）。 */
  setLoop(loop: boolean): void;
  /** 播放（含循环中的每一遍）自然结束时解析，stop 后不再触发。 */
  ended(): Promise<void>;
}
