/**
 * 造境 ZaoJing — 品牌工具包模块
 * 提供 Logo 叠加、文字水印、品牌色板功能
 * 作为海报生成后的后处理步骤，不修改 poster-engine
 */

import { logger } from './logger.js';

// ========== 品牌配置 ==========

/**
 * @typedef {Object} BrandConfig
 * @property {string|null} logoDataUrl - Logo 图片的 data URL
 * @property {string} logoPosition - Logo 位置：'top-left'|'top-right'|'bottom-left'|'bottom-right'
 * @property {number} logoSize - Logo 大小占海报宽度的比例 (0.05-0.25)
 * @property {number} logoOpacity - Logo 不透明度 (0-1)
 * @property {string} watermarkText - 水印文字
 * @property {number} watermarkOpacity - 水印不透明度 (0-1)
 * @property {string} watermarkPosition - 水印位置
 * @property {number} watermarkFontSize - 水印字体大小 (px)
 * @property {boolean} enabled - 是否启用品牌工具
 */

/** @type {BrandConfig} */
export const DEFAULT_BRAND_CONFIG = {
  logoDataUrl: null,
  logoPosition: 'bottom-right',
  logoSize: 0.12,
  logoOpacity: 0.85,
  watermarkText: '',
  watermarkOpacity: 0.3,
  watermarkPosition: 'center',
  watermarkFontSize: 24,
  enabled: false,
};

const STORAGE_KEY = 'zaojing_brand_config';

// ========== 配置持久化 ==========

/**
 * 从 localStorage 加载品牌配置
 * @returns {BrandConfig}
 */
export function loadBrandConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...DEFAULT_BRAND_CONFIG };
    const parsed = JSON.parse(saved);
    return { ...DEFAULT_BRAND_CONFIG, ...parsed };
  } catch (e) {
    logger.warn('[brand-toolkit] 加载品牌配置失败:', e.message);
    return { ...DEFAULT_BRAND_CONFIG };
  }
}

/**
 * 保存品牌配置到 localStorage
 * @param {BrandConfig} config
 */
export function saveBrandConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    // localStorage 可能被禁用或已满，存储失败不影响功能
    logger.warn('[brand-toolkit] 保存品牌配置失败:', e.message);
  }
}

/**
 * 重置品牌配置为默认值
 */
export function resetBrandConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // localStorage 可能被禁用
    logger.debug('[brand-toolkit] 重置品牌配置失败:', e.message);
  }
}

// ========== Logo 加载 ==========

/**
 * 从 File 对象加载 Logo 图片
 * @param {File} file - 图片文件
 * @returns {Promise<string>} Logo 的 data URL
 */
