/**
 * 造境 ZaoJing — 粒子与饱和度渲染工具函数（共享）
 * 提取自 poster-engine.ts 与 poster-worker.js 的重复定义
 * 供主线程与 Web Worker 共享
 */

/**
 * 绘制情绪化粒子（leaf / sparkle / rain / fog / star 5 类）
 * 统一采用 Worker 版本的更安全检查：type 为 'none' 或 undefined 时直接返回
 */
function drawParticles(
  ctx: CanvasRenderingContext2D,
  type: string | undefined,
  count: number,
  color: string,
  w: number,
  h: number
): void {
  if (count <= 0 || type === 'none' || type === undefined) return;
  ctx.save();
  switch (type) {
    case 'leaf':
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = 4 + Math.random() * 8;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3 + Math.random() * 0.3;
        ctx.beginPath();
        ctx.ellipse(x, y, size, size * 0.4, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'sparkle':
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = 1 + Math.random() * 3;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.4 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        if (size > 2) {
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(x - size * 3, y);
          ctx.lineTo(x + size * 3, y);
          ctx.moveTo(x, y - size * 3);
          ctx.lineTo(x, y + size * 3);
          ctx.stroke();
        }
      }
      break;
    case 'rain':
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (let i = 0; i < count * 3; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const len = 10 + Math.random() * 20;
        ctx.globalAlpha = 0.2 + Math.random() * 0.3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2, y + len);
        ctx.stroke();
      }
      break;
    case 'fog':
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const radius = 40 + Math.random() * 80;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.15 + Math.random() * 0.15;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'star':
      for (let i = 0; i < count; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const size = 0.5 + Math.random() * 2.5;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 2);
        ctx.lineTo(x + size * 0.5, y - size * 0.5);
        ctx.lineTo(x + size * 2, y);
        ctx.lineTo(x + size * 0.5, y + size * 0.5);
        ctx.lineTo(x, y + size * 2);
        ctx.lineTo(x - size * 0.5, y + size * 0.5);
        ctx.lineTo(x - size * 2, y);
        ctx.lineTo(x - size * 0.5, y - size * 0.5);
        ctx.closePath();
        ctx.fill();
      }
      break;
  }
  ctx.restore();
}

/** 饱和度调整：saturation 低于 0.4 时整体去饱和 */
function applySaturation(ctx: CanvasRenderingContext2D, w: number, h: number, saturation: number): void {
  if (saturation >= 0.4) return;
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = `hsla(0, 0%, 50%, ${(0.4 - saturation) * 0.5})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export { drawParticles, applySaturation };
