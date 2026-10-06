import type { AudioFeatures } from '../core/models';
export interface AudioAnalysis { features: AudioFeatures; duration: number }
export interface AudioAnalyzerPort { analyze(blob: Blob): Promise<AudioAnalysis> }
