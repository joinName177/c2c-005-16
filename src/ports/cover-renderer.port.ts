import type { CoverConfig } from '../core/models';
export interface CoverRendererPort { render(config: CoverConfig, target?: HTMLCanvasElement): Promise<Blob> }
