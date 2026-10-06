import type { CoverConfig } from '../core/models';
import type { CoverRendererPort } from '../ports/cover-renderer.port';
export class CanvasCoverRendererAdapter implements CoverRendererPort {
  constructor(private readonly createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {}
  async render(config: CoverConfig, target?: HTMLCanvasElement): Promise<Blob> {
    const canvas = target ?? this.createCanvas(); canvas.width = 900; canvas.height = config.ratio === 'portrait' ? 1200 : 900;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('当前浏览器无法创建 Canvas');
    ctx.fillStyle = config.palette[0]; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = config.filter === 'mono' ? .45 : .72; ctx.fillStyle = config.palette[1]; ctx.fillRect(60, 60, canvas.width - 120, canvas.height - 120); ctx.globalAlpha = 1;
    ctx.strokeStyle = config.palette[2]; ctx.lineWidth = 14; ctx.beginPath(); for (let x = 0; x <= canvas.width; x += 30) { const y = canvas.height * .43 + Math.sin(x / 35) * 62; if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke();
    ctx.fillStyle = config.palette[2]; ctx.font = '900 92px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(config.title, canvas.width / 2, canvas.height * .3);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 42px sans-serif'; ctx.fillText(config.bubbleText, canvas.width * config.bubbleX / 100, canvas.height * config.bubbleY / 100);
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('封面导出失败')), 'image/png'));
  }
}
