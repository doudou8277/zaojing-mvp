/**
 * 造境 ZaoJing — 海报排版引擎 v1.0
 * 基于 Canvas 2D API + AI 生成图生成电影感海报
 * 支持：AI生图背景 / Canvas风格背景 + 字体切换 + 自定义标题/金句 + 4 种版式
 */

import { DIRECTORS, extractTitle, POSTER_FORMATS, getQuoteByIndex, getRandomQuote, mergeEmotionAndText, type MergedVisual } from './data';
import { FALLBACK_MOVIES } from './movie-data.js';
import { hexToRgba, drawVignette } from './utils/canvas.js';
import { logger } from './utils/logger.js';
import { safeRevokeUrl } from './utils/sanitize.js';
import { blendColor } from './poster/shared/color.js';
import { paintEmotionGradient, applyEmotionOverlay, type RenderContext } from './poster/shared/emotion-render.js';
import {
  API_TIMEOUT_WORKER,
  TITLE_FONT_RATIO_V,
  TITLE_FONT_RATIO_H,
  TITLE_ENERGY_SCALE,
  QUOTE_FONT_RATIO_V,
  QUOTE_FONT_RATIO_H,
  CREDIT_FONT_RATIO_V,
  CREDIT_FONT_RATIO_H,
  TEXT_SHADOW_BLUR,
  TEXT_SHADOW_OFFSET_Y,
  BRAND_WATERMARK_TEXT,
  BRAND_WATERMARK_FONT_RATIO,
  BRAND_WATERMARK_ALPHA,
  BRAND_WATERMARK_Y_RATIO,
  VIGNETTE_INTENSITY_AI,
  VIGNETTE_INTENSITY_CANVAS,
} from './utils/constants.js';

// ========== 依赖注入：getServerMovies ==========
// 原本静态 import { getServerMovies } from './movie-module.js' 会形成
// movie-module ↔ poster-engine 的循环依赖，导致 Rollup 将两文件合并为
// 同一 chunk 并在首屏被 modulepreload。改为 setter 注入：由 movie-module
// 在初始化时调用 setGetServerMovies 注入实现，打破循环依赖。
let _getServerMovies: (() => any[]) | null = null;
export function setGetServerMovies(fn: (() => any[]) | null) { _getServerMovies = fn; }
import type { DirectorColors, PosterFormat, StyleDNA } from './types.d.ts';

// ========== 局部类型定义 ==========

/** 电影数据接口（兼容 JS 推断类型，movie-data.js 中的 styleDNA 值不严格匹配 StyleDNA 联合类型） */
interface Movie {
  id: string;
  title: string;
  enTitle?: string;
  director: string;
  releaseDate: string;
  posterUrl: string;
  visualStyle: string;
  styleDNA: Record<string, string>;
  colors: DirectorColors;
  stylePrompt: string;
  negativePrompt?: string;
  fontFamily: string;
  titleWeight: number;
  iconicQuotes: string[];
  signatureScenes?: string[];
}

/** 风格来源（导演或电影），Director 可直接赋值给此类型 */
interface StyleSource {
  id: string;
  name: string;
  colors: DirectorColors;
  styleDNA: Record<string, string>;
  fontFamily: string;
  titleWeight: number;
  promptCore: string;
  quotes: string[];
  isMovie?: boolean;
  movieRef?: { id: string; title: string; posterUrl: string; styleDNA: Record<string, string> };
}

/** generate 函数选项 */
interface GenerateOptions {
  text: string;
  directorId?: string;
  movieId?: string;
  customDNA?: Record<string, string> | null;
  customColors?: DirectorColors | null;
  customPrompt?: string | null;
  swapLabel?: string | null;
  moodTagId?: string | null;
  format?: PosterFormat;
  showQuote?: boolean;
  title?: string;
  quote?: string;
  quoteIndex?: number;
  aiImageUrl?: string | null;
  emotion?: string;
  /** 自定义字体族（覆盖导演/电影默认字体） */
  customFontFamily?: string | null;
  /** 自定义标题字重（覆盖导演/电影默认字重） */
  customTitleWeight?: number | null;
}

/** 海报生成结果（各 generate 函数的返回类型） */
interface PosterGenerateResult {
  dataUrl: string;
  title?: string;
  quote?: string;
  director?: string;
  directorId?: string;
  format: string;
  width: number;
  height: number;
  usedAI?: boolean;
  movieRef?: { id: string; title: string; posterUrl: string; styleDNA: Record<string, string> } | null;
  movieTitle?: string;
  movieEnTitle?: string;
  isQuoteCard?: boolean;
  isComicStrip?: boolean;
  isSceneRecreation?: boolean;
  isGuessPoster?: boolean;
  isCharacterMeme?: boolean;
  panelCount?: number;
  originalScene?: string;
  sceneDescription?: string;
  movieId?: string;
  hintLevel?: number;
  characterName?: string;
  memeType?: string;
}

/** generateGrid9 选项 */
interface GenerateGrid9Options {
  text: string;
  directorIds: string[];
  moodTagId?: string | null;
  showQuote?: boolean;
  title?: string;
}

/** drawTextLayer 选项 */
interface DrawTextLayerOptions {
  title: string;
  quote: string;
  directorName: string;
  colors: DirectorColors;
  format: PosterFormat;
  fontFamily?: string;
  titleWeight?: number;
  /** 情绪化合并参数（驱动标题位置/大小/阴影色） */
  merged?: MergedVisual;
}

/** generateQuoteCard 选项 */
interface GenerateQuoteCardOptions {
  quote: string;
  movieTitle?: string;
  movieEnTitle?: string;
  colors?: DirectorColors;
  fontFamily?: string;
  format?: PosterFormat;
}

/** generateComicStrip 选项 */
interface GenerateComicStripOptions {
  scenes: { text: string; title?: string }[];
  movieId?: string;
  colors?: DirectorColors;
  fontFamily?: string;
  stylePrompt?: string;
}

/** generateSceneRecreation 选项 */
interface GenerateSceneRecreationOptions {
  sceneDescription: string;
  movieTitle: string;
  originalScene?: string;
  colors?: DirectorColors;
  fontFamily?: string;
  stylePrompt?: string;
  format?: PosterFormat;
  movieId?: string;
  styleDNA?: Record<string, string>;
  customTitle?: string;
}

/** generateGuessPoster 选项 */
interface GenerateGuessPosterOptions {
  movieId: string;
  colors?: DirectorColors;
  fontFamily?: string;
  stylePrompt?: string;
  hintLevel?: number;
}

/** generateCharacterMeme 选项 */
interface GenerateCharacterMemeOptions {
  movieId: string;
  characterName?: string;
  memeText?: string;
  memeType?: 'dialogue' | 'parody' | 'reaction';
  colors?: DirectorColors;
  fontFamily?: string;
}

// ========== Web Worker 支持（自动检测，不支持时降级为主线程） ==========
let _worker: Worker | null = null;
let _workerSupported = typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined';
let _requestId = 0;
const _pendingRequests = new Map<number, { resolve: (buffer: ArrayBuffer) => void; reject: (err: Error) => void }>();

function getWorker(): Worker | null {
  if (!_workerSupported) return null;
  if (!_worker) {
    try {
      _worker = new Worker(new URL('./poster-worker.js', import.meta.url), { type: 'module' });
      _worker.onmessage = function(e: MessageEvent) {
        const { id, success, buffer, error } = e.data;
        const pending = _pendingRequests.get(id);
        if (!pending) return;
        _pendingRequests.delete(id);
        if (success) {
          pending.resolve(buffer);
        } else {
          pending.reject(new Error(error || 'Worker 渲染失败'));
        }
      };
      _worker.onerror = function(e: ErrorEvent) {
        logger.error('Poster Worker 错误:', e.message);
        // reject 所有 pending 请求
        for (const [, { reject }] of _pendingRequests) {
          reject(new Error('Worker 发生错误: ' + (e.message || '未知错误')));
        }
        _pendingRequests.clear();
      };
    } catch (e) {
      logger.warn('Worker 初始化失败，将使用主线程渲染:', e instanceof Error ? e.message : String(e));
      _workerSupported = false;
      return null;
    }
  }
  return _worker;
}

/**
 * 清理 Worker 资源（页面切换时调用）
 * 注意：不要在海报生成过程中调用，否则会中断渲染
 */
export function cleanupWorker() {
  if (_worker) {
    _worker.terminate();
    _worker = null;
    _pendingRequests.clear();
  }
}

/**
 * 通过 Worker 渲染背景（如果支持）
 * 返回 ArrayBuffer 或 null（不支持时）
 */
async function renderBackgroundViaWorker(
  width: number,
  height: number,
  directorId: string,
  colors: DirectorColors,
  aiImageUrl: string | null | undefined,
  vignetteIntensity: number,
  renderContext?: RenderContext
): Promise<ArrayBuffer | null> {
  const worker = getWorker();
  if (!worker) return null;

  const id = ++_requestId;

  // 如果有 AI 图片 URL，先 fetch 为 Blob
  let aiImageBlob: Blob | null = null;
  if (aiImageUrl) {
    try {
      if (aiImageUrl.startsWith('data:')) {
        const response = await fetch(aiImageUrl);
        aiImageBlob = await response.blob();
      } else {
        const response = await fetch(aiImageUrl);
        aiImageBlob = await response.blob();
      }
    } catch (e) {
      // fetch 失败，让 Worker 降级为 Canvas 背景
      logger.warn('[PosterEngine] fetch 失败:', e instanceof Error ? e.message : String(e));
    }
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    // 超时保护：Worker 10 秒未响应则自动 reject，防止 pending 请求挂起
    const timer = setTimeout(() => {
      if (_pendingRequests.has(id)) {
        _pendingRequests.delete(id);
        reject(new Error('Worker 渲染超时'));
      }
    }, API_TIMEOUT_WORKER);

    _pendingRequests.set(id, {
      resolve: (buffer: ArrayBuffer) => { clearTimeout(timer); resolve(buffer); },
      reject: (err: Error) => { clearTimeout(timer); reject(err); }
    });
    worker.postMessage({
      type: 'renderBackground',
      id,
      width,
      height,
      directorId,
      colors,
      aiImageBlob,
      vignetteIntensity,
      renderContext: renderContext || null
    }, aiImageBlob ? [aiImageBlob as unknown as Transferable] : []);
  });
}

// ========== 工具函数 ==========

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

// 将 canvas 导出为 Blob URL（比 toDataURL 更省内存，适合大画布）
// WebP 优先（体积约为 PNG 的 60-70%），回退 PNG
function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const tryPng = () => {
      canvas.toBlob(blob => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          reject(new Error('canvas.toBlob 返回空，无法生成图片'));
        }
      }, 'image/png');
    };

    // 尝试 WebP
    try {
      canvas.toBlob(blob => {
        if (blob && blob.type === 'image/webp' && blob.size > 0) {
          resolve(URL.createObjectURL(blob));
        } else {
          tryPng();
        }
      }, 'image/webp', 0.92);
    } catch (e) {
      // WebP 不支持或 toBlob 失败，降级为 PNG
      logger.warn('WebP 导出失败，降级为 PNG:', e instanceof Error ? e.message : String(e));
      tryPng();
    }
  });
}

