/**
 * 造境 ZaoJing — 旅行票根渲染引擎 v1.0
 * 基于 Canvas 2D API 渲染电影感旅行票根
 *
 * 支持：
 *  - 旅行照片封面（cover 适配 + 顶部圆角裁剪）
 *  - 12 位导演风格配色 + 默认风格
 *  - 3 种版式（vertical / square / horizontal）
 *  - 情绪标签与票根编号
 *  - 虚线撕裂线 + 两侧半圆缺口 + 底部打孔存根
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
    width: 1080, height: 1440, photoRatio: 0.55,
    dest: 56, date: 24, mood: 36, info: 20,
    destLines: 2, moodLines: 3, padding: 72, corner: 16, notch: 12,
  },
  // 方形 1:1
  square: {
    width: 1080, height: 1080, photoRatio: 0.55,
    dest: 60, date: 24, mood: 34, info: 20,
    destLines: 2, moodLines: 2, padding: 64, corner: 16, notch: 12,
  },
  // 横版 9:4
  horizontal: {
    width: 1080, height: 480, photoRatio: 0.45,
    dest: 48, date: 20, mood: 26, info: 16,
    destLines: 1, moodLines: 1, padding: 44, corner: 12, notch: 10,
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
  miyazaki:  { primary: '#5b9bd5', secondary: '#8fbc8f', text: '#2a3a2a', bg: '#f5f0e6', accent: '#7ec8a0' },
  wkw:       { primary: '#c8a02e', secondary: '#2d5a3d', text: '#f0e8d0', bg: '#1a1a14', accent: '#e8b848' },
  koreeda:   { primary: '#a0b89c', secondary: '#d4c5a0', text: '#3a3a2a', bg: '#faf6ee', accent: '#c4a878' },
  wes:       { primary: '#e89a7e', secondary: '#7ab0c4', text: '#4a3a3a', bg: '#f5ebe0', accent: '#d4857a' },
  nolan:     { primary: '#6a8caf', secondary: '#3a4a5a', text: '#d0d8e0', bg: '#1a1e24', accent: '#8aa4c4' },
  chow:      { primary: '#e8c828', secondary: '#d44848', text: '#3a2a1a', bg: '#fdf5e6', accent: '#f0a030' },
  jia:       { primary: '#8a7a5a', secondary: '#5a5a4a', text: '#c4b8a0', bg: '#2a2620', accent: '#a89878' },
  lee:       { primary: '#7a9a8a', secondary: '#b0a890', text: '#3a3a30', bg: '#f0ece4', accent: '#9ab4a4' },
  kurosawa:  { primary: '#8a8a8a', secondary: '#5a5a5a', text: '#e0e0e0', bg: '#1a1a1a', accent: '#aaaaaa' },
  coppola:   { primary: '#c4a4a0', secondary: '#8a9ab0', text: '#4a3a3a', bg: '#f0ebe6', accent: '#d4b8b4' },
  chazelle:  { primary: '#7a4ac4', secondary: '#e84858', text: '#f0e8e0', bg: '#1a1420', accent: '#b878e8' },
  tarantino: { primary: '#e84848', secondary: '#e8c828', text: '#f0e8d0', bg: '#2a1410', accent: '#f06848' },
  default:   { primary: '#c87f2e', secondary: '#3d7a8c', text: '#2a2218', bg: '#faf6ef', accent: '#c87f2e' },
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

  // 1. 信息区背景（整张铺底，照片区随后覆盖）
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, width, height);

  // 2. 照片区（顶部，圆角裁剪 + cover 适配）
  const photoHeight = Math.round(height * fmt.photoRatio);
  await drawPhoto(ctx, photoUrl, width, photoHeight, colors, fmt.corner);

  // 3. 虚线撕裂线 + 两侧半圆缺口
  drawPerforation(ctx, width, photoHeight, colors);

  // 4. 信息区文字 + 底部信息行 + 底部打孔
  drawInfoArea(ctx, {
    width, height, photoHeight, colors, fmt,
    destination, date, moodText, ticketNumber, styleId, emotion,
  });

  // 5. 纸张质感叠加（细微噪点颗粒，增加实体感）
  drawPaperTexture(ctx, width, height, colors);
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

// ========== 内部绘制：照片区 ==========

/**
 * 绘制照片区：顶部圆角裁剪 + cover 适配 + 底部渐变过渡
 * 图片缺失或加载失败时降级为渐变占位
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} photoUrl
 * @param {number} width
 * @param {number} photoHeight
 * @param {Object} colors
 * @param {number} corner - 圆角半径
 */
