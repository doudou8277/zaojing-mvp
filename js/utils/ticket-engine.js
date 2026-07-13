/**
 * 造境 ZaoJing — 旅行票根渲染引擎 v2.0
 * 基于 Canvas 2D API 渲染电影感旅行票根
 *
 * v2.0 新增：
 *  - 条形码（drawBarcode）：随机黑白竖条 + 票号数字
 *  - 路线可视化（drawRoute）：出发地 → 目的地，虚线 + 小箭头
 *  - 装饰印章（drawStamp）：圆形双线边框 + 日期 / TRAVEL，随机旋转
 *  - QR 码装饰（drawQRCode）：黑白方块图案 + 三个定位点
 *  - 照片滤镜（applyPhotoFilter）：none / vintage / film / mono
 *  - 增强纸张质感：纤维方向 + 边缘磨损 + 咖啡渍 + 暗角
 *  - 重构信息区布局：路线 → 目的地 → 日期 → 心情 → 分隔线 → 三列 → 条形码 → 打孔
 *
 * 保持：
 *  - 12 位导演风格配色 + 默认风格
 *  - 3 种版式（vertical / square / horizontal）
 *  - renderTicket / getStyleColors / getFormatSize / canvasToDataUrl 对外 API
 *
 * 设计参考：与 poster-engine.ts 保持一致的 Canvas 2D 渲染范式，
 * 复用 utils/canvas.js 的 hexToRgba 与 utils/logger.js 的统一日志。
 */

import { hexToRgba } from './canvas.js';
import { logger } from './logger.js';

// ========== 版式尺寸配置 ==========
//
// 每种版式包含画布尺寸与排版参数：
//  - photoRatio : 照片区域占画布高度的比例
//  - dest/date/mood/info : 各级文字字号（px）
//  - destLines/moodLines : 目的地 / 心情文案最大行数（超出截断加省略号）
//  - padding : 信息区内边距
//  - corner : 照片顶部圆角半径
//  - notch : 底部打孔半径
const FORMAT_CONFIG = {
  // 竖版 3:4
  vertical: {
    width: 1080,
    height: 1440,
    photoRatio: 0.55,
    dest: 56,
    date: 24,
    mood: 36,
    info: 20,
    destLines: 2,
    moodLines: 3,
    padding: 72,
    corner: 16,
    notch: 12,
  },
  // 方形 1:1
  square: {
    width: 1080,
    height: 1080,
    photoRatio: 0.55,
    dest: 60,
    date: 24,
    mood: 34,
    info: 20,
    destLines: 2,
    moodLines: 2,
    padding: 64,
    corner: 16,
    notch: 12,
  },
  // 横版 16:7 (更舒展的电影宽幅比例)
  horizontal: {
    width: 1080,
    height: 560,
    photoRatio: 0.42,
    dest: 44,
    date: 18,
    mood: 24,
    info: 16,
    destLines: 1,
    moodLines: 1,
    padding: 40,
    corner: 12,
    notch: 10,
  },
};

// ========== 导演风格配色 ==========
//
// 每个风格返回 { primary, secondary, text, bg, accent }
//  - bg    : 票根信息区背景色
//  - text  : 主文字色（目的地等）
//  - accent: 心情文案强调色
//  - primary/secondary : 照片兜底 / 装饰色
const STYLE_COLORS = {
  miyazaki: { primary: '#5b9bd5', secondary: '#8fbc8f', text: '#2a3a2a', bg: '#f5f0e6', accent: '#7ec8a0' },
  wkw: { primary: '#c8a02e', secondary: '#2d5a3d', text: '#f0e8d0', bg: '#1a1a14', accent: '#e8b848' },
  koreeda: { primary: '#a0b89c', secondary: '#d4c5a0', text: '#3a3a2a', bg: '#faf6ee', accent: '#c4a878' },
  wes: { primary: '#e89a7e', secondary: '#7ab0c4', text: '#4a3a3a', bg: '#f5ebe0', accent: '#d4857a' },
  nolan: { primary: '#6a8caf', secondary: '#3a4a5a', text: '#d0d8e0', bg: '#1a1e24', accent: '#8aa4c4' },
  chow: { primary: '#e8c828', secondary: '#d44848', text: '#3a2a1a', bg: '#fdf5e6', accent: '#f0a030' },
  jia: { primary: '#8a7a5a', secondary: '#5a5a4a', text: '#c4b8a0', bg: '#2a2620', accent: '#a89878' },
  lee: { primary: '#7a9a8a', secondary: '#b0a890', text: '#3a3a30', bg: '#f0ece4', accent: '#9ab4a4' },
  kurosawa: { primary: '#8a8a8a', secondary: '#5a5a5a', text: '#e0e0e0', bg: '#1a1a1a', accent: '#aaaaaa' },
  coppola: { primary: '#c4a4a0', secondary: '#8a9ab0', text: '#4a3a3a', bg: '#f0ebe6', accent: '#d4b8b4' },
  chazelle: { primary: '#7a4ac4', secondary: '#e84858', text: '#f0e8e0', bg: '#1a1420', accent: '#b878e8' },
  tarantino: { primary: '#e84848', secondary: '#e8c828', text: '#f0e8d0', bg: '#2a1410', accent: '#f06848' },
  default: { primary: '#c87f2e', secondary: '#3d7a8c', text: '#2a2218', bg: '#faf6ef', accent: '#c87f2e' },
};