export function loadLogoFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('未提供文件'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('请上传图片文件（PNG/JPG）'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Logo 图片不能超过 2MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

// ========== 品牌叠加渲染 ==========

/**
 * 在 canvas 上绘制品牌元素（Logo + 水印）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {BrandConfig} config
 * @param {HTMLImageElement|null} logoImg - 已加载的 Logo 图片元素
 */
export function drawBranding(ctx, width, height, config, logoImg) {
  if (!config || !config.enabled) return;

  // 绘制水印
  if (config.watermarkText && config.watermarkText.trim()) {
    drawWatermark(ctx, width, height, config);
  }

  // 绘制 Logo
  if (logoImg && config.logoDataUrl) {
    drawLogo(ctx, width, height, config, logoImg);
  }
}

/**
 * 绘制水印文字
 */
function drawWatermark(ctx, width, height, config) {
  ctx.save();
  ctx.globalAlpha = config.watermarkOpacity;
  ctx.fillStyle = '#ffffff';
  ctx.font = `${config.watermarkFontSize}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const { x, y } = getPositionCoords(config.watermarkPosition, width, height, 0, 0);

  // 支持多行水印（平铺模式）
  if (config.watermarkPosition === 'tile') {
    drawTiledWatermark(ctx, width, height, config);
  } else {
    // 旋转水印（斜45度）
    ctx.translate(x, y);
    ctx.rotate((-30 * Math.PI) / 180);
    ctx.fillText(config.watermarkText, 0, 0);
  }

  ctx.restore();
}

/**
 * 平铺水印
 */
function drawTiledWatermark(ctx, width, height, config) {
  ctx.save();
  ctx.globalAlpha = config.watermarkOpacity;
  ctx.fillStyle = '#ffffff';
  ctx.font = `${config.watermarkFontSize}px "Noto Sans SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const spacing = config.watermarkFontSize * 6;
  const angle = (-30 * Math.PI) / 180;

  for (let y = -height; y < height * 2; y += spacing) {
    for (let x = -width; x < width * 2; x += spacing) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillText(config.watermarkText, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

/**
 * 绘制 Logo
 */
function drawLogo(ctx, width, height, config, logoImg) {
  if (!logoImg || !logoImg.complete || logoImg.naturalWidth === 0) return;

  ctx.save();
  ctx.globalAlpha = config.logoOpacity;

  const logoW = width * config.logoSize;
  const logoH = (logoImg.naturalHeight / logoImg.naturalWidth) * logoW;
  const margin = width * 0.03;

  const { x, y } = getPositionCoords(config.logoPosition, width, height, logoW, logoH, margin);

  // 绘制 Logo（支持透明 PNG）
  ctx.drawImage(logoImg, x, y, logoW, logoH);

  ctx.restore();
}

/**
 * 根据位置标识符计算坐标
 */
function getPositionCoords(position, width, height, elementW, elementH, margin) {
  margin = margin || 0;
  switch (position) {
    case 'top-left':
      return { x: margin, y: margin };
    case 'top-right':
      return { x: width - elementW - margin, y: margin };
    case 'bottom-left':
      return { x: margin, y: height - elementH - margin };
    case 'bottom-right':
      return { x: width - elementW - margin, y: height - elementH - margin };
    case 'center':
      return { x: width / 2, y: height / 2 };
    case 'tile':
    default:
      return { x: 0, y: 0 };
  }
}

/**
 * 对已生成的海报图片应用品牌元素
 * @param {string} dataUrl - 原始海报的 data URL / blob URL
 * @param {BrandConfig} config - 品牌配置
 * @returns {Promise<string>} 应用品牌后的新 data URL
 */
export async function applyBrandingToImage(dataUrl, config) {
  if (!config || !config.enabled) return dataUrl;
  if (!config.watermarkText && !config.logoDataUrl) return dataUrl;

  // 加载原始海报图片
  const posterImg = await loadImage(dataUrl);

  const canvas = document.createElement('canvas');
  canvas.width = posterImg.naturalWidth;
  canvas.height = posterImg.naturalHeight;
  const ctx = canvas.getContext('2d');

  // 绘制原始海报
  ctx.drawImage(posterImg, 0, 0);

  // 加载 Logo（如果有）
  let logoImg = null;
  if (config.logoDataUrl) {
    try {
      logoImg = await loadImage(config.logoDataUrl);
    } catch (e) {
      // Logo 加载失败，跳过 Logo 叠加（不影响海报生成）
      logger.warn('[brand-toolkit] Logo 加载失败，跳过:', e.message);
    }
  }

  // 绘制品牌元素
  drawBranding(ctx, canvas.width, canvas.height, config, logoImg);

  // 导出为 data URL（避免 blob URL 内存泄漏）
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          // 将 blob 转为 data URL，无需 revokeObjectURL
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(dataUrl);
          reader.readAsDataURL(blob);
        } else {
          resolve(dataUrl); // 降级返回原图
        }
      },
      'image/png',
      0.95
    );
  });
}

/**
 * 加载图片（Promise 封装）
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

// ========== 位置选项 ==========

export const LOGO_POSITIONS = [
  { id: 'top-left', label: '左上角' },
  { id: 'top-right', label: '右上角' },
  { id: 'bottom-left', label: '左下角' },
  { id: 'bottom-right', label: '右下角' },
];

export const WATERMARK_POSITIONS = [
  { id: 'center', label: '居中' },
  { id: 'tile', label: '平铺' },
];