interface WrapTextResult {
  lines: string[];
  truncated: boolean;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number = 10,
): WrapTextResult {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  let truncated = false;

  for (const paragraph of paragraphs) {
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }

    // 检测是否包含 CJK 字符
    const isCJK = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf]/.test(paragraph);

    if (isCJK) {
      // CJK 文本：逐字符断行
      let currentLine = '';
      for (let i = 0; i < paragraph.length; i++) {
        const char = paragraph[i];
        const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine.length > 0) {
          if (lines.length >= maxLines) {
            truncated = true;
            break;
          }
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      if (!truncated && currentLine) {
        if (lines.length >= maxLines) {
          truncated = true;
        } else {
          lines.push(currentLine);
        }
      }
    } else {
      // 英文/拉丁文：按单词断行（在空格/连字符处断开，不断词）
      const words = paragraph.split(/(\s+|-)/);
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine + word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine.length > 0) {
          if (lines.length >= maxLines) {
            truncated = true;
            break;
          }
          lines.push(currentLine.trim());
          currentLine = word.trimStart();
          // 如果换到新行后单个单词/片段仍然超宽，退化为逐字符断行
          if (ctx.measureText(currentLine).width > maxWidth) {
            let wordPart = '';
            for (let k = 0; k < currentLine.length; k++) {
              const ch = currentLine[k];
              const testPart = wordPart + ch;
              if (ctx.measureText(testPart).width > maxWidth && wordPart.length > 0) {
                if (lines.length >= maxLines) {
                  truncated = true;
                  break;
                }
                lines.push(wordPart);
                wordPart = ch;
              } else {
                wordPart = testPart;
              }
            }
            currentLine = truncated ? '' : wordPart;
          }
        } else if (metrics.width > maxWidth && currentLine.length === 0) {
          // 当前行为空但单词本身超宽，逐字符断行
          let wordPart = '';
          for (let k = 0; k < word.length; k++) {
            const ch = word[k];
            const testPart = wordPart + ch;
            if (ctx.measureText(testPart).width > maxWidth && wordPart.length > 0) {
              if (lines.length >= maxLines) {
                truncated = true;
                break;
              }
              lines.push(wordPart);
              wordPart = ch;
            } else {
              wordPart = testPart;
            }
          }
          if (!truncated) {
            currentLine = wordPart;
          }
        } else {
          currentLine = testLine;
        }
      }
      if (!truncated && currentLine.trim()) {
        if (lines.length >= maxLines) {
          truncated = true;
        } else {
          lines.push(currentLine.trim());
        }
      }
    }
  }

  // 截断时，最后一行加省略号
  if (truncated && lines.length > 0) {
    const lastLine = lines[lines.length - 1];
    let ellipsisLine = lastLine;
    const ellipsis = '...';
    while (ctx.measureText(ellipsisLine + ellipsis).width > maxWidth && ellipsisLine.length > 0) {
      ellipsisLine = ellipsisLine.slice(0, -1);
    }
    lines[lines.length - 1] = ellipsisLine + ellipsis;
  }

  return { lines, truncated };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFilmPerforation(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const holeW = width * 0.018;
  const holeH = height * 0.022;
  const margin = width * 0.015;
  const gap = height * 0.045;
  const startY = height * 0.06;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  for (let y = startY; y < height - startY; y += gap) {
    roundRect(ctx, margin, y, holeW, holeH, holeW * 0.2);
    ctx.fill();
  }
  for (let y = startY; y < height - startY; y += gap) {
    roundRect(ctx, width - margin - holeW, y, holeW, holeH, holeW * 0.2);
    ctx.fill();
  }
}

// ========== 情绪化渲染工具函数（已抽取至 ./poster/shared/） ==========
// hexToRgb / blendColor              → ./poster/shared/color.ts
// drawParticles / applySaturation    → ./poster/shared/particles.ts
// paintEmotionGradient / applyEmotionOverlay / RenderContext → ./poster/shared/emotion-render.ts

// ========== 宫崎骏背景（精调） ==========
function drawMiyazakiBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 太阳光晕
    const sunX = w * 0.72, sunY = h * 0.22;
    const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * 0.35);
    sun.addColorStop(0, blendColor(dc.accent, mv.accentColor, mv.adjustedLightness));
    sun.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
    // 云朵数量随情绪调整
    const cloudCount = Math.max(2, Math.round(3 + mv.adjustedParticleCount * 0.12));
    for (let i = 0; i < cloudCount; i++) {
      drawCloud(ctx, Math.random() * w, Math.random() * h * 0.5, 40 + Math.random() * 60);
    }
    // 草地
    drawHills(ctx, w, h * 0.72, h, blendColor(dc.bg, mv.bgColor[2], mv.adjustedLightness), 1);
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#4a90d9');
  skyGrad.addColorStop(0.25, '#87ceeb');
  skyGrad.addColorStop(0.5, '#b3e5fc');
  skyGrad.addColorStop(0.65, '#e1f5fe');
  skyGrad.addColorStop(0.7, '#c8e6c9');
  skyGrad.addColorStop(1, '#66bb6a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // 太阳光晕
  const sunX = w * 0.72, sunY = h * 0.22;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * 0.35);
  sunGrad.addColorStop(0, 'rgba(255, 245, 157, 0.7)');
  sunGrad.addColorStop(0.3, 'rgba(255, 224, 130, 0.3)');
  sunGrad.addColorStop(1, 'rgba(255, 224, 130, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, w, h);

  // 云朵
  const clouds = [
    { x: w * 0.15, y: h * 0.18, scale: 1.0 },
    { x: w * 0.55, y: h * 0.12, scale: 0.7 },
    { x: w * 0.85, y: h * 0.28, scale: 0.85 },
    { x: w * 0.30, y: h * 0.35, scale: 0.6 },
    { x: w * 0.70, y: h * 0.42, scale: 0.5 }
  ];
  clouds.forEach(c => drawCloud(ctx, c.x, c.y, w * 0.08 * c.scale));

  // 远中近山
  drawHills(ctx, w, h * 0.65, h * 0.72, '#81c784', 0.6);
  drawHills(ctx, w, h * 0.72, h * 0.82, '#66bb6a', 0.8);
  drawHills(ctx, w, h * 0.82, h * 0.95, '#43a047', 1.0);

  // 草地
  const grassGrad = ctx.createLinearGradient(0, h * 0.88, 0, h);
  grassGrad.addColorStop(0, '#43a047');
  grassGrad.addColorStop(1, '#2e7d32');
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, h * 0.88, w, h * 0.12);

  // 飞鸟
  ctx.strokeStyle = 'rgba(27, 94, 32, 0.5)';
  ctx.lineWidth = 2;
  const birds = [
    { x: w * 0.25, y: h * 0.25, size: 12 },
    { x: w * 0.35, y: h * 0.22, size: 10 },
    { x: w * 0.42, y: h * 0.28, size: 8 }
  ];
  birds.forEach(b => drawBird(ctx, b.x, b.y, b.size));

  // 暖色叠加
  const warmGrad = ctx.createLinearGradient(0, 0, 0, h);
  warmGrad.addColorStop(0, 'rgba(255, 213, 79, 0.08)');
  warmGrad.addColorStop(0.5, 'rgba(255, 213, 79, 0.03)');
  warmGrad.addColorStop(1, 'rgba(255, 213, 79, 0)');
  ctx.fillStyle = warmGrad;
  ctx.fillRect(0, 0, w, h);
}

function drawCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
  ctx.shadowBlur = r * 0.8;
  const puffs = [
    { dx: 0, dy: 0, r: r },
    { dx: -r * 0.8, dy: r * 0.2, r: r * 0.7 },
    { dx: r * 0.8, dy: r * 0.15, r: r * 0.75 },
    { dx: -r * 0.3, dy: -r * 0.4, r: r * 0.6 },
    { dx: r * 0.4, dy: -r * 0.35, r: r * 0.55 },
    { dx: r * 1.4, dy: r * 0.3, r: r * 0.5 },
    { dx: -r * 1.4, dy: r * 0.3, r: r * 0.45 }
  ];
  puffs.forEach(p => {
    ctx.beginPath();
    ctx.arc(cx + p.dx, cy + p.dy, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawHills(ctx: CanvasRenderingContext2D, w: number, startY: number, endY: number, color: string, opacity: number): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, endY);
  const peaks = 5;
  for (let i = 0; i <= peaks; i++) {
    const x = (w / peaks) * i;
    const peakHeight = startY + Math.sin(i * 1.3 + startY * 0.01) * (endY - startY) * 0.4;
    const ctrlX = x - w / peaks / 2;
    if (i === 0) {
      ctx.lineTo(0, peakHeight);
    } else {
      ctx.quadraticCurveTo(ctrlX, peakHeight - (endY - startY) * 0.15, x, peakHeight);
    }
  }
  ctx.lineTo(w, endY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBird(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x - size, y);
  ctx.quadraticCurveTo(x - size * 0.5, y - size * 0.6, x, y);
  ctx.quadraticCurveTo(x + size * 0.5, y - size * 0.6, x + size, y);
  ctx.stroke();
}

// ========== 王家卫背景（增强） ==========
function drawWongKarWaiBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 霓虹散景
    const cnt = Math.max(4, Math.round(8 + mv.adjustedParticleCount * 0.2));
    for (let i = 0; i < cnt; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, blendColor(dc.accent, mv.accentColor, mv.adjustedLightness));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.3 + Math.random() * 0.3;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 深绿底色
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#0d1f15');
  bgGrad.addColorStop(0.5, '#1a2e1f');
  bgGrad.addColorStop(1, '#0a1810');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 霓虹光晕（增强层次）
  const neonPositions = [
    { x: w * 0.2, y: h * 0.3, r: w * 0.22, color: 'rgba(61, 122, 90, 0.4)' },
    { x: w * 0.8, y: h * 0.5, r: w * 0.28, color: 'rgba(201, 163, 107, 0.22)' },
    { x: w * 0.5, y: h * 0.7, r: w * 0.2, color: 'rgba(255, 107, 107, 0.14)' },
    { x: w * 0.1, y: h * 0.8, r: w * 0.15, color: 'rgba(61, 122, 90, 0.18)' }
  ];
  neonPositions.forEach(n => {
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    grad.addColorStop(0, n.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });

  // 雨丝（增强密度）
  ctx.strokeStyle = 'rgba(200, 220, 200, 0.15)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y + 25);
    ctx.stroke();
  }

  // 模糊光斑（bokeh，增强）
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 18 + 6;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = Math.random() > 0.5 ? 'rgba(201, 163, 107,' : 'rgba(61, 122, 90,';
    grad.addColorStop(0, hue + '0.18)');
    grad.addColorStop(1, hue + '0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 城市轮廓剪影
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.75);
  const buildings = [
    { x: 0.05, h: 0.15 }, { x: 0.12, h: 0.22 }, { x: 0.2, h: 0.12 },
    { x: 0.28, h: 0.28 }, { x: 0.38, h: 0.18 }, { x: 0.48, h: 0.25 },
    { x: 0.58, h: 0.14 }, { x: 0.68, h: 0.3 }, { x: 0.78, h: 0.2 },
    { x: 0.88, h: 0.16 }, { x: 0.95, h: 0.24 }
  ];
  buildings.forEach(b => {
    ctx.lineTo(w * b.x, h * (0.75 - b.h));
    ctx.lineTo(w * (b.x + 0.05), h * (0.75 - b.h));
  });
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
}

// ========== 是枝裕和背景（增强） ==========
function drawKoreedaBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 柔和居家光晕
    const gx = w * 0.3, gy = h * 0.35;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.55);
    glow.addColorStop(0, blendColor(dc.accent, mv.accentColor, mv.adjustedLightness));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 温暖米色底
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#f5ede0');
  bgGrad.addColorStop(0.5, '#f0e7d3');
  bgGrad.addColorStop(1, '#e8dcc4');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 柔和窗光
  const lightGrad = ctx.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, w * 0.5);
  lightGrad.addColorStop(0, 'rgba(255, 245, 220, 0.5)');
  lightGrad.addColorStop(1, 'rgba(255, 245, 220, 0)');
  ctx.fillStyle = lightGrad;
  ctx.fillRect(0, 0, w, h);

  // 淡绿草地
  const grassGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
  grassGrad.addColorStop(0, 'rgba(168, 200, 181, 0.3)');
  grassGrad.addColorStop(1, 'rgba(168, 200, 181, 0.6)');
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);

  // 细碎叶片
  ctx.fillStyle = 'rgba(124, 155, 130, 0.2)';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const y = h * 0.6 + Math.random() * h * 0.35;
    const size = Math.random() * 6 + 3;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * 0.4, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // 晾衣绳（生活感）
  ctx.strokeStyle = 'rgba(139, 115, 85, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.35);
  ctx.lineTo(w, h * 0.32);
  ctx.stroke();

  // 衣物剪影
  const clothes = [
    { x: w * 0.15, color: 'rgba(230, 200, 156, 0.25)' },
    { x: w * 0.45, color: 'rgba(168, 200, 181, 0.25)' },
    { x: w * 0.75, color: 'rgba(244, 194, 194, 0.2)' }
  ];
  clothes.forEach(c => {
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, h * 0.33, w * 0.06, h * 0.08);
  });
}

