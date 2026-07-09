/**
 * 造境 ZaoJing — 情绪化渲染工具函数（共享）
 * 提取自 poster-engine.ts 与 poster-worker.js 的重复定义
 * 供主线程与 Web Worker 共享
 */

import type { MergedVisual } from '../../data';
import type { DirectorColors } from '../../types.d.ts';
import { blendColor } from './color.js';
import { drawParticles, applySaturation } from './particles.js';
import { drawVignette } from '../../utils/canvas.js';

/** 情绪化渲染上下文：Canvas 降级时由 generate() 构建并传入渲染器 */
export interface RenderContext {
  emotion: string;
  merged: MergedVisual;
  directorColors: DirectorColors;
  text: string;
  moodTagId: string | null;
}

/** 绘制情绪化渐变背景：导演配色 × 情绪色混合 */
function paintEmotionGradient(ctx: CanvasRenderingContext2D, w: number, h: number, rc: RenderContext): void {
  const { merged: mv, directorColors: dc } = rc;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, blendColor(dc.primary, mv.bgColor[0], mv.adjustedLightness));
  grad.addColorStop(0.5, blendColor(dc.secondary, mv.bgColor[1], mv.adjustedLightness));
  grad.addColorStop(1, blendColor(dc.bg, mv.bgColor[2], mv.adjustedLightness));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/** 叠加情绪化粒子、暗角与饱和度调整 */
function applyEmotionOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, mv: MergedVisual): void {
  drawParticles(ctx, mv.particleType, mv.adjustedParticleCount, mv.accentColor, w, h);
  drawVignette(ctx, w, h, mv.adjustedVignette);
  applySaturation(ctx, w, h, mv.saturation);
}

export { paintEmotionGradient, applyEmotionOverlay };
