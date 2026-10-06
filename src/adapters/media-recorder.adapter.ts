import type { RecorderPort } from '../ports/recorder.port';

export interface RecorderLike {
  state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(): void;
  stop(): void;
}
interface RecorderDependencies {
  getUserMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => RecorderLike;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  setInterval: (callback: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
}

const defaults = (): RecorderDependencies => ({
  getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  createRecorder: (stream) => new MediaRecorder(stream) as unknown as RecorderLike,
  setTimeout: (callback, ms) => window.setTimeout(callback, ms), clearTimeout: (id) => window.clearTimeout(id),
  setInterval: (callback, ms) => window.setInterval(callback, ms), clearInterval: (id) => window.clearInterval(id),
});

export class MediaRecorderAdapter implements RecorderPort {
  private recorder?: RecorderLike;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private timeoutId = 0;
  private intervalId = 0;
  private result?: Promise<Blob>;
  private resolveResult?: (blob: Blob) => void;
  private completed?: Blob;
  constructor(private readonly deps: RecorderDependencies = defaults()) {}
  get isRecording() { return this.recorder?.state === 'recording'; }

  async start(onLevel: (level: number) => void): Promise<void> {
    this.stream = await this.deps.getUserMedia();
    this.recorder = this.deps.createRecorder(this.stream);
    this.chunks = [];
    this.completed = undefined;
    this.result = new Promise((resolve) => { this.resolveResult = resolve; });
    this.recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
    this.recorder.onstop = () => {
      this.completed = new Blob(this.chunks, { type: this.chunks[0]?.type || 'audio/webm' });
      this.cleanup();
      this.resolveResult?.(this.completed);
    };
    this.recorder.start();
    this.intervalId = this.deps.setInterval(() => onLevel(.5), 100);
    this.timeoutId = this.deps.setTimeout(() => { void this.stop(); }, 10_000);
  }

  async stop(): Promise<Blob> {
    if (this.completed) return this.completed;
    if (!this.recorder || !this.result) throw new Error('当前没有正在录制的声音');
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    return this.result;
  }

  private cleanup() {
    this.deps.clearTimeout(this.timeoutId);
    this.deps.clearInterval(this.intervalId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }
}