// ========== 韦斯·安德森背景（增强） ==========
function drawWesAndersonBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 对称居中边框
    ctx.strokeStyle = blendColor(dc.accent, mv.accentColor, mv.adjustedLightness);
    ctx.lineWidth = Math.max(2, w * 0.008);
    ctx.globalAlpha = 0.6;
    const m = w * 0.06;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 粉色底
  ctx.fillStyle = '#fce4ec';
  ctx.fillRect(0, 0, w, h);

  // 对称色块
  ctx.fillStyle = '#a4d4ae';
  ctx.fillRect(0, h * 0.65, w, h * 0.35);

  // 中心对称装饰
  const cx = w / 2, cy = h * 0.4;
  ctx.fillStyle = 'rgba(244, 194, 194, 0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(249, 213, 110, 0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.1, 0, Math.PI * 2);
  ctx.fill();

  // 对称小三角
  ctx.fillStyle = 'rgba(164, 212, 174, 0.7)';
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const x = cx + side * (w * 0.22 + i * w * 0.05);
      const y = cy + i * h * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, y - 15);
      ctx.lineTo(x - 12, y + 10);
      ctx.lineTo(x + 12, y + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 对称树木
  ctx.fillStyle = 'rgba(124, 155, 130, 0.5)';
  for (let side = -1; side <= 1; side += 2) {
    const tx = cx + side * w * 0.32;
    const ty = h * 0.6;
    ctx.beginPath();
    ctx.arc(tx, ty, w * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(101, 67, 33, 0.4)';
    ctx.fillRect(tx - 3, ty, 6, h * 0.08);
    ctx.fillStyle = 'rgba(124, 155, 130, 0.5)';
  }

  // 对称边框
  ctx.strokeStyle = 'rgba(74, 74, 74, 0.2)';
  ctx.lineWidth = 3;
  ctx.strokeRect(w * 0.08, h * 0.08, w * 0.84, h * 0.84);

  // 中心十字标线
  ctx.strokeStyle = 'rgba(74, 74, 74, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.08);
  ctx.lineTo(cx, h * 0.92);
  ctx.moveTo(w * 0.08, cy);
  ctx.lineTo(w * 0.92, cy);
  ctx.stroke();
}

// ========== 诺兰背景（增强） ==========
function drawNolanBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 城市天际线剪影
    ctx.fillStyle = blendColor(dc.bg, mv.bgColor[2], Math.min(1, mv.adjustedLightness + 0.3));
    ctx.globalAlpha = 0.7;
    const baseY = h * 0.7;
    let x = 0;
    while (x < w) {
      const bw = 20 + Math.random() * 50;
      const bh = 40 + Math.random() * (h * 0.3);
      ctx.fillRect(x, baseY - bh, bw, bh);
      x += bw + 2;
    }
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 深蓝底
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#0a1929');
  bgGrad.addColorStop(0.5, '#0d1b2a');
  bgGrad.addColorStop(1, '#050d18');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 巨物感光柱（增强）
  const beamGrad = ctx.createLinearGradient(w * 0.4, 0, w * 0.6, h);
  beamGrad.addColorStop(0, 'rgba(79, 195, 247, 0.1)');
  beamGrad.addColorStop(0.5, 'rgba(79, 195, 247, 0.05)');
  beamGrad.addColorStop(1, 'rgba(79, 195, 247, 0)');
  ctx.fillStyle = beamGrad;
  ctx.fillRect(w * 0.3, 0, w * 0.4, h);

  // 网格线（时间/空间感）
  ctx.strokeStyle = 'rgba(192, 192, 192, 0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const y = (h / 12) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i++) {
    const x = (w / 8) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // 星点（增强）
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.6;
    const r = Math.random() * 1.5 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 巨物感结构体（增强）
  ctx.fillStyle = 'rgba(30, 50, 70, 0.6)';
  ctx.beginPath();
  ctx.moveTo(w * 0.35, h);
  ctx.lineTo(w * 0.42, h * 0.3);
  ctx.lineTo(w * 0.45, h * 0.25);
  ctx.lineTo(w * 0.48, h * 0.3);
  ctx.lineTo(w * 0.55, h);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(w * 0.5, h);
  ctx.lineTo(w * 0.55, h * 0.35);
  ctx.lineTo(w * 0.58, h * 0.3);
  ctx.lineTo(w * 0.61, h * 0.35);
  ctx.lineTo(w * 0.68, h);
  ctx.closePath();
  ctx.fill();

  // 冷色光晕
  const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, w * 0.4);
  glowGrad.addColorStop(0, 'rgba(79, 195, 247, 0.08)');
  glowGrad.addColorStop(1, 'rgba(79, 195, 247, 0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);
}

// ========== 周星驰背景（增强） ==========
function drawChowBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 活力斜线条纹
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = w * 0.04;
    ctx.strokeStyle = blendColor(dc.accent, mv.accentColor, mv.adjustedLightness);
    for (let i = -2; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * w * 0.2, 0);
      ctx.lineTo(i * w * 0.2 + h, h);
      ctx.stroke();
    }
    ctx.restore();
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 亮黄底
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#fff3cd');
  bgGrad.addColorStop(0.5, '#ffcc00');
  bgGrad.addColorStop(1, '#ff9800');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 漫画风速度线（增强）
  ctx.strokeStyle = 'rgba(255, 51, 51, 0.18)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const len = Math.random() * w * 0.3 + w * 0.1;
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  // 星星（增强）
  ctx.fillStyle = 'rgba(255, 51, 51, 0.22)';
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    drawStar(ctx, x, y, 5, Math.random() * 18 + 10, 6);
  }

  // 港式霓虹光晕
  const neonGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.4);
  neonGrad.addColorStop(0, 'rgba(255, 152, 0, 0.18)');
  neonGrad.addColorStop(1, 'rgba(255, 152, 0, 0)');
  ctx.fillStyle = neonGrad;
  ctx.fillRect(0, 0, w, h);

  // 漫画集中线（冲击感）
  ctx.strokeStyle = 'rgba(183, 28, 28, 0.1)';
  ctx.lineWidth = 1.5;
  const centerX = w * 0.5, centerY = h * 0.4;
  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 / 24) * i;
    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(angle) * w * 0.15, centerY + Math.sin(angle) * w * 0.15);
    ctx.lineTo(centerX + Math.cos(angle) * w * 0.5, centerY + Math.sin(angle) * w * 0.5);
    ctx.stroke();
  }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerR: number, innerR: number): void {
  let rot = Math.PI / 2 * 3;
  let x = cx, y = cy;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerR;
    y = cy + Math.sin(rot) * outerR;
    ctx.lineTo(x, y);
    rot += step;
    x = cx + Math.cos(rot) * innerR;
    y = cy + Math.sin(rot) * innerR;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
  ctx.fill();
}