// 风格 ID → 中文名称（用于底部信息行的风格署名）
const STYLE_NAMES = {
  miyazaki: '宫崎骏',
  wkw: '王家卫',
  koreeda: '是枝裕和',
  wes: '韦斯·安德森',
  nolan: '诺兰',
  chow: '周星驰',
  jia: '贾樟柯',
  lee: '李安',
  kurosawa: '黑泽明',
  coppola: '索菲亚·科波拉',
  chazelle: '查泽雷',
  tarantino: '昆汀',
  default: '造境',
};

// ========== 票根类型配置 ==========
//
// 每种票根类型对应一种照片滤镜，供上层 UI 选择
const TICKET_TYPES = [
  { id: 'classic', name: '经典原片', photoFilter: 'none', desc: '保留原图真实色彩' },
  { id: 'vintage', name: '复古胶片', photoFilter: 'vintage', desc: '暖黄复古色调' },
  { id: 'film', name: '电影胶片', photoFilter: 'film', desc: '降饱和高对比胶片感' },
  { id: 'mono', name: '黑白默片', photoFilter: 'mono', desc: '黑白电影质感' },
];

// ========== 通用小工具 ==========

/**
 * 将数值钳制到 0-255 范围（用于像素操作）
 * @param {number} v
 * @returns {number}
 */
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * 基于种子的伪随机数生成器（mulberry32 变体）
 * 同一种子始终产生同一序列，保证同一票根的条形码/印章/QR 一致
 * @param {string|number} seed
 * @returns {() => number} 返回 [0,1) 的随机数
 */
