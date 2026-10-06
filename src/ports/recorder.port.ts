export interface RecorderPort {
  start(onLevel: (level: number) => void): Promise<void>;
  stop(): Promise<Blob>;
  readonly isRecording: boolean;
}