// ========== 贾樟柯背景（土黄灰褐，拆迁工地，纪实感） ==========
function drawJiaBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 水平雾霾条带
    for (let i = 0; i < 4; i++) {
      const y = h * (0.2 + i * 0.18);
      const g = ctx.createLinearGradient(0, y, w, y);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, blendColor(dc.accent, mv.accentColor, mv.adjustedLightness));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = g;
      ctx.fillRect(0, y, w, h * 0.06);
    }
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 灰蒙蒙天空渐变（土黄到灰褐）
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#5a5448');
  skyGrad.addColorStop(0.4, '#7a7a6e');
  skyGrad.addColorStop(0.7, '#a89060');
  skyGrad.addColorStop(1, '#6a5e48');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // 灰霾雾气层（纪实感）
  const hazeGrad = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.7);
  hazeGrad.addColorStop(0, 'rgba(168, 144, 96, 0.15)');
  hazeGrad.addColorStop(1, 'rgba(122, 122, 110, 0.25)');
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, h * 0.3, w, h * 0.4);

  // 拆迁工地轮廓（断壁残垣）
  ctx.fillStyle = 'rgba(61, 53, 40, 0.7)';
  const ruins = [
    { x: 0.05, y: 0.65, w: 0.12, h: 0.25 },
    { x: 0.2, y: 0.7, w: 0.08, h: 0.2 },
    { x: 0.32, y: 0.6, w: 0.15, h: 0.3 },
    { x: 0.52, y: 0.68, w: 0.1, h: 0.22 },
    { x: 0.66, y: 0.62, w: 0.14, h: 0.28 },
    { x: 0.84, y: 0.7, w: 0.1, h: 0.2 }
  ];
  ruins.forEach(r => {
    ctx.fillRect(w * r.x, h * r.y, w * r.w, h * r.h);
  });

  // 裸露钢筋线条（拆迁感）
  ctx.strokeStyle = 'rgba(156, 92, 74, 0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const x = w * (0.1 + i * 0.11);
    const y1 = h * (0.6 + Math.random() * 0.1);
    const y2 = h * (0.85 + Math.random() * 0.1);
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x + (Math.random() - 0.5) * 20, y2);
    ctx.stroke();
  }

  // 灰尘颗粒（纪实质感）
  ctx.fillStyle = 'rgba(213, 200, 168, 0.15)';
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * w;
    const y = h * 0.5 + Math.random() * h * 0.4;
    const r = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 远处塔吊剪影（时代变迁标志）
  ctx.strokeStyle = 'rgba(61, 53, 40, 0.5)';
  ctx.lineWidth = 2;
  const craneX = w * 0.75, craneY = h * 0.55;
  ctx.beginPath();
  ctx.moveTo(craneX, h * 0.9);
  ctx.lineTo(craneX, craneY);
  ctx.lineTo(craneX + w * 0.12, craneY);
  ctx.lineTo(craneX + w * 0.1, craneY + h * 0.02);
  ctx.stroke();

  // 褪色暖光叠加（怀旧感）
  const warmGrad = ctx.createLinearGradient(0, 0, 0, h);
  warmGrad.addColorStop(0, 'rgba(168, 144, 96, 0.1)');
  warmGrad.addColorStop(1, 'rgba(156, 92, 74, 0.05)');
  ctx.fillStyle = warmGrad;
  ctx.fillRect(0, 0, w, h);
}

// ========== 李安背景（翠绿金色，竹林山水，水墨晕染） ==========
function drawLeeBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 远山剪影
    ctx.fillStyle = blendColor(dc.bg, mv.bgColor[2], Math.min(1, mv.adjustedLightness + 0.2));
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w * 0.25, h * 0.55);
    ctx.lineTo(w * 0.5, h * 0.7);
    ctx.lineTo(w * 0.75, h * 0.5);
    ctx.lineTo(w, h * 0.65);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 深绿墨色底（水墨感）
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#0f1a12');
  bgGrad.addColorStop(0.5, '#1a2e1f');
  bgGrad.addColorStop(1, '#0a1410');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 水墨晕染远山（多层渐淡）
  const mountains = [
    { y: 0.55, color: 'rgba(45, 106, 79, 0.25)', peaks: 4 },
    { y: 0.65, color: 'rgba(45, 106, 79, 0.4)', peaks: 5 },
    { y: 0.75, color: 'rgba(26, 58, 28, 0.6)', peaks: 6 }
  ];
  mountains.forEach(m => {
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= m.peaks; i++) {
      const x = (w / m.peaks) * i;
      const peakY = h * m.y + Math.sin(i * 2.1) * h * 0.06;
      const ctrlX = x - w / m.peaks / 2;
      if (i === 0) {
        ctx.lineTo(0, peakY);
      } else {
        ctx.quadraticCurveTo(ctrlX, peakY - h * 0.04, x, peakY);
      }
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  });

  // 竹林剪影（左右对称，东方意境）
  ctx.strokeStyle = 'rgba(45, 106, 79, 0.5)';
  ctx.lineWidth = 2;
  for (let side = 0; side < 2; side++) {
    const baseX = side === 0 ? w * 0.08 : w * 0.92;
    for (let i = 0; i < 4; i++) {
      const x = baseX + (side === 0 ? 1 : -1) * i * w * 0.025;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.bezierCurveTo(
        x + (Math.random() - 0.5) * 10, h * 0.6,
        x + (Math.random() - 0.5) * 15, h * 0.3,
        x + (Math.random() - 0.5) * 10, h * 0.1
      );
      ctx.stroke();
      // 竹节
      for (let j = 0; j < 5; j++) {
        const segY = h * (0.15 + j * 0.16);
        ctx.beginPath();
        ctx.moveTo(x - 4, segY);
        ctx.lineTo(x + 4, segY);
        ctx.stroke();
      }
    }
  }

  // 金色月光晕（画意美学）
  const moonX = w * 0.7, moonY = h * 0.2;
  const moonGrad = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, w * 0.2);
  moonGrad.addColorStop(0, 'rgba(212, 168, 67, 0.4)');
  moonGrad.addColorStop(0.5, 'rgba(212, 168, 67, 0.15)');
  moonGrad.addColorStop(1, 'rgba(212, 168, 67, 0)');
  ctx.fillStyle = moonGrad;
  ctx.fillRect(0, 0, w, h);

  // 水面倒影（留白意境）
  const waterGrad = ctx.createLinearGradient(0, h * 0.8, 0, h);
  waterGrad.addColorStop(0, 'rgba(232, 224, 200, 0.05)');
  waterGrad.addColorStop(1, 'rgba(232, 224, 200, 0.12)');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, h * 0.8, w, h * 0.2);

  // 水面波纹
  ctx.strokeStyle = 'rgba(232, 224, 200, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = h * 0.82 + i * h * 0.03;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, y);
    ctx.quadraticCurveTo(w * 0.5, y - 3, w * 0.9, y);
    ctx.stroke();
  }
}

// ========== 黑泽明背景（大胆原色，雨丝风，动态感） ==========
function drawKurosawaBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 戏剧性地平线
    const horizon = h * 0.62;
    ctx.fillStyle = blendColor(dc.bg, mv.bgColor[2], Math.min(1, mv.adjustedLightness + 0.25));
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 深色戏剧底
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#1a1a1a');
  bgGrad.addColorStop(0.5, '#2c3e7b');
  bgGrad.addColorStop(1, '#0d0d0d');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 大胆原色色块（红黄蓝几何）
  ctx.fillStyle = 'rgba(192, 57, 43, 0.35)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  ctx.lineTo(w * 0.4, h * 0.3);
  ctx.lineTo(w * 0.45, h * 0.6);
  ctx.lineTo(0, h * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(241, 196, 15, 0.25)';
  ctx.beginPath();
  ctx.moveTo(w * 0.6, h * 0.2);
  ctx.lineTo(w, h * 0.35);
  ctx.lineTo(w, h * 0.55);
  ctx.lineTo(w * 0.55, h * 0.5);
  ctx.closePath();
  ctx.fill();

  // 密集雨丝（天气作为角色）
  ctx.strokeStyle = 'rgba(240, 240, 240, 0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = Math.random() * 30 + 15;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + len);
    ctx.stroke();
  }

  // 风的斜线（动态感）
  ctx.strokeStyle = 'rgba(241, 196, 15, 0.15)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = Math.random() * w * 0.2 + w * 0.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * 0.8, y + len * 0.3);
    ctx.stroke();
  }

  // 武士剪影群（动态几何构图）
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const figures = [
    { x: 0.2, y: 0.65, h: 0.3 },
    { x: 0.35, y: 0.62, h: 0.33 },
    { x: 0.5, y: 0.64, h: 0.31 },
    { x: 0.65, y: 0.63, h: 0.32 },
    { x: 0.8, y: 0.65, h: 0.3 }
  ];
  figures.forEach(f => {
    const fx = w * f.x, fy = h * f.y, fh = h * f.h;
    // 头部
    ctx.beginPath();
    ctx.arc(fx, fy, w * 0.015, 0, Math.PI * 2);
    ctx.fill();
    // 身体
    ctx.beginPath();
    ctx.moveTo(fx - w * 0.02, fy + h * 0.02);
    ctx.lineTo(fx + w * 0.02, fy + h * 0.02);
    ctx.lineTo(fx + w * 0.015, fy + fh);
    ctx.lineTo(fx - w * 0.015, fy + fh);
    ctx.closePath();
    ctx.fill();
  });

  // 戏剧性高光（顶部光源）
  const lightGrad = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, w * 0.6);
  lightGrad.addColorStop(0, 'rgba(241, 196, 15, 0.15)');
  lightGrad.addColorStop(1, 'rgba(241, 196, 15, 0)');
  ctx.fillStyle = lightGrad;
  ctx.fillRect(0, 0, w, h);
}

// ========== 索菲亚·科波拉背景（柔粉淡蓝，留白，窗光） ==========
function drawCoppolaBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 教父式顶部压暗
    const top = ctx.createLinearGradient(0, 0, 0, h * 0.4);
    top.addColorStop(0, blendColor(dc.bg, mv.bgColor[2], Math.min(1, mv.adjustedLightness + 0.4)));
    top.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h * 0.4);
    // 金色强调带
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = blendColor(dc.accent, mv.accentColor, mv.adjustedLightness);
    ctx.fillRect(0, h * 0.45, w, h * 0.1);
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 柔粉米色底（大量留白感）
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#f5ede0');
  bgGrad.addColorStop(0.5, '#f0e8e0');
  bgGrad.addColorStop(1, '#e8d8d8');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 窗光柔光（从左上洒入）
  const windowGrad = ctx.createRadialGradient(w * 0.2, h * 0.15, 0, w * 0.2, h * 0.15, w * 0.6);
  windowGrad.addColorStop(0, 'rgba(255, 250, 240, 0.6)');
  windowGrad.addColorStop(0.4, 'rgba(255, 240, 230, 0.2)');
  windowGrad.addColorStop(1, 'rgba(255, 240, 230, 0)');
  ctx.fillStyle = windowGrad;
  ctx.fillRect(0, 0, w, h);

  // 淡蓝色色块（疏离感）
  ctx.fillStyle = 'rgba(184, 207, 224, 0.2)';
  ctx.fillRect(w * 0.6, h * 0.1, w * 0.35, h * 0.5);

  // 柔粉色色块（梦幻感）
  ctx.fillStyle = 'rgba(232, 197, 197, 0.25)';
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.35, w * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // 窗框线条（酒店空间感）
  ctx.strokeStyle = 'rgba(93, 78, 87, 0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.1);
  ctx.lineTo(w * 0.08, h * 0.6);
  ctx.moveTo(w * 0.08, h * 0.6);
  ctx.lineTo(w * 0.35, h * 0.6);
  ctx.stroke();

  // 窗户竖框
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.1);
  ctx.lineTo(w * 0.18, h * 0.6);
  ctx.moveTo(w * 0.28, h * 0.1);
  ctx.lineTo(w * 0.28, h * 0.6);
  ctx.stroke();

  // 孤独人物剪影（疏离感）
  ctx.fillStyle = 'rgba(93, 78, 87, 0.25)';
  const figureX = w * 0.5, figureY = h * 0.7;
  ctx.beginPath();
  ctx.arc(figureX, figureY, w * 0.012, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(figureX - w * 0.01, figureY + h * 0.01, w * 0.02, h * 0.12);

  // 过曝高光（梦幻）
  const overexposeGrad = ctx.createLinearGradient(0, 0, w, h);
  overexposeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  overexposeGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
  overexposeGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = overexposeGrad;
  ctx.fillRect(0, 0, w, h);

  // 淡紫色调和（柔粉粉彩）
  const purpleGrad = ctx.createRadialGradient(w * 0.8, h * 0.8, 0, w * 0.8, h * 0.8, w * 0.4);
  purpleGrad.addColorStop(0, 'rgba(196, 184, 208, 0.15)');
  purpleGrad.addColorStop(1, 'rgba(196, 184, 208, 0)');
  ctx.fillStyle = purpleGrad;
  ctx.fillRect(0, 0, w, h);
}