function createRng(seed) {
  let s = 0;
  const str = String(seed || 'zaojing');
  for (let i = 0; i < str.length; i++) {
    s = (Math.imul(s, 31) + str.charCodeAt(i)) >>> 0;
  }
  if (s === 0) s = 0x9e3779b9; // 避免全 0 种子
  return function rng() {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 判断颜色是否为深色（用于调整纹理强度）
 * @param {string} hex - #RRGGBB 格式颜色
 * @returns {boolean}
 */
function isDarkColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // 感知亮度公式
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

// ========== 对外 API ==========

/**
 * 获取导演风格对应的颜色配置
 * @param {string} styleId - 导演风格 ID
 * @returns {{primary:string,secondary:string,text:string,bg:string,accent:string}} 颜色配置
 */
export function getStyleColors(styleId) {
  return STYLE_COLORS[styleId] || STYLE_COLORS.default;
}

/**
 * 获取版式尺寸
 * @param {'vertical'|'square'|'horizontal'} format - 版式 ID
 * @returns {{width:number,height:number}} 画布宽高
 */
export function getFormatSize(format) {
  const fmt = FORMAT_CONFIG[format] || FORMAT_CONFIG.vertical;
  return { width: fmt.width, height: fmt.height };
}

/**
 * 获取可用的票根类型列表（对应不同照片滤镜）
 * @returns {Array<{id:string,name:string,photoFilter:string,desc:string}>}
 */
export function getTicketTypes() {
  return TICKET_TYPES.map((t) => ({ ...t }));
}

/**
 * 将 canvas 导出为 data URL
 * 优先 WebP（quality 0.92，体积约为 PNG 的 60-70%），不支持时回退 PNG
 * @param {HTMLCanvasElement} canvas - 目标 canvas
 * @returns {string} data URL
 */
export function canvasToDataUrl(canvas) {
  // 部分浏览器在不支持 WebP 时会静默回退为 PNG，因此需校验真实 MIME
  try {
    const url = canvas.toDataURL('image/webp', 0.92);
    if (url && url.startsWith('data:image/webp')) {
      return url;
    }
  } catch (e) {
    logger.warn('票根 WebP 导出失败，降级为 PNG:', e instanceof Error ? e.message : String(e));
  }
  return canvas.toDataURL('image/png');
}

/**
 * 对当前 ctx 已绘制的像素区域应用照片滤镜
 * 使用 ImageData 逐像素操作，需保证画布未被跨域污染
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width - 待处理区域宽
 * @param {number} height - 待处理区域高
 * @param {'none'|'vintage'|'film'|'mono'} filter - 滤镜类型
 */
export function applyPhotoFilter(ctx, width, height, filter) {
  if (!filter || filter === 'none') return;

  let imgData;
  try {
    imgData = ctx.getImageData(0, 0, width, height);
  } catch (e) {
    // 跨域图片会污染画布导致 getImageData 抛错，降级为不应用滤镜
    logger.warn('applyPhotoFilter: 无法读取像素（可能跨域污染）:', e instanceof Error ? e.message : String(e));
    return;
  }
  const d = imgData.data;

  switch (filter) {
    case 'vintage': {
      // 复古暖色调：增强红/黄通道，压低蓝通道
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        d[i] = clamp255(r * 1.12 + 18);
        d[i + 1] = clamp255(g * 1.04 + 8);
        d[i + 2] = clamp255(b * 0.82);
      }
      break;
    }
    case 'film': {
      // 胶片质感：降饱和 + 提对比度
      const sat = 0.72; // 饱和度系数
      const con = 1.18; // 对比度系数
      const mid = 128;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        let nr = gray + (r - gray) * sat;
        let ng = gray + (g - gray) * sat;
        let nb = gray + (b - gray) * sat;
        nr = (nr - mid) * con + mid;
        ng = (ng - mid) * con + mid;
        nb = (nb - mid) * con + mid;
        d[i] = clamp255(nr);
        d[i + 1] = clamp255(ng);
        d[i + 2] = clamp255(nb);
      }
      break;
    }
    case 'mono': {
      // 黑白：按感知亮度灰度化
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = gray;
        d[i + 1] = gray;
        d[i + 2] = gray;
      }
      break;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // film：叠加暗角增强胶片感
  if (filter === 'film') {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.3,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // vintage：叠加极淡暖色暗角
  if (filter === 'vintage') {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.35,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.7
    );
    grad.addColorStop(0, 'rgba(255,220,150,0)');
    grad.addColorStop(1, 'rgba(120,70,20,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/**
 * 渲染旅行票根到 Canvas
 * @param {HTMLCanvasElement} canvas - 目标 canvas
 * @param {Object} options - 渲染选项
 * @param {string} options.photoUrl - 旅行照片 URL（data URL 或远程 URL）
 * @param {string} options.destination - 目的地名称，如 "大理·洱海"
 * @param {string} options.date - 日期，如 "2026.05.20"
 * @param {string} options.moodText - AI生成的心情文案
 * @param {string} options.styleId - 导演风格ID
 * @param {'vertical'|'square'|'horizontal'} options.format - 版式
 * @param {Object} options.emotion - 情绪数据 { primary, intensity, tags, sceneType }
 * @param {string} options.ticketNumber - 票根编号，如 "NO.001"
 * @param {Object} options.colors - 颜色配置 { primary, secondary, text, bg, accent }
 * @param {string} [options.origin='HOME'] - 出发地（路线行左侧文字）
 * @param {'none'|'vintage'|'film'|'mono'} [options.photoFilter='none'] - 照片滤镜
 * @returns {Promise<void>}
 */
export async function renderTicket(canvas, options) {
  if (!canvas) {
    logger.error('renderTicket: canvas 不能为空');
    return;
  }

  const {
    photoUrl = '',
    destination = '未知目的地',
    date = '',
    moodText = '',
    styleId = 'default',
    format = 'vertical',
    emotion = {},
    ticketNumber = 'NO.001',
    colors: customColors,
    origin = 'HOME',
    photoFilter = 'none',
  } = options || {};

  const fmt = FORMAT_CONFIG[format] || FORMAT_CONFIG.vertical;
  const { width, height } = fmt;

  // 设置画布尺寸（覆盖传入 canvas 的旧尺寸）
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    logger.error('renderTicket: 无法获取 Canvas 2D 上下文');
    return;
  }

  // 合并颜色配置：风格色为底，允许 options.colors 部分覆盖
  const colors = {
    ...getStyleColors(styleId),
    ...(customColors || {}),
  };

  // 等待字体就绪，避免首屏渲染时字体未加载导致回退
  try {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch {
    // 字体加载失败不阻塞渲染
  }

  // 种子：保证同一票根的条形码 / 印章 / QR / 边缘磨损始终一致
  const seed = `${ticketNumber}|${destination}|${date}|${styleId}`;
  const rng = createRng(seed);

  // 1. 信息区背景（整张铺底，照片区随后覆盖）
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  // 2. 照片区（顶部，圆角裁剪 + cover 适配 + 滤镜）
  const photoHeight = Math.round(height * fmt.photoRatio);
  await drawPhoto(ctx, photoUrl, width, photoHeight, colors, fmt.corner, photoFilter);

  // 3. 虚线撕裂线 + 两侧半圆缺口
  drawPerforation(ctx, width, photoHeight, colors, fmt);

  // 4. 信息区：路线 / 目的地 / 日期 / 心情 / 分隔线 / 三列 / 条形码+QR / 底部打孔
  drawInfoArea(ctx, {
    width,
    height,
    photoHeight,
    colors,
    fmt,
    destination,
    date,
    moodText,
    ticketNumber,
    styleId,
    emotion,
    origin,
    rng,
  });

  // 5. 纸张质感叠加（噪点 + 纤维 + 咖啡渍 + 暗角 + 边缘磨损）
  drawPaperTexture(ctx, width, height, colors, photoHeight, rng);

  // 6. 装饰印章（最后绘制，浮于质感之上，半透明强调色）
  const stampR = Math.round(fmt.dest * 0.9);
  const stampCx = width - fmt.padding - stampR * 0.55;
  const stampCy = photoHeight - stampR * 0.35;
  drawStamp(ctx, stampCx, stampCy, stampR, date, colors, rng);
}

// ========== 内部工具：图片加载与绘制 ==========

/**
 * 加载图片，设置 crossOrigin 以便后续 toDataURL 不被污染
 * @param {string} src - 图片地址（data URL / blob / https）
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      reject(new Error(`图片加载失败: ${src}`));
    };
    img.src = src;
  });
}

/**
 * 以 cover 方式将图片绘制到指定矩形区域（保持比例、居中裁剪、铺满）
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} img
 * @param {number} dx - 目标 x
 * @param {number} dy - 目标 y
 * @param {number} dw - 目标宽
 * @param {number} dh - 目标高
 */
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const imgRatio = img.width / img.height;
  const targetRatio = dw / dh;
  let sx, sy, sw, sh;

  if (imgRatio > targetRatio) {
    // 图片更宽，裁剪左右
    sh = img.height;
    sw = sh * targetRatio;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    // 图片更高，裁剪上下
    sw = img.width;
    sh = sw / targetRatio;
    sx = 0;
    sy = (img.height - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * 绘制仅顶部圆角的矩形路径（底部为直角，与撕裂线衔接）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r - 圆角半径
 */
function roundTopRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ========== 内部工具：文字换行 ==========

/**
 * 按最大宽度换行，支持 CJK 逐字断行与英文按字符断行
 * 超过 maxLines 时在最后一行追加省略号
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text - 原文
 * @param {number} maxWidth - 单行最大宽度
 * @param {number} maxLines - 最大行数
 * @returns {string[]} 换行后的行数组
 */
function wrapText(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let truncated = false;
  let line = '';
  const chars = Array.from(String(text));

  for (let i = 0; i < chars.length; i++) {
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }
    const ch = chars[i];
    if (ch === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line = test;
    }
  }

  if (!truncated) {
    if (line) lines.push(line);
    return lines;
  }

  // 截断：在最后一行末尾追加省略号
  let last = lines[maxLines - 1] || '';
  while (last.length > 0 && ctx.measureText(last + '…').width > maxWidth) {
    last = last.slice(0, -1);
  }
  lines[maxLines - 1] = last + '…';
  return lines;
}

// ========== 内部工具：风格 / 情绪辅助 ==========

/**
 * 根据风格 ID 获取中文名称
 * @param {string} styleId
 * @returns {string}
 */
function getStyleName(styleId) {
  return STYLE_NAMES[styleId] || STYLE_NAMES.default;
}

/**
 * 从情绪数据中提取展示用标签
 * 优先级：tags[0] > primary > sceneType
 * @param {Object} emotion - 情绪数据
 * @returns {string}
 */
function pickEmotionTag(emotion) {
  if (!emotion) return '';
  if (Array.isArray(emotion.tags) && emotion.tags.length) return String(emotion.tags[0]);
  if (emotion.primary) return String(emotion.primary);
  if (emotion.sceneType) return String(emotion.sceneType);
  return '';
}

// ========== 内部绘制：照片区（含滤镜） ==========

/**
 * 绘制照片区：顶部圆角裁剪 + cover 适配 + 滤镜 + 底部渐变过渡
 * 图片缺失或加载失败时降级为渐变占位
 *
 * 为避免 putImageData 破坏圆角裁剪，先将照片绘制到离屏 canvas，
 * 在离屏 canvas 上应用滤镜，再 drawImage 回主 canvas（受 clip 保护）
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} photoUrl
 * @param {number} width
 * @param {number} photoHeight
 * @param {Object} colors
 * @param {number} corner - 圆角半径
 * @param {string} filter - 照片滤镜
 */
async function drawPhoto(ctx, photoUrl, width, photoHeight, colors, corner, filter) {
  // 离屏 canvas 绘制照片 + 滤镜，避免污染主画布的圆角裁剪
  const off = document.createElement('canvas');
  off.width = width;
  off.height = photoHeight;
  const offCtx = off.getContext('2d');

  // 兜底底色
  offCtx.fillStyle = colors.secondary;
  offCtx.fillRect(0, 0, width, photoHeight);

  let drewPhoto = false;
  if (photoUrl) {
    try {
      const img = await loadImage(photoUrl);
      drawImageCover(offCtx, img, 0, 0, width, photoHeight);
      drewPhoto = true;
    } catch (e) {
      logger.warn('票根照片加载失败，使用占位背景:', e instanceof Error ? e.message : String(e));
    }
  }

  if (!drewPhoto) {
    drawPhotoPlaceholder(offCtx, width, photoHeight, colors);
  }

  // 在离屏画布上应用滤镜
  applyPhotoFilter(offCtx, width, photoHeight, filter);

  // 绘制到主画布（顶部圆角裁剪）
  ctx.save();
  roundTopRect(ctx, 0, 0, width, photoHeight, corner);
  ctx.clip();
  ctx.drawImage(off, 0, 0);

  // 底部渐变过渡到信息区背景，柔化照片与撕裂线的衔接
  const fadeHeight = Math.min(140, photoHeight * 0.25);
  if (fadeHeight > 0) {
    const grad = ctx.createLinearGradient(0, photoHeight - fadeHeight, 0, photoHeight);
    grad.addColorStop(0, hexToRgba(colors.bg, 0));
    grad.addColorStop(1, hexToRgba(colors.bg, 0.85));
    ctx.fillStyle = grad;
    ctx.fillRect(0, photoHeight - fadeHeight, width, fadeHeight);
  }

  ctx.restore();
}

/**
 * 绘制照片占位背景（渐变 + 提示文字）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} photoHeight
 * @param {Object} colors
 */
function drawPhotoPlaceholder(ctx, width, photoHeight, colors) {
  const grad = ctx.createLinearGradient(0, 0, width, photoHeight);
  grad.addColorStop(0, colors.primary);
  grad.addColorStop(1, colors.secondary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, photoHeight);

  // 居中提示
  ctx.save();
  ctx.fillStyle = hexToRgba(colors.bg, 0.55);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `28px "PingFang SC", sans-serif`;
  ctx.fillText('TRAVEL · 旅行票根', width / 2, photoHeight / 2);
  ctx.restore();
}

// ========== 内部绘制：撕裂线 ==========

/**
 * 绘制虚线撕裂线（票根撕开线）+ 左右两侧半圆缺口
 * 两侧缺口用 bg 色填充，咬入照片边缘，模拟票据穿孔
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} y - 撕裂线 y 坐标
 * @param {Object} colors
 * @param {Object} fmt - 版式配置（用于 notch 半径）
 */
function drawPerforation(ctx, width, y, colors, fmt) {
  ctx.save();

  // 虚线
  ctx.strokeStyle = hexToRgba(colors.text, 0.35);
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 两侧半圆缺口（圆心贴在边缘，仅靠内半侧可见，咬入照片）
  ctx.fillStyle = colors.bg;
  const r = fmt?.notch || 12;
  ctx.beginPath();
  ctx.arc(0, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ========== 内部绘制：路线可视化 ==========

/**
 * 绘制路线行：左侧出发地 ──虚线──→ 右侧目的地
 * 虚线上方有一个小箭头符号，两端有小圆点模拟"站点"
 * 使用小字号、弱化色，置于信息区顶部
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - 起始 x
 * @param {number} y - 行中心 y
 * @param {number} width - 可用宽度
 * @param {string} origin - 出发地
 * @param {string} destination - 目的地
 * @param {Object} colors
 * @param {Object} fmt - 版式配置
 */
function drawRoute(ctx, x, y, width, origin, destination, colors, fmt) {
  ctx.save();

  const fontSize = Math.max(13, Math.round(fmt.info * 0.85));
  ctx.font = `${fontSize}px "SF Mono", "Menlo", monospace`;
  ctx.textBaseline = 'middle';

  // 出发地（左）
  ctx.fillStyle = hexToRgba(colors.text, 0.55);
  ctx.textAlign = 'left';
  ctx.fillText(origin, x, y);

  // 目的地（右）
  ctx.textAlign = 'right';
  ctx.fillText(destination, x + width, y);

  // 计算两端文字宽度，确定虚线起止
  const oW = ctx.measureText(origin).width;
  const dW = ctx.measureText(destination).width;
  const lineX1 = x + oW + 14;
  const lineX2 = x + width - dW - 14;

  if (lineX2 > lineX1) {
    // 虚线连接
    ctx.strokeStyle = hexToRgba(colors.text, 0.35);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(lineX1, y);
    ctx.lineTo(lineX2, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 两端站点小圆点
    ctx.fillStyle = hexToRgba(colors.text, 0.45);
    ctx.beginPath();
    ctx.arc(lineX1, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lineX2, y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 中点上方小箭头（指向目的地）
    const midX = (lineX1 + lineX2) / 2;
    const ah = fontSize * 0.45;
    const arrowY = y - fontSize * 0.95;
    ctx.fillStyle = hexToRgba(colors.accent, 0.85);
    ctx.beginPath();
    ctx.moveTo(midX - ah, arrowY - ah * 0.7);
    ctx.lineTo(midX + ah, arrowY);
    ctx.lineTo(midX - ah, arrowY + ah * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

// ========== 内部绘制：条形码 ==========

/**
 * 绘制视觉条形码：随机黑白竖条 + 下方一行票号数字
 * 宽度占信息区约 60%，居中放置；同一 seed 保持一致
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - 条形码中心 x
 * @param {number} topY - 条形码顶部 y
 * @param {number} width - 条形码总宽
 * @param {number} barHeight - 竖条高度
 * @param {Object} colors
 * @param {() => number} rng - 种子随机函数
 * @param {Object} fmt - 版式配置
 */
function drawBarcode(ctx, cx, topY, width, barHeight, colors, rng, fmt) {
  ctx.save();

  const left = cx - width / 2;
  const right = left + width;

  // 起始保护条（纯黑边条，增强真实感）
  ctx.fillStyle = colors.text;
  ctx.fillRect(left, topY, 2, barHeight);
  ctx.fillRect(left + 5, topY, 1, barHeight);
  ctx.fillRect(right - 7, topY, 1, barHeight);
  ctx.fillRect(right - 2, topY, 2, barHeight);

  // 中间随机竖条
  let x = left + 10;
  while (x < right - 10) {
    const w = 1 + Math.floor(rng() * 4); // 1-4px 宽
    if (x + w > right - 10) break;
    if (rng() > 0.42) {
      ctx.fillStyle = colors.text;
      ctx.fillRect(x, topY, w, barHeight);
    }
    x += w;
  }

  // 条形码下方票号数字（分组显示，模拟真实票号）
  const digitFont = Math.max(12, Math.round(fmt.info * 0.85));
  ctx.fillStyle = hexToRgba(colors.text, 0.75);
  ctx.font = `${digitFont}px "SF Mono", "Menlo", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  let digits = '';
  for (let i = 0; i < 13; i++) digits += Math.floor(rng() * 10);
  const grouped = `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
  ctx.fillText(grouped, cx, topY + barHeight + 4);

  ctx.restore();
}

// ========== 内部绘制：装饰印章 ==========

/**
 * 绘制圆形装饰印章：双线边框 + 日期 + TRAVEL + 中间分隔线
 * 带轻微随机旋转（-15° ~ 15°），使用半透明强调色
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - 圆心 x
 * @param {number} cy - 圆心 y
 * @param {number} radius - 半径
 * @param {string} date - 印章顶部日期
 * @param {Object} colors
 * @param {() => number} rng - 种子随机函数（决定旋转角度）
 */
function drawStamp(ctx, cx, cy, radius, date, colors, rng) {
  ctx.save();

  // 随机旋转 -15° ~ 15°
  const angle = (rng() * 30 - 15) * (Math.PI / 180);
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const stroke = hexToRgba(colors.accent, 0.5);
  const fill = hexToRgba(colors.accent, 0.55);

  // 外圈
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, radius * 0.06);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  // 内圈
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
  ctx.stroke();

  // 中间水平分隔线
  ctx.strokeStyle = hexToRgba(colors.accent, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-radius * 0.5, 0);
  ctx.lineTo(radius * 0.5, 0);
  ctx.stroke();

  // 顶部日期
  ctx.fillStyle = fill;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(radius * 0.3)}px "SF Mono", "Menlo", monospace`;
  const topText = date ? String(date) : 'TRAVEL';
  ctx.fillText(topText, 0, -radius * 0.3);

  // 底部 TRAVEL
  ctx.font = `bold ${Math.round(radius * 0.26)}px "PingFang SC", sans-serif`;
  ctx.fillText('TRAVEL', 0, radius * 0.3);

  ctx.restore();
}

// ========== 内部绘制：QR 码装饰 ==========

/**
 * 判断某个单元格是否落在三个定位点区域内（避免数据格覆盖定位点）
 * @param {number} i - 列索引
 * @param {number} j - 行索引
 * @param {number} cells - 总格数
 * @returns {boolean}
 */
function inFinderRegion(i, j, cells) {
  if (i < 3 && j < 3) return true; // 左上
  if (i >= cells - 3 && j < 3) return true; // 右上
  if (i < 3 && j >= cells - 3) return true; // 左下
  return false;
}

/**
 * 绘制单个 QR 定位点（3x3 方框：外框填充 + 中心镂空）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - 左上角 x
 * @param {number} y - 左上角 y
 * @param {number} cell - 单格尺寸
 * @param {Object} colors
 */
function drawQRFinder(ctx, x, y, cell, colors) {
  // 3x3 实心
  ctx.fillStyle = colors.text;
  ctx.fillRect(x, y, cell * 3, cell * 3);
  // 中心 1x1 镂空，形成"方框"
  ctx.fillStyle = colors.bg;
  ctx.fillRect(x + cell, y + cell, cell, cell);
}

/**
 * 绘制装饰性 QR 码图案（非真实可扫码）
 * 11x11 黑白方块 + 三个定位点（左上 / 右上 / 左下）
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - 左上角 x
 * @param {number} y - 左上角 y
 * @param {number} size - QR 码边长
 * @param {Object} colors
 * @param {() => number} rng - 种子随机函数
 */
function drawQRCode(ctx, x, y, size, colors, rng) {
  ctx.save();

  const cells = 11;
  const cell = size / cells;

  // 背景底
  ctx.fillStyle = colors.bg;
  ctx.fillRect(x, y, size, size);

  // 随机数据格（跳过定位点区域）
  ctx.fillStyle = colors.text;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      if (inFinderRegion(i, j, cells)) continue;
      if (rng() > 0.5) {
        // +0.5 消除格子间的亚像素缝隙
        ctx.fillRect(x + i * cell, y + j * cell, cell + 0.5, cell + 0.5);
      }
    }
  }

  // 三个定位点
  drawQRFinder(ctx, x, y, cell, colors);
  drawQRFinder(ctx, x + (cells - 3) * cell, y, cell, colors);
  drawQRFinder(ctx, x, y + (cells - 3) * cell, cell, colors);

  // 外边框
  ctx.strokeStyle = hexToRgba(colors.text, 0.4);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

  ctx.restore();
}

// ========== 内部绘制：信息区 ==========

/**
 * 绘制信息区，新版布局顺序：
 *  1. 路线行（出发地 → 目的地）
 *  2. 目的地大标题
 *  3. 日期 + 场景类型
 *  4. 心情文案
 *  5. 分隔线
 *  6. 票号 + 风格名 + 情绪标签（三列等宽）
 *  7. 条形码 + QR 码
 *  8. 底部打孔存根
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} o
 */
function drawInfoArea(ctx, o) {
  ctx.save(); // 保存状态，防止污染外部上下文

  const {
    width,
    height,
    photoHeight,
    colors,
    fmt,
    destination,
    date,
    moodText,
    ticketNumber,
    styleId,
    emotion,
    origin,
    rng,
  } = o;

  const pad = fmt.padding;
  const contentWidth = width - pad * 2;
  let y = photoHeight + Math.round(pad * 0.55);

  // —— 1. 路线行 ——
  drawRoute(ctx, pad, y, contentWidth, origin || 'HOME', destination, colors, fmt);
  y += Math.round(fmt.info * 1.4);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // —— 2. 目的地大标题（衬线粗体） ——
  ctx.fillStyle = colors.text;
  ctx.font = `bold ${fmt.dest}px "Songti SC", "STSong", serif`;
  const destLines = wrapText(ctx, destination, contentWidth, fmt.destLines);
  for (const line of destLines) {
    ctx.fillText(line, width / 2, y);
    y += Math.round(fmt.dest * 1.18);
  }
  y += Math.round(fmt.dest * 0.22);

  // —— 3. 日期 + 场景（无衬线、弱化色）——
  ctx.fillStyle = hexToRgba(colors.text, 0.6);
  ctx.font = `${fmt.date}px "PingFang SC", sans-serif`;
  // 避免场景类型与目的地重复显示
  const sceneToShow = emotion && emotion.sceneType && emotion.sceneType !== destination ? emotion.sceneType : '';
  const dateLine = [date, sceneToShow].filter(Boolean).join('  ·  ');
  if (dateLine) {
    ctx.fillText(dateLine, width / 2, y);
    y += fmt.date + Math.round(fmt.date * 0.7);
  }

  // —— 4. 心情文案（斜体、强调色） ——
  if (moodText) {
    ctx.fillStyle = colors.accent;
    ctx.font = `italic ${fmt.mood}px "Songti SC", serif`;
    const moodLines = wrapText(ctx, moodText, contentWidth, fmt.moodLines);
    for (const line of moodLines) {
      ctx.fillText(line, width / 2, y);
      y += Math.round(fmt.mood * 1.3);
    }
    y += Math.round(fmt.mood * 0.22);
  }

  // —— 5. 细分隔线 ——
  ctx.strokeStyle = hexToRgba(colors.text, 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(width - pad, y);
  ctx.stroke();
  y += Math.round(fmt.info * 0.9);

  // —— 6. 底部信息行：票号 / 风格 / 情绪（三列等宽） ——
  const styleName = getStyleName(styleId);
  const emotionTag = pickEmotionTag(emotion);
  ctx.fillStyle = hexToRgba(colors.text, 0.72);
  ctx.font = `${fmt.info}px "SF Mono", "Menlo", monospace`;
  ctx.textBaseline = 'top';
  const rowY = y;

  ctx.textAlign = 'left';
  ctx.fillText(ticketNumber, pad, rowY);

  ctx.textAlign = 'center';
  ctx.fillText(styleName, width / 2, rowY);

  ctx.textAlign = 'right';
  ctx.fillText(emotionTag, width - pad, rowY);

  y += fmt.info + Math.round(fmt.info * 0.8);

  // —— 7. 条形码 + QR 码 ——
  const barHeight = Math.max(20, Math.round(fmt.dest * 0.55));
  const barcodeW = Math.min(contentWidth * 0.6, 420);
  const barcodeCx = width / 2;
  // 条形码块高度（竖条 + 数字行）
  const digitFont = Math.max(12, Math.round(fmt.info * 0.85));
  const barBlockH = barHeight + digitFont + 8;
  // QR 码尺寸随版式缩放
  const qrSize = Math.round(fmt.info * 3);
  const blockH = Math.max(barBlockH, qrSize);

  // 条形码居中放置
  drawBarcode(ctx, barcodeCx, y, barcodeW, barHeight, colors, rng, fmt);
  // QR 码置于右下角，与条形码同行
  const qrX = width - pad - qrSize;
  const qrY = y;
  drawQRCode(ctx, qrX, qrY, qrSize, colors, rng);

  y += blockH + Math.round(fmt.info * 0.4);

  // —— 8. 底部打孔存根 ——
  drawBottomNotches(ctx, width, height, colors, fmt.notch);

  ctx.restore(); // 恢复 save() 时的状态
}

// ========== 内部绘制：底部打孔 ==========

/**
 * 沿底部边缘绘制半圆缺口，模拟票根存根打孔
 * 先铺一条弱化色存根带，再用 bg 色圆点"打穿"，形成穿孔效果
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {Object} colors
 * @param {number} radius - 缺口半径
 */
function drawBottomNotches(ctx, width, height, colors, radius) {
  const bandHeight = radius * 3;

  // 底部存根带（非 bg 色，使缺口可见）
  ctx.fillStyle = hexToRgba(colors.text, 0.1);
  ctx.fillRect(0, height - bandHeight, width, bandHeight);

  // 半圆缺口（bg 色，模拟打孔）
  ctx.fillStyle = colors.bg;
  const spacing = radius * 2.4;
  const count = Math.max(3, Math.floor((width - spacing) / spacing));
  const startX = (width - (count - 1) * spacing) / 2;
  const cy = height - Math.round(radius * 0.4);

  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.arc(startX + i * spacing, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ========== 内部绘制：纸张质感纹理 ==========

/** 纹理 Canvas 缓存，避免每次重新生成噪点 */
let _textureCache = null;
let _textureCacheW = 0;
let _textureCacheH = 0;

/**
 * 生成并缓存基础噪点纹理（相纸/胶片颗粒感）
 * @param {number} tw
 * @param {number} th
 * @returns {HTMLCanvasElement}
 */
function getNoiseTexture(tw, th) {
  if (_textureCache && _textureCacheW === tw && _textureCacheH === th) {
    return _textureCache;
  }
  const texCanvas = document.createElement('canvas');
  texCanvas.width = tw;
  texCanvas.height = th;
  const texCtx = texCanvas.getContext('2d');
  const imgData = texCtx.createImageData(tw, th);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = Math.random();
    if (r < 0.03) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = Math.floor(Math.random() * 18 + 6);
    } else if (r < 0.05) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.floor(Math.random() * 12 + 4);
    } else {
      data[i + 3] = 0;
    }
  }
  texCtx.putImageData(imgData, 0, 0);
  _textureCache = texCanvas;
  _textureCacheW = tw;
  _textureCacheH = th;
  return _textureCache;
}

/**
 * 绘制极淡的斜向纸张纤维条纹（信息区内）
 * 模拟纸张纤维方向，增强纸张质感
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} photoHeight
 * @param {boolean} dark - 是否深色主题
 */
function drawPaperFiber(ctx, width, height, photoHeight, dark) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, photoHeight, width, height - photoHeight);
  ctx.clip();

  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.022)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 6]);
  const infoH = height - photoHeight;
  const spacing = 7;
  // 斜向 45° 条纹
  for (let x = -infoH; x < width + infoH; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, photoHeight);
    ctx.lineTo(x + infoH, height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * 绘制极淡的咖啡渍/水渍效果（信息区随机位置）
 * 极低透明度暖色圆形，模拟纸张上的污渍
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} photoHeight
 * @param {boolean} dark
 * @param {() => number} rng
 */
function drawCoffeeStain(ctx, width, height, photoHeight, dark, rng) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, photoHeight, width, height - photoHeight);
  ctx.clip();

  const count = 2;
  for (let i = 0; i < count; i++) {
    const cx = rng() * width;
    const cy = photoHeight + rng() * (height - photoHeight);
    const r = rng() * 30 + 20;
    // 暖棕色污渍，深色主题用更亮的暖色
    ctx.fillStyle = dark ? 'rgba(160,120,70,0.05)' : 'rgba(120,80,40,0.05)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // 内圈更深的芯
    ctx.fillStyle = dark ? 'rgba(180,140,80,0.04)' : 'rgba(100,60,30,0.04)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 绘制四边边缘磨损效果（destination-out 随机擦除少量像素）
 * 模拟票据边缘的磨损/毛边
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {() => number} rng
 */
function drawEdgeWear(ctx, width, height, rng) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  const count = 90;
  const edgeWidth = 4; // 仅在边缘 4px 范围内磨损
  for (let i = 0; i < count; i++) {
    const edge = Math.floor(rng() * 4);
    const r = rng() * 1.8 + 0.4;
    let x, y;
    if (edge === 0) {
      // 上边
      x = rng() * width;
      y = rng() * edgeWidth;
    } else if (edge === 1) {
      // 下边
      x = rng() * width;
      y = height - rng() * edgeWidth;
    } else if (edge === 2) {
      // 左边
      x = rng() * edgeWidth;
      y = rng() * height;
    } else {
      // 右边
      x = width - rng() * edgeWidth;
      y = rng() * height;
    }
    ctx.globalAlpha = rng() * 0.5 + 0.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 在信息区叠加纸张质感：
 *  1. 基础噪点（缓存）
 *  2. 斜向纤维条纹
 *  3. 咖啡渍/水渍
 *  4. 暗角
 *  5. 四边边缘磨损（destination-out，最后执行）
 * 照片区仅边缘叠加少量颗粒，保持主体清晰度
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {Object} colors
 * @param {number} photoHeight - 照片区高度
 * @param {() => number} rng - 种子随机函数（咖啡渍/磨损一致）
 */
function drawPaperTexture(ctx, width, height, colors, photoHeight, rng) {
  const texScale = 0.25;
  const tw = Math.round(width * texScale);
  const th = Math.round(height * texScale);
  const noiseTex = getNoiseTexture(tw, th);

  const dark = isDarkColor(colors.bg);

  // —— 1. 信息区噪点 ——
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, photoHeight, width, height - photoHeight);
  ctx.clip();

  if (dark) {
    // 暗色主题：白色噪点为主（screen 模式），增强纸张纤维感
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.25;
    ctx.drawImage(noiseTex, 0, 0, width, height);
  } else {
    // 浅色主题：深色噪点为主（multiply 模式），增强印刷网点感
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.4;
    ctx.drawImage(noiseTex, 0, 0, width, height);
    ctx.globalAlpha = 0.15;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(noiseTex, 0, 0, width, height);
  }
  ctx.restore();

  // —— 2. 斜向纸张纤维 ——
  drawPaperFiber(ctx, width, height, photoHeight, dark);

  // —— 3. 咖啡渍/水渍 ——
  drawCoffeeStain(ctx, width, height, photoHeight, dark, rng);

  // —— 4. 照片区底部边缘渐变纹理，过渡自然 ——
  ctx.save();
  const edgeHeight = 30;
  const edgeGrad = ctx.createLinearGradient(0, photoHeight - edgeHeight, 0, photoHeight + 10);
  edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
  edgeGrad.addColorStop(1, dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(0, photoHeight - edgeHeight, width, edgeHeight + 10);
  ctx.restore();

  // —— 5. 信息区暗角 ——
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, photoHeight, width, height - photoHeight);
  ctx.clip();
  const cx = width / 2;
  const cy = photoHeight + (height - photoHeight) / 2;
  const vignette = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(width, height - photoHeight) * 0.3,
    cx,
    cy,
    Math.max(width, height - photoHeight) * 0.7
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, dark ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.05)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, photoHeight, width, height - photoHeight);
  ctx.restore();

  // —— 6. 四边边缘磨损（最后执行，destination-out 擦除）——
  drawEdgeWear(ctx, width, height, rng);
}
