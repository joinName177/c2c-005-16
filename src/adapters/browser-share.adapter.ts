import type { VoiceMeme } from '../core/models';
import type { SharePort } from '../ports/share.port';
interface Dependencies { canShare(data: ShareData): boolean; share(data: ShareData): Promise<void>; download(blob: Blob, name: string): void }
const extension = (type: string, fallback: string) => type.includes('wav') ? 'wav' : type.includes('mpeg') ? 'mp3' : fallback;
const defaults = (): Dependencies => ({
  canShare: (data) => Boolean(navigator.canShare?.(data)), share: (data) => navigator.share(data),
  download: (blob, name) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); },
});
export class BrowserShareAdapter implements SharePort {
  constructor(private readonly deps: Dependencies = defaults()) {}
  async share(meme: VoiceMeme): Promise<'shared'|'downloaded'> {
    const files = [new File([meme.audio], `${meme.title}.${extension(meme.audio.type, 'webm')}`, { type: meme.audio.type }), new File([meme.cover], `${meme.title}.png`, { type: 'image/png' })];
    try { if (this.deps.canShare({ files })) { await this.deps.share({ title: meme.title, text: `声音表情包 · ${meme.emotion}`, files }); return 'shared'; } } catch { /* download fallback */ }
    this.deps.download(meme.audio, files[0].name); this.deps.download(meme.cover, files[1].name); return 'downloaded';
  }
}