// ========== 查泽雷背景（紫橙渐变，舞台聚光灯） ==========
function drawChazelleBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 霓虹城市灯火
    const lightColor = blendColor(dc.accent, mv.accentColor, mv.adjustedLightness);
    const cnt = Math.max(8, Math.round(12 + mv.adjustedParticleCount * 0.2));
    for (let i = 0; i < cnt; i++) {
      const x = Math.random() * w;
      const y = h * 0.55 + Math.random() * h * 0.4;
      ctx.fillStyle = lightColor;
      ctx.globalAlpha = 0.4 + Math.random() * 0.4;
      ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    ctx.globalAlpha = 1;
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 深紫底色
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#1a1230');
  bgGrad.addColorStop(0.5, '#2a1a45');
  bgGrad.addColorStop(1, '#0f0820');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 紫橙渐变光晕（梦幻色彩）
  const sunsetGrad = ctx.createLinearGradient(0, h * 0.3, w, h * 0.8);
  sunsetGrad.addColorStop(0, 'rgba(106, 76, 147, 0.4)');
  sunsetGrad.addColorStop(0.5, 'rgba(255, 107, 53, 0.3)');
  sunsetGrad.addColorStop(1, 'rgba(255, 210, 63, 0.2)');
  ctx.fillStyle = sunsetGrad;
  ctx.fillRect(0, 0, w, h);

  // 舞台聚光灯效果（顶部射下）
  const spotX = w * 0.5, spotY = 0;
  const spotGrad = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, h * 0.8);
  spotGrad.addColorStop(0, 'rgba(255, 210, 63, 0.25)');
  spotGrad.addColorStop(0.3, 'rgba(255, 107, 53, 0.1)');
  spotGrad.addColorStop(1, 'rgba(255, 107, 53, 0)');
  ctx.fillStyle = spotGrad;
  ctx.fillRect(0, 0, w, h);

  // 聚光灯锥形光束
  ctx.fillStyle = 'rgba(255, 210, 63, 0.08)';
  ctx.beginPath();
  ctx.moveTo(w * 0.45, 0);
  ctx.lineTo(w * 0.55, 0);
  ctx.lineTo(w * 0.65, h * 0.7);
  ctx.lineTo(w * 0.35, h * 0.7);
  ctx.closePath();
  ctx.fill();

  // 舞台地板（暖橙反光）
  const stageGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
  stageGrad.addColorStop(0, 'rgba(255, 107, 53, 0.2)');
  stageGrad.addColorStop(1, 'rgba(106, 76, 147, 0.3)');
  ctx.fillStyle = stageGrad;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);

  // 星光点（城市星光，追梦人灯塔）
  ctx.fillStyle = 'rgba(255, 210, 63, 0.6)';
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.5;
    const r = Math.random() * 1.5 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 音符意象（爵士乐感）
  ctx.fillStyle = 'rgba(232, 213, 240, 0.15)';
  const notes = [
    { x: 0.15, y: 0.3 }, { x: 0.85, y: 0.25 },
    { x: 0.2, y: 0.5 }, { x: 0.8, y: 0.45 },
    { x: 0.1, y: 0.65 }, { x: 0.9, y: 0.6 }
  ];
  notes.forEach(n => {
    const nx = w * n.x, ny = h * n.y;
    ctx.beginPath();
    ctx.arc(nx, ny, w * 0.012, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(nx + w * 0.01, ny - h * 0.04, 2, h * 0.04);
  });

  // 金色背光（金色时刻）
  const backlightGrad = ctx.createRadialGradient(w * 0.5, h * 0.9, 0, w * 0.5, h * 0.9, w * 0.5);
  backlightGrad.addColorStop(0, 'rgba(255, 210, 63, 0.15)');
  backlightGrad.addColorStop(1, 'rgba(255, 210, 63, 0)');
  ctx.fillStyle = backlightGrad;
  ctx.fillRect(0, 0, w, h);
}

// ========== 昆汀背景（血红暖黄，复古质感，低角度视角） ==========
function drawTarantinoBg(ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    const { merged: mv, directorColors: dc } = rc;
    // 大胆对角分割
    ctx.save();
    ctx.fillStyle = blendColor(dc.primary, mv.bgColor[0], Math.min(1, mv.adjustedLightness + 0.3));
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    applyEmotionOverlay(ctx, w, h, mv);
    return;
  }
  // 深红黑底（复古暴力美学）
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#1a0a0a');
  bgGrad.addColorStop(0.4, '#2a0808');
  bgGrad.addColorStop(0.7, '#3d0a0a');
  bgGrad.addColorStop(1, '#0d0505');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 血红色块（大胆色彩）
  ctx.fillStyle = 'rgba(139, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.4);
  ctx.lineTo(w * 0.5, h * 0.2);
  ctx.lineTo(w, h * 0.45);
  ctx.lineTo(w, h * 0.6);
  ctx.lineTo(0, h * 0.55);
  ctx.closePath();
  ctx.fill();

  // 暖黄色光晕（复古质感）
  const yellowGrad = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.3, h * 0.3, w * 0.4);
  yellowGrad.addColorStop(0, 'rgba(232, 184, 48, 0.25)');
  yellowGrad.addColorStop(0.5, 'rgba(232, 184, 48, 0.1)');
  yellowGrad.addColorStop(1, 'rgba(232, 184, 48, 0)');
  ctx.fillStyle = yellowGrad;
  ctx.fillRect(0, 0, w, h);

  // 低角度视角暗示（从底部仰视的透视线条）
  ctx.strokeStyle = 'rgba(232, 184, 48, 0.15)';
  ctx.lineWidth = 1.5;
  const vanishX = w * 0.5, vanishY = h * 0.35;
  for (let i = 0; i <= 8; i++) {
    const x = (w / 8) * i;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(vanishX, vanishY);
    ctx.stroke();
  }
  // 水平透视线
  for (let i = 1; i <= 5; i++) {
    const y = h * 0.4 + (h * 0.6) * (i / 5) * (i / 5);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // 复古胶片颗粒（grindhouse 质感）
  ctx.fillStyle = 'rgba(240, 224, 192, 0.08)';
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 2 + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 划痕（复古胶片感）
  ctx.strokeStyle = 'rgba(240, 224, 192, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 10, h);
    ctx.stroke();
  }

  // 粉红色点缀（致敬色彩）
  ctx.fillStyle = 'rgba(255, 107, 157, 0.2)';
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.25, w * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // 暖色暗角（复古色调）
  const vignetteGrad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.7);
  vignetteGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignetteGrad.addColorStop(1, 'rgba(139, 0, 0, 0.3)');
  ctx.fillStyle = vignetteGrad;
  ctx.fillRect(0, 0, w, h);
}

// ========== 自定义风格动态背景渲染器 ==========
function drawCustomBg(ctx: CanvasRenderingContext2D, w: number, h: number, colors?: DirectorColors, rc?: RenderContext): void {
  if (rc) {
    paintEmotionGradient(ctx, w, h, rc);
    applyEmotionOverlay(ctx, w, h, rc.merged);
    return;
  }
  const c: Partial<DirectorColors> = colors || {};
  const bg = c.bg || '#1a1a2e';
  const primary = c.primary || '#e94560';
  const secondary = c.secondary || '#0f3460';
  const accent = c.accent || '#f5f5f5';

  // 底色渐变
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, bg);
  bgGrad.addColorStop(0.5, secondary);
  bgGrad.addColorStop(1, bg);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 主色调光晕
  const glowGrad = ctx.createRadialGradient(w * 0.3, h * 0.35, 0, w * 0.3, h * 0.35, w * 0.5);
  glowGrad.addColorStop(0, hexToRgba(primary, 0x40 / 255));
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  // 副色调光晕
  const glow2 = ctx.createRadialGradient(w * 0.75, h * 0.65, 0, w * 0.75, h * 0.65, w * 0.4);
  glow2.addColorStop(0, hexToRgba(accent, 0x25 / 255));
  glow2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  // 纹理光斑
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 20 + 8;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, hexToRgba(primary, 0x15 / 255));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 底部渐变遮罩
  const bottomGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
  bottomGrad.addColorStop(0, 'rgba(0,0,0,0)');
  bottomGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}

// ========== 背景渲染器映射 ==========
const bgRenderers: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number, rc?: RenderContext) => void> = {
  miyazaki: drawMiyazakiBg,
  wkw: drawWongKarWaiBg,
  koreeda: drawKoreedaBg,
  wes: drawWesAndersonBg,
  nolan: drawNolanBg,
  chow: drawChowBg,
  jia: drawJiaBg,
  lee: drawLeeBg,
  kurosawa: drawKurosawaBg,
  coppola: drawCoppolaBg,
  chazelle: drawChazelleBg,
  tarantino: drawTarantinoBg
};