async function drawPhoto(ctx, photoUrl, width, photoHeight, colors, corner) {
  ctx.save();
  // 仅顶部圆角裁剪
  roundTopRect(ctx, 0, 0, width, photoHeight, corner);
  ctx.clip();

  // 兜底底色
  ctx.fillStyle = colors.secondary;
  ctx.fillRect(0, 0, width, photoHeight);

  let drewPhoto = false;
  if (photoUrl) {
    try {
      const img = await loadImage(photoUrl);
      drawImageCover(ctx, img, 0, 0, width, photoHeight);
      drewPhoto = true;
    } catch (e) {
      logger.warn('票根照片加载失败，使用占位背景:', e instanceof Error ? e.message : String(e));
    }
  }

  if (!drewPhoto) {
    drawPhotoPlaceholder(ctx, width, photoHeight, colors);
  }

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
 */
function drawPerforation(ctx, width, y, colors) {
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
  const r = 10;
  ctx.beginPath();
  ctx.arc(0, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ========== 内部绘制：信息区 ==========

/**
 * 绘制信息区：目的地 / 日期 / 心情文案 / 细分隔线 / 底部信息行
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} o
 */
function drawInfoArea(ctx, o) {
  const {
    width, height, photoHeight, colors, fmt,
    destination, date, moodText, ticketNumber, styleId, emotion,
  } = o;

  const pad = fmt.padding;
  const contentWidth = width - pad * 2;
  let y = photoHeight + Math.round(pad * 0.6);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // —— 目的地（衬线粗体） ——
  ctx.fillStyle = colors.text;
  ctx.font = `bold ${fmt.dest}px "Songti SC", "STSong", serif`;
  const destLines = wrapText(ctx, destination, contentWidth, fmt.destLines);
  for (const line of destLines) {
    ctx.fillText(line, width / 2, y);
    y += Math.round(fmt.dest * 1.18);
  }
  y += Math.round(fmt.dest * 0.25);

  // —— 日期 + 场景（无衬线、弱化色） ——
  ctx.fillStyle = hexToRgba(colors.text, 0.6);
  ctx.font = `${fmt.date}px "PingFang SC", sans-serif`;
  const dateLine = [date, emotion && emotion.sceneType].filter(Boolean).join('  ·  ');
  if (dateLine) {
    ctx.fillText(dateLine, width / 2, y);
    y += fmt.date + Math.round(fmt.date * 0.7);
  }

  // —— 心情文案（斜体、强调色） ——
  if (moodText) {
    ctx.fillStyle = colors.accent;
    ctx.font = `italic ${fmt.mood}px "Songti SC", serif`;
    const moodLines = wrapText(ctx, moodText, contentWidth, fmt.moodLines);
    for (const line of moodLines) {
      ctx.fillText(line, width / 2, y);
      y += Math.round(fmt.mood * 1.3);
    }
    y += Math.round(fmt.mood * 0.25);
  }

  // —— 细分隔线 ——
  ctx.strokeStyle = hexToRgba(colors.text, 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(width - pad, y);
  ctx.stroke();
  y += Math.round(fmt.info * 0.9);

  // —— 底部信息行：票号 / 风格 / 情绪（等宽） ——
  const styleName = getStyleName(styleId);
  const emotionTag = pickEmotionTag(emotion);
  ctx.fillStyle = hexToRgba(colors.text, 0.7);
  ctx.font = `${fmt.info}px "SF Mono", "Menlo", monospace`;
  const rowY = y + Math.round(fmt.info * 0.5);

  ctx.textAlign = 'left';
  ctx.fillText(ticketNumber, pad, rowY);

  ctx.textAlign = 'center';
  ctx.fillText(styleName, width / 2, rowY);

  ctx.textAlign = 'right';
  ctx.fillText(emotionTag, width - pad, rowY);

  // —— 底部打孔存根 ——
  drawBottomNotches(ctx, width, height, colors, fmt.notch);
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
 * 在整张票根上叠加极细微的纸张噪点纹理
 * 使用 ImageData 逐像素添加随机透明度，模拟相纸/胶片颗粒感
 * 使用缓存避免重复计算
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {Object} colors
 */
function drawPaperTexture(ctx, width, height, colors) {
  // 仅在信息区叠加纹理（照片区不叠加，保持照片清晰度）
  // 但为了性能，用小尺寸canvas缩放绘制
  const texScale = 0.25; // 用1/4尺寸生成纹理再放大，性能更好
  const tw = Math.round(width * texScale);
  const th = Math.round(height * texScale);

  if (!_textureCache || _textureCacheW !== tw || _textureCacheH !== th) {
    const texCanvas = document.createElement('canvas');
    texCanvas.width = tw;
    texCanvas.height = th;
    const texCtx = texCanvas.getContext('2d');
    const imgData = texCtx.createImageData(tw, th);
    const data = imgData.data;

    // 生成噪点：大部分像素透明，少数像素为深色/浅色微颗粒
    for (let i = 0; i < data.length; i += 4) {
      const r = Math.random();
      if (r < 0.03) {
        // 深色颗粒（印刷网点感）
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = Math.floor(Math.random() * 18 + 6); // alpha 6-24
      } else if (r < 0.05) {
        // 浅色颗粒（纸张纤维感）
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = Math.floor(Math.random() * 12 + 4);
      } else {
        data[i + 3] = 0; // 完全透明
      }
    }
    texCtx.putImageData(imgData, 0, 0);
    _textureCache = texCanvas;
    _textureCacheW = tw;
    _textureCacheH = th;
  }

  // 使用 multiply 混合模式叠加，让噪点融入底色而非浮在上面
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(_textureCache, 0, 0, width, height);
  ctx.globalAlpha = 0.3;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(_textureCache, 0, 0, width, height);
  ctx.restore();

  // 添加极淡的边缘阴影/暗角效果，增加立体感
  ctx.save();
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.3,
    width / 2, height / 2, Math.max(width, height) * 0.7
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