// ========== 文字排版层（支持字体切换） ==========
function drawTextLayer(ctx: CanvasRenderingContext2D, w: number, h: number, options: DrawTextLayerOptions): void {
  const { title, quote, directorName, colors, fontFamily, titleWeight, merged } = options;
  const isVertical = h > w;
  const fontFam = fontFamily || '"Noto Serif SC", serif';
  const weight = titleWeight || 700;

  // 标题（情绪化：位置 / 大小受文字能量与明度影响）
  const titleY = merged
    ? h * (0.35 + (1 - merged.adjustedLightness) * 0.15)
    : (isVertical ? h * 0.28 : h * 0.32);
  const titleMaxWidth = w * 0.7;
  const baseTitleSize = isVertical ? Math.round(w * TITLE_FONT_RATIO_V) : Math.round(h * TITLE_FONT_RATIO_H);
  const titleFontSize = merged ? Math.round(baseTitleSize * (1 + merged.textMood.energy * TITLE_ENERGY_SCALE)) : baseTitleSize;
  const lineHeight = titleFontSize * 1.4;

  // 标题可用高度：从 titleY 到 quoteY 之间，留出装饰线和间距
  const quoteY = isVertical ? h * 0.72 : h * 0.7;
  const titleAvailableH = quoteY - titleY - 60; // 60px 留给装饰线+间距
  const titleMaxLines = Math.max(1, Math.floor(titleAvailableH / lineHeight));

  ctx.save();
  ctx.font = `${weight} ${titleFontSize}px ${fontFam}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.text;
  ctx.shadowColor = merged ? merged.accentColor : 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = TEXT_SHADOW_BLUR;
  ctx.shadowOffsetY = TEXT_SHADOW_OFFSET_Y;

  const { lines: titleLines } = wrapText(ctx, title, titleMaxWidth, titleMaxLines);
  const titleStartY = titleY - (titleLines.length - 1) * lineHeight / 2;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, w / 2, titleStartY + i * lineHeight);
  });
  ctx.restore();

  // 标题装饰线
  ctx.save();
  ctx.strokeStyle = colors.textLight;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.5;
  const lineY = titleY + titleLines.length * lineHeight / 2 + 15;
  const lineW = w * 0.12;
  ctx.beginPath();
  ctx.moveTo(w / 2 - lineW, lineY);
  ctx.lineTo(w / 2 + lineW, lineY);
  ctx.stroke();
  ctx.restore();

  // 导演说金句
  const creditY = isVertical ? h * 0.88 : h * 0.86;
  if (quote) {
    const quoteMaxWidth = w * 0.65;
    const quoteFontSize = isVertical ? Math.round(w * QUOTE_FONT_RATIO_V) : Math.round(h * QUOTE_FONT_RATIO_H);
    const quoteLineHeight = quoteFontSize * 1.6;

    // 金句可用高度：从装饰线下方到导演署名上方
    const quoteAvailableH = creditY - lineY - 50;
    const quoteMaxLines = Math.max(1, Math.floor(quoteAvailableH / quoteLineHeight));

    ctx.save();
    ctx.font = `400 ${quoteFontSize}px ${fontFam}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.textLight;
    ctx.globalAlpha = 0.85;

    const { lines: quoteLines } = wrapText(ctx, `「${quote}」`, quoteMaxWidth, quoteMaxLines);
    const quoteStartY = quoteY - (quoteLines.length - 1) * quoteLineHeight / 2;
    quoteLines.forEach((line, i) => {
      ctx.fillText(line, w / 2, quoteStartY + i * quoteLineHeight);
    });
    ctx.restore();
  }

  // 导演署名
  const creditFontSize = isVertical ? Math.round(w * CREDIT_FONT_RATIO_V) : Math.round(h * CREDIT_FONT_RATIO_H);
  ctx.save();
  ctx.font = `500 ${creditFontSize}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.textLight;
  ctx.globalAlpha = 0.6;
  ctx.fillText(`— ${directorName}`, w / 2, creditY);
  ctx.restore();

  // 顶部品牌标识
  ctx.save();
  ctx.font = `500 ${Math.round(w * BRAND_WATERMARK_FONT_RATIO)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = colors.textLight;
  ctx.globalAlpha = BRAND_WATERMARK_ALPHA;
  ctx.fillText(BRAND_WATERMARK_TEXT, w / 2, h * BRAND_WATERMARK_Y_RATIO);
  ctx.restore();
}

// ========== 九宫格合集生成 ==========
async function generateGrid9(options: GenerateGrid9Options): Promise<PosterGenerateResult> {
  const {
    text,
    directorIds,
    moodTagId,
    title: customTitle
  } = options;

  // 确保字体已加载
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const cellSize = 720;
  const gridSize = 3;
  const totalSize = cellSize * gridSize; // 2160
  const gap = 8;
  const padding = 20;

  // 填充 9 个格子：先放所有导演，不够则循环重复
  const cells: string[] = [];
  const dirs = directorIds.length > 0 ? directorIds : ['miyazaki'];
  for (let i = 0; i < 9; i++) {
    cells.push(dirs[i % dirs.length]);
  }

  // 并发生成小海报（方形 720×720），限制并发数 3 避免触发速率限制
  const CONCURRENCY = 3;
  const cellCanvases: HTMLImageElement[] = new Array(cells.length);

  async function generateCell(index: number): Promise<void> {
    const directorId = cells[index];
    const result = await generate({
      text,
      directorId,
      moodTagId,
      format: 'square',
      showQuote: false, // 九宫格小图不显示金句，避免太挤
      title: customTitle
    });
    // 从 dataUrl 恢复 canvas
    const img = new Image();
    img.src = result.dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => {
        logger.error('九宫格子海报加载失败:', e);
        reject(new Error('九宫格子海报加载失败'));
      };
    });
    // 释放临时 Blob URL，避免内存泄漏
    safeRevokeUrl(result.dataUrl);
    cellCanvases[index] = img;
  }

  // 分批并发执行：每批 CONCURRENCY 个，全部完成后开始下一批
  for (let i = 0; i < cells.length; i += CONCURRENCY) {
    const batch = cells.slice(i, i + CONCURRENCY).map((_, j) => generateCell(i + j));
    await Promise.all(batch);
  }

  // 合成大画布
  const canvas = createCanvas(totalSize, totalSize);
  const ctx = canvas.getContext('2d')!;

  // 深色底
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, totalSize, totalSize);

  // 绘制 3×3 网格
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const idx = row * gridSize + col;
      const x = padding + col * (cellSize + gap);
      const y = padding + row * (cellSize + gap);
      // 圆角裁剪
      ctx.save();
      roundRect(ctx, x, y, cellSize, cellSize, 12);
      ctx.clip();
      ctx.drawImage(cellCanvases[idx], x, y, cellSize, cellSize);
      ctx.restore();
      // 导演名标签
      const director = DIRECTORS.find(d => d.id === cells[idx]);
      if (director) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, x + 16, y + cellSize - 56, cellSize - 32, 40, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '600 22px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(director.name, x + cellSize / 2, y + cellSize - 36);
        ctx.restore();
      }
    }
  }

  // 底部品牌水印
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '600 28px "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('造境 ZaoJing · 6 位导演系列合集', totalSize / 2, totalSize - 8);
  ctx.restore();

  const title = customTitle || extractTitle(text, moodTagId ?? null);

  const dataUrl = await canvasToBlobUrl(canvas);

  return {
    dataUrl,
    title,
    quote: '',
    director: '6位导演系列',
    directorId: 'grid9',
    format: '九宫格',
    width: totalSize,
    height: totalSize
  };
}

// ========== 加载图片 ==========
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      logger.error('图片加载失败:', src, e);
      reject(new Error(`图片加载失败: ${src}`));
    };
    img.src = src;
  });
}

// ========== 绘制 AI 图片背景 ==========
function drawAIBackground(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number): void {
  // 按 "cover" 方式绘制，保持比例填充整个画布
  const imgRatio = img.width / img.height;
  const canvasRatio = width / height;
  let sx: number, sy: number, sw: number, sh: number;

  if (imgRatio > canvasRatio) {
    // 图片更宽，裁剪左右
    sh = img.height;
    sw = sh * canvasRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    // 图片更高，裁剪上下
    sw = img.width;
    sh = sw / canvasRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
}

// ========== 主生成函数 ==========
async function generate(options: GenerateOptions): Promise<PosterGenerateResult> {
  const {
    text,
    emotion,
    directorId,
    movieId,              // 新增：电影 ID
    customDNA,            // Phase 2: 自定义/融合 DNA
    customColors,         // Phase 2: 自定义/融合色彩
    customPrompt,         // Phase 2: 自定义/融合 prompt
    swapLabel,            // Phase 2: 换导演/盲盒标签
    moodTagId,
    format = 'vertical',
    showQuote = true,
    title: customTitle,
    quote: customQuote,
    quoteIndex,
    aiImageUrl,           // AI 生成的背景图 URL/dataUrl
    customFontFamily,     // 自定义字体族（覆盖默认）
    customTitleWeight     // 自定义标题字重（覆盖默认）
  } = options;

  // 优先使用电影风格，其次导演风格
  let styleSource: StyleSource | undefined;
  if (movieId) {
    const movie = (FALLBACK_MOVIES as Movie[]).find(m => m.id === movieId)
      || ((_getServerMovies ? _getServerMovies() : []) as Movie[]).find(m => m.id === movieId);
    if (movie) {
      // Phase 2: 如果有自定义 DNA/色彩/prompt，使用融合后的
      styleSource = {
        id: movie.id,
        name: swapLabel || movie.title,
        colors: customColors || movie.colors,
        styleDNA: customDNA || movie.styleDNA,
        fontFamily: movie.fontFamily || "'Noto Serif SC', serif",
        titleWeight: movie.titleWeight || 800,
        promptCore: customPrompt || movie.stylePrompt,
        quotes: movie.iconicQuotes || [],
        isMovie: true,
        movieRef: { id: movie.id, title: movie.title, posterUrl: movie.posterUrl, styleDNA: customDNA || movie.styleDNA }
      };
    }
  }
  if (!styleSource) {
    const director = DIRECTORS.find(d => d.id === directorId) || DIRECTORS[0];
    styleSource = director as unknown as StyleSource;
  }

  // 构建情绪化渲染上下文（Canvas 降级时驱动背景与文字层）
  const emotionStr = (typeof emotion === 'string' && emotion) ? emotion : 'neutral';
  const merged = mergeEmotionAndText(emotionStr, text || '');
  const renderContext: RenderContext = {
    emotion: emotionStr,
    merged,
    directorColors: styleSource.colors,
    text: text || '',
    moodTagId: moodTagId ?? null,
  };

  const formatConfig = POSTER_FORMATS.find(f => f.id === format) || POSTER_FORMATS[0];

  // 确保字体已加载
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  const { width, height } = formatConfig;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // 1. 绘制背景（AI 生图 或 Canvas 风格）
  // 优先尝试通过 Web Worker 渲染背景（避免阻塞主线程）
  let usedWorker = false;
  try {
    const bgBuffer = await renderBackgroundViaWorker(
      width, height,
      styleSource.id, styleSource.colors,
      aiImageUrl,
      aiImageUrl ? VIGNETTE_INTENSITY_AI : VIGNETTE_INTENSITY_CANVAS,
      renderContext
    );
    if (bgBuffer) {
      // Worker 返回了渲染好的背景图，直接绘制到 canvas
      const bgBlob = new Blob([bgBuffer], { type: 'image/png' });
      const bgUrl = URL.createObjectURL(bgBlob);
      const bgImg = await loadImage(bgUrl);
      ctx.drawImage(bgImg, 0, 0, width, height);
      safeRevokeUrl(bgUrl);
      usedWorker = true;
    }
  } catch (e) {
    // Worker 渲染失败，降级为主线程渲染
    logger.warn('Worker 渲染失败，降级为主线程渲染', e instanceof Error ? e.message : String(e));
  }

  if (!usedWorker) {
    let drewEmotionCanvas = false;
    if (aiImageUrl) {
      try {
        const img = await loadImage(aiImageUrl);
        drawAIBackground(ctx, img, width, height);
      } catch (e) {
        logger.warn('AI 图片加载失败，降级为 Canvas 背景:', (e as Error).message);
        drewEmotionCanvas = true;
        if (styleSource.isMovie) {
          drawCustomBg(ctx, width, height, styleSource.colors, renderContext);
        } else {
          const bgRenderer = bgRenderers[styleSource.id];
          if (bgRenderer) { bgRenderer(ctx, width, height, renderContext); }
          else { drawCustomBg(ctx, width, height, styleSource.colors, renderContext); }
        }
      }
    } else {
      drewEmotionCanvas = true;
      if (styleSource.isMovie) {
        drawCustomBg(ctx, width, height, styleSource.colors, renderContext);
      } else {
        const bgRenderer = bgRenderers[styleSource.id];
        if (bgRenderer) { bgRenderer(ctx, width, height, renderContext); }
        else { drawCustomBg(ctx, width, height, styleSource.colors, renderContext); }
      }
    }

    // 2. 绘制暗角（情绪化 Canvas 已自带暗角；AI 模式仍需补充）
    if (!drewEmotionCanvas) {
      drawVignette(ctx, width, height, aiImageUrl ? VIGNETTE_INTENSITY_AI : VIGNETTE_INTENSITY_CANVAS);
    }
  }

  // 3. 绘制胶片孔
  drawFilmPerforation(ctx, width, height);

  // 4. 绘制文字层
  const title = customTitle || extractTitle(text, moodTagId ?? null);
  let quote = '';
  if (showQuote) {
    if (customQuote) {
      quote = customQuote;
    } else if (styleSource.isMovie && styleSource.quotes && styleSource.quotes.length > 0) {
      // 电影金句
      quote = styleSource.quotes[Math.floor(Math.random() * styleSource.quotes.length)];
    } else if (typeof quoteIndex === 'number') {
      quote = getQuoteByIndex(styleSource.id, quoteIndex);
    } else {
      quote = getRandomQuote(styleSource.id);
    }
  }

  drawTextLayer(ctx, width, height, {
    title,
    quote,
    directorName: styleSource.name,
    colors: styleSource.colors,
    format,
    fontFamily: customFontFamily || styleSource.fontFamily,
    titleWeight: (typeof customTitleWeight === 'number') ? customTitleWeight : styleSource.titleWeight,
    merged
  });

  // 5. 返回数据
  const dataUrl = await canvasToBlobUrl(canvas);

  return {
    dataUrl,
    title,
    quote,
    director: styleSource.name,
    directorId: styleSource.id,
    format: formatConfig.label,
    width,
    height,
    usedAI: !!aiImageUrl,
    movieRef: styleSource.movieRef || null
  };
}

// ========== DNA 融合（H4: 如果换导演） ==========
function blendDNAs(movieDNA: StyleDNA, directorDNA: StyleDNA, ratio?: number): Record<keyof StyleDNA, string> {
  // ratio: 0 = 纯电影, 1 = 纯导演, 0.5 = 均衡融合
  const r = ratio !== undefined ? ratio : 0.5;
  const keys: (keyof StyleDNA)[] = ['colorTemperature', 'saturation', 'contrast', 'compositionType', 'lightingType', 'scale', 'pace', 'texture'];
  const blended = {} as Record<keyof StyleDNA, string>;
  keys.forEach(k => {
    // 确定性选择：用 key 名做哈希生成 0-1 阈值，避免 Math.random 导致预览/结果不一致
    let hash = 0;
    for (let i = 0; i < k.length; i++) hash = (hash * 31 + k.charCodeAt(i)) % 1000;
    const threshold = hash / 1000;
    blended[k] = threshold < r ? (directorDNA[k] || movieDNA[k]) : (movieDNA[k] || directorDNA[k]);
  });
  return blended;
}

function blendColors(movieColors: DirectorColors, directorColors: DirectorColors, ratio?: number): DirectorColors {
  const r = ratio !== undefined ? ratio : 0.5;
  function mixHex(h1: string, h2: string, t: number): string {
    if (!h1 || !h2) return h1 || h2;
    const r1 = parseInt(h1.slice(1, 3), 16), g1 = parseInt(h1.slice(3, 5), 16), b1 = parseInt(h1.slice(5, 7), 16);
    const r2 = parseInt(h2.slice(1, 3), 16), g2 = parseInt(h2.slice(3, 5), 16), b2 = parseInt(h2.slice(5, 7), 16);
    const rr = Math.round(r1 * (1 - t) + r2 * t);
    const gg = Math.round(g1 * (1 - t) + g2 * t);
    const bb = Math.round(b1 * (1 - t) + b2 * t);
    return '#' + [rr, gg, bb].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  return {
    primary: mixHex(movieColors.primary, directorColors.primary, r),
    secondary: mixHex(movieColors.secondary, directorColors.secondary, r),
    accent: mixHex(movieColors.accent, directorColors.accent, r),
    bg: mixHex(movieColors.bg, directorColors.bg, r),
    text: mixHex(movieColors.text, directorColors.text, r),
    textLight: mixHex(movieColors.textLight, directorColors.textLight, r)
  };
}

function blendPrompts(moviePrompt: string, directorPrompt: string, ratio?: number): string {
  const r = ratio !== undefined ? ratio : 0.5;
  if (!moviePrompt) return directorPrompt || '';
  if (!directorPrompt) return moviePrompt || '';
  // 按比例拼接：前半段电影风格，后半段导演风格
  if (r < 0.3) return moviePrompt + ', with subtle ' + directorPrompt;
  if (r > 0.7) return directorPrompt + ', inspired by ' + moviePrompt;
  return moviePrompt + ', blended with ' + directorPrompt;
}

// ========== 金句卡生成（H7: 电影金句卡） ==========
async function generateQuoteCard(options: GenerateQuoteCardOptions): Promise<PosterGenerateResult> {
  const {
    quote,
    movieTitle,
    movieEnTitle,
    colors,
    fontFamily,
    format = 'square'
  } = options;

  const dims = format === 'vertical' ? { w: 720, h: 1080 } : { w: 800, h: 800 };
  const canvas = createCanvas(dims.w, dims.h);
  const ctx = canvas.getContext('2d')!;
  const w = dims.w, h = dims.h;
  const c: DirectorColors = colors || { bg: '#1a0a0a', primary: '#c0392b', secondary: '#2c3e50', accent: '#f39c12', text: '#f5e6d3', textLight: '#c9a96e' };
  const fontFam = fontFamily || "'Noto Serif SC', serif";

  // 1. 背景：电影色彩渐变 + 暗角
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, c.bg);
  bgGrad.addColorStop(0.5, c.secondary || c.bg);
  bgGrad.addColorStop(1, c.bg);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 主色光晕
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.6);
  glow.addColorStop(0, hexToRgba(c.primary, 0.25));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 纹理光斑
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 30 + 10;
    const sg = ctx.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, hexToRgba(c.accent || c.primary, 0.08));
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // 暗角
  drawVignette(ctx, w, h, 0.4);

  // 2. 顶部装饰线
  const lineY = h * 0.15;
  ctx.strokeStyle = hexToRgba(c.accent || c.primary, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.25, lineY);
  ctx.lineTo(w * 0.75, lineY);
  ctx.stroke();
  // 中心装饰点
  ctx.fillStyle = hexToRgba(c.accent || c.primary, 0.6);
  ctx.beginPath();
  ctx.arc(w * 0.5, lineY, 3, 0, Math.PI * 2);
  ctx.fill();

  // 3. 电影标题（上方小字）
  ctx.font = `400 ${Math.round(w * 0.022)}px "Noto Sans SC", sans-serif`;
  ctx.fillStyle = hexToRgba(c.textLight || c.text, 0.6);
  ctx.textAlign = 'center';
  ctx.fillText(movieTitle || '', w / 2, h * 0.1);

  // 4. 金句主体（居中大字，自动换行）
  const quoteFontSize = Math.round(w * 0.055);
  ctx.font = `700 ${quoteFontSize}px ${fontFam}`;
  ctx.fillStyle = c.text || '#f5e6d3';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const maxWidth = w * 0.75;
  const lineHeight = quoteFontSize * 1.6;
  // 金句可用高度：顶部装饰线下方到底部装饰线上方
  const quoteCardMaxLines = Math.max(1, Math.floor((h * 0.6) / lineHeight));
  const { lines } = wrapText(ctx, quote || '', maxWidth, quoteCardMaxLines);
  const totalHeight = lines.length * lineHeight;
  const startY = h * 0.5 - totalHeight / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    // 引号装饰（首尾行）
    if (i === 0) {
      ctx.font = `400 ${quoteFontSize * 1.5}px ${fontFam}`;
      ctx.fillStyle = hexToRgba(c.accent || c.primary, 0.3);
      ctx.fillText('"', w * 0.15, startY + i * lineHeight - lineHeight * 0.3);
      ctx.font = `700 ${quoteFontSize}px ${fontFam}`;
      ctx.fillStyle = c.text || '#f5e6d3';
    }
    ctx.fillText(line, w / 2, startY + i * lineHeight);
  });

  // 5. 底部装饰线 + 电影英文名
  const bottomLineY = h * 0.85;
  ctx.strokeStyle = hexToRgba(c.accent || c.primary, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(w * 0.25, bottomLineY);
  ctx.lineTo(w * 0.75, bottomLineY);
  ctx.stroke();
  ctx.fillStyle = hexToRgba(c.accent || c.primary, 0.6);
  ctx.beginPath();
  ctx.arc(w * 0.5, bottomLineY, 3, 0, Math.PI * 2);
  ctx.fill();

  // 英文名
  if (movieEnTitle) {
    ctx.font = `300 ${Math.round(w * 0.02)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = hexToRgba(c.textLight || c.text, 0.4);
    ctx.fillText(movieEnTitle, w / 2, h * 0.9);
  }

  // 6. 导出
  const dataUrl = await canvasToBlobUrl(canvas);
  return {
    dataUrl,
    quote,
    movieTitle,
    format: format === 'vertical' ? '金句卡(竖版)' : '金句卡(方版)',
    width: w,
    height: h,
    usedAI: false,
    isQuoteCard: true
  };
}

// ========== 漫画条生成（H8: 多格漫画） ==========
async function generateComicStrip(options: GenerateComicStripOptions): Promise<PosterGenerateResult> {
  const {
    scenes,
    movieId,
    colors,
    fontFamily
  } = options;

  const movie = movieId
    ? ((FALLBACK_MOVIES as Movie[]).find(m => m.id === movieId)
       || ((_getServerMovies ? _getServerMovies() : []) as Movie[]).find(m => m.id === movieId)
       || null)
    : null;

  if (!movie) throw new Error('电影不存在');

  const c: DirectorColors = colors || movie.colors;
  const fontFam = fontFamily || movie.fontFamily || "'Noto Serif SC', serif";

  const panelCount = Math.min(scenes.length, 4);
  const panelW = 800;
  const panelH = 450;
  const gap = 12;
  const totalH = panelCount * panelH + (panelCount - 1) * gap + 80; // 80 = 顶部标题区
  const totalW = panelW;

  const canvas = createCanvas(totalW, totalH);
  const ctx = canvas.getContext('2d')!;

  // 背景
  ctx.fillStyle = c.bg || '#1a1a1a';
  ctx.fillRect(0, 0, totalW, totalH);

  // 顶部标题区
  ctx.fillStyle = c.primary || '#e94560';
  ctx.fillRect(0, 0, totalW, 60);
  ctx.fillStyle = '#fff';
  ctx.font = `700 24px ${fontFam}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${movie.title} · 名场面漫画`, totalW / 2, 30);

  // 逐格绘制
  for (let i = 0; i < panelCount; i++) {
    const x = 0;
    const y = 80 + i * (panelH + gap);

    // 面板背景
    const panelGrad = ctx.createLinearGradient(x, y, x, y + panelH);
    panelGrad.addColorStop(0, hexToRgba(c.secondary || c.primary, 0.3));
    panelGrad.addColorStop(1, hexToRgba(c.bg || '#000', 0.8));
    ctx.fillStyle = panelGrad;
    ctx.fillRect(x, y, panelW, panelH);

    // 面板边框
    ctx.strokeStyle = hexToRgba(c.accent || c.primary, 0.4);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, y + 4, panelW - 8, panelH - 8);

    // 场景编号
    ctx.fillStyle = hexToRgba(c.accent || c.primary, 0.6);
    ctx.font = `700 18px "JetBrains Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`SCENE ${i + 1}`, x + 16, y + 16);

    // 场景标题（如果有）
    if (scenes[i].title) {
      ctx.font = `700 20px ${fontFam}`;
      ctx.fillStyle = c.text || '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(scenes[i].title || '', x + panelW / 2, y + 35);
    }

    // 场景描述文字
    ctx.font = `400 16px ${fontFam}`;
    ctx.fillStyle = c.textLight || c.text || '#ccc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const comicLineHeight = 24;
    const comicMaxLines = Math.max(1, Math.floor((panelH - 100) / comicLineHeight));
    const { lines } = wrapText(ctx, scenes[i].text || '', panelW - 40, comicMaxLines);
    const textStartY = y + 80;
    lines.forEach((line, j) => {
      ctx.fillText(line, x + panelW / 2, textStartY + j * comicLineHeight);
    });

    // 底部装饰
    ctx.strokeStyle = hexToRgba(c.accent || c.primary, 0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + panelH - 20);
    ctx.lineTo(x + panelW - 20, y + panelH - 20);
    ctx.stroke();
  }

  // 底部水印
  ctx.fillStyle = hexToRgba(c.textLight || c.text, 0.3);
  ctx.font = `400 14px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(BRAND_WATERMARK_TEXT, totalW / 2, totalH - 8);

  const dataUrl = await canvasToBlobUrl(canvas);
  return {
    dataUrl,
    title: `${movie.title} · 名场面漫画`,
    format: '漫画条',
    width: totalW,
    height: totalH,
    usedAI: false,
    isComicStrip: true,
    panelCount
  };
}

// ========== 名场面重绘生成（H9: 场景重绘） ==========
async function generateSceneRecreation(options: GenerateSceneRecreationOptions): Promise<PosterGenerateResult> {
  const {
    sceneDescription,
    movieTitle,
    originalScene,
    colors,
    stylePrompt,
    format = 'vertical'
  } = options;

  const result = await generate({
    text: sceneDescription,
    movieId: options.movieId,
    customColors: colors,
    customDNA: options.styleDNA,
    customPrompt: stylePrompt,
    swapLabel: `名场面重绘 · ${movieTitle}`,
    format,
    showQuote: true,
    title: options.customTitle,
    quote: originalScene
  });

  return {
    ...result,
    isSceneRecreation: true,
    originalScene,
    sceneDescription
  };
}

// ========== 猜电影海报生成（H10: 猜电影游戏） ==========
async function generateGuessPoster(options: GenerateGuessPosterOptions): Promise<PosterGenerateResult> {
  const {
    movieId,
    colors,
    fontFamily,
    hintLevel = 2
  } = options;

  const movie = (FALLBACK_MOVIES as Movie[]).find(m => m.id === movieId)
    || ((_getServerMovies ? _getServerMovies() : []) as Movie[]).find(m => m.id === movieId);
  if (!movie) throw new Error('电影不存在');

  const c: DirectorColors = colors || movie.colors;
  const fontFam = fontFamily || movie.fontFamily || "'Noto Serif SC', serif";

  const canvas = createCanvas(720, 1080);
  const ctx = canvas.getContext('2d')!;
  const w = 720, h = 1080;

  // 背景
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, c.bg || '#1a1a2e');
  bgGrad.addColorStop(0.5, c.secondary || c.bg || '#0f3460');
  bgGrad.addColorStop(1, c.bg || '#1a1a2e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 主色光晕
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.5);
  glow.addColorStop(0, hexToRgba(c.primary, 0.2));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 暗角
  drawVignette(ctx, w, h, 0.5);

  // 根据提示级别显示不同信息
  const level = Math.max(1, Math.min(3, hintLevel));
  const hints: Record<number, { title: string; clues: string[] }> = {
    1: {
      title: '🔍 初级提示',
      clues: [
        `导演：${movie.director}`,
        `上映：${movie.releaseDate}`,
        `片名首字：${movie.title[0]}`
      ]
    },
    2: {
      title: '💡 中级提示',
      clues: [
        `导演：${movie.director}`,
        `上映：${movie.releaseDate}`,
        `片名：${movie.title.slice(0, Math.ceil(movie.title.length / 2))}...`,
        `视觉风格：${movie.visualStyle}`
      ]
    },
    3: {
      title: '🎯 高级提示',
      clues: [
        `片名：${movie.title}`,
        `导演：${movie.director}`,
        `上映：${movie.releaseDate}`,
        `视觉风格：${movie.visualStyle}`,
        movie.iconicQuotes && movie.iconicQuotes[0] ? `经典台词：「${movie.iconicQuotes[0]}」` : ''
      ].filter(Boolean)
    }
  };

  const hint = hints[level] || hints[2];

  // 顶部标题
  ctx.fillStyle = c.accent || c.primary;
  ctx.font = `700 28px ${fontFam}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('猜电影', w / 2, 60);

  ctx.fillStyle = c.textLight || c.text;
  ctx.font = `500 18px "Noto Sans SC", sans-serif`;
  ctx.fillText(hint.title, w / 2, 100);

  // 提示内容
  ctx.fillStyle = c.text || '#fff';
  ctx.font = `400 22px ${fontFam}`;
  ctx.textBaseline = 'top';
  hint.clues.forEach((clue, i) => {
    ctx.fillText(clue, w / 2, 200 + i * 50);
  });

  // 底部互动提示
  ctx.fillStyle = hexToRgba(c.textLight || c.text, 0.5);
  ctx.font = `400 16px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('你能猜到这是哪部电影吗？', w / 2, h - 80);
  ctx.fillText(BRAND_WATERMARK_TEXT, w / 2, h - 40);

  const dataUrl = await canvasToBlobUrl(canvas);
  return {
    dataUrl,
    title: '猜电影海报',
    format: '猜电影',
    width: w,
    height: h,
    usedAI: false,
    isGuessPoster: true,
    movieId,
    movieTitle: movie.title,
    hintLevel: level
  };
}

// ========== 角色梗图生成（H11: 角色二创） ==========
async function generateCharacterMeme(options: GenerateCharacterMemeOptions): Promise<PosterGenerateResult> {
  const {
    movieId,
    characterName,
    memeText,
    memeType = 'dialogue',
    colors,
    fontFamily
  } = options;

  const movie = (FALLBACK_MOVIES as Movie[]).find(m => m.id === movieId)
    || ((_getServerMovies ? _getServerMovies() : []) as Movie[]).find(m => m.id === movieId);
  if (!movie) throw new Error('电影不存在');

  const c: DirectorColors = colors || movie.colors;
  const fontFam = fontFamily || movie.fontFamily || "'Noto Serif SC', serif";

  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext('2d')!;
  const w = 800, h = 800;

  // 背景
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, c.bg || '#1a1a2e');
  bgGrad.addColorStop(1, c.secondary || c.bg || '#0f3460');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 主色光晕
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, w * 0.5);
  glow.addColorStop(0, hexToRgba(c.primary, 0.2));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // 暗角
  drawVignette(ctx, w, h, 0.4);

  // 顶部电影标题
  ctx.fillStyle = hexToRgba(c.textLight || c.text, 0.6);
  ctx.font = `500 18px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(movie.title, w / 2, 40);

  // 角色名
  if (characterName) {
    ctx.fillStyle = c.accent || c.primary;
    ctx.font = `700 32px ${fontFam}`;
    ctx.fillText(characterName, w / 2, 80);
  }

  // 梗图类型标签
  const typeLabels: Record<string, string> = { dialogue: '💬 经典台词', parody: '🎭 恶搞改编', reaction: '😱 神反应' };
  ctx.fillStyle = hexToRgba(c.textLight || c.text, 0.4);
  ctx.font = `400 16px "Noto Sans SC", sans-serif`;
  ctx.fillText(typeLabels[memeType] || '💬 二创', w / 2, h * 0.82);

  // 梗图文字（如果有）
  if (memeText) {
    ctx.fillStyle = c.text || '#fff';
    const memeFontSize = 28;
    ctx.font = `700 ${memeFontSize}px ${fontFam}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const memeLineHeight = memeFontSize * 1.4;
    // 梗图文字可用高度：角色名下方到类型标签上方
    const memeTopY = characterName ? 130 : 70;
    const memeBottomY = h * 0.82 - 30;
    const memeMaxLines = Math.max(1, Math.floor((memeBottomY - memeTopY) / memeLineHeight));
    const { lines } = wrapText(ctx, memeText, w * 0.8, memeMaxLines);
    const totalTextH = lines.length * memeLineHeight;
    const startY = h * 0.5 - totalTextH / 2 + memeLineHeight / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * memeLineHeight);
    });
  }

  // 底部水印
  ctx.fillStyle = hexToRgba(c.textLight || c.text, 0.3);
  ctx.font = `400 14px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(BRAND_WATERMARK_TEXT, w / 2, h - 20);

  const dataUrl = await canvasToBlobUrl(canvas);
  return {
    dataUrl,
    title: characterName ? `${characterName} 梗图` : '角色梗图',
    format: '角色梗图',
    width: w,
    height: h,
    usedAI: false,
    isCharacterMeme: true,
    movieId,
    characterName,
    memeType
  };
}

// 纯函数导出（供单元测试使用）
const _pure = {
  wrapText,
  roundRect,
  blendDNAs,
  blendColors,
  blendPrompts
};

// ========== 导出 ==========
export {
  generate,
  generateGrid9,
  generateQuoteCard,
  generateComicStrip,
  generateSceneRecreation,
  generateGuessPoster,
  generateCharacterMeme,
  blendDNAs,
  blendColors,
  blendPrompts,
  _pure
};
