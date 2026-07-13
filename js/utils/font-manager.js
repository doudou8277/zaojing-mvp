/**
 * 造境 ZaoJing — 字体管理与排版工具模块
 * 提供预设字体库、自定义字体上传（FontFace API）、排版配置持久化
 */

import { logger } from './logger.js';

// ========== 预设字体库 ==========
export const PRESET_FONTS = [
  {
    id: 'noto-serif-sc',
    name: '思源宋体',
    fontFamily: '"Noto Serif SC", serif',
    category: 'serif',
    preview: '墨',
    description: '经典电影海报字体，端庄优雅',
  },
  {
    id: 'noto-sans-sc',
    name: '思源黑体',
    fontFamily: '"Noto Sans SC", sans-serif',
    category: 'sans-serif',
    preview: '影',
    description: '现代简约，适合科技/都市题材',
  },
  {
    id: 'ma-shan-zheng',
    name: '马善政手写',
    fontFamily: '"Ma Shan Zheng", cursive',
    category: 'handwriting',
    preview: '情',
    description: '手写风格，适合文艺/情感题材',
  },
  {
    id: 'zcool-xiaowei',
    name: '站酷小薇',
    fontFamily: '"ZCOOL XiaoWei", serif',
    category: 'serif',
    preview: '光',
    description: '细长优雅，适合文艺片海报',
  },
  {
    id: 'zcool-kuaiLe',
    name: '站酷快乐体',
    fontFamily: '"ZCOOL KuaiLe", cursive',
    category: 'display',
    preview: '乐',
    description: '圆润活泼，适合喜剧/动画',
  },
  {
    id: 'long-cang',
    name: '龙藏体',
    fontFamily: '"Long Cang", cursive',
    category: 'handwriting',
    preview: '心',
    description: '行草书法，适合古典/武侠',
  },
  {
    id: 'liu-jian-mao',
    name: '柳建毛笔',
    fontFamily: '"Liu Jian Mao Cao", cursive',
    category: 'brush',
    preview: '意',
    description: '毛笔书法，适合国风/历史',
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    fontFamily: '"JetBrains Mono", monospace',
    category: 'mono',
    preview: 'Aa',
    description: '等宽字体，适合科技/赛博朋克',
  },
];

// ========== 字重选项 ==========
export const FONT_WEIGHTS = [
  { value: 300, label: '细体 (300)' },
  { value: 400, label: '常规 (400)' },
  { value: 500, label: '中等 (500)' },
  { value: 600, label: '半粗 (600)' },
  { value: 700, label: '粗体 (700)' },
  { value: 800, label: '特粗 (800)' },
  { value: 900, label: '超粗 (900)' },
];

// ========== 字间距选项 ==========
export const LETTER_SPACING_OPTIONS = [
  { value: -2, label: '紧凑' },
  { value: 0, label: '标准' },
  { value: 2, label: '宽松' },
  { value: 4, label: '疏朗' },
  { value: 8, label: '极疏' },
];

// ========== 默认排版配置 ==========
export const DEFAULT_TYPOGRAPHY_CONFIG = {
  enabled: false,
  fontId: 'noto-serif-sc',
  fontFamily: '"Noto Serif SC", serif',
  customFontFamily: null, // 用户上传的自定义字体 CSS font-family
  customFontName: null,
  titleWeight: 700,
  letterSpacing: 0,
  titleSizeScale: 1.0, // 标题字号缩放
  quoteSizeScale: 1.0, // 金句字号缩放
};

const STORAGE_KEY = 'zaojing_typography_config';

// ========== 用户自定义字体管理 ==========
// 存储用户上传的字体（family name → dataUrl），持久化到 localStorage
// 注意：大字体文件可能超出 localStorage 限制，仅保存元信息
const CUSTOM_FONTS_KEY = 'zaojing_custom_fonts';
const _loadedCustomFonts = new Map(); // family name → FontFace（运行时）

/**
 * 加载排版配置
 * @returns {Object}
 */
export function loadTypographyConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const config = JSON.parse(raw);
      return { ...DEFAULT_TYPOGRAPHY_CONFIG, ...config };
    }
  } catch (e) {
    logger.warn('[font-manager] 读取排版配置失败:', e.message);
  }
  return { ...DEFAULT_TYPOGRAPHY_CONFIG };
}

/**
 * 保存排版配置
 * @param {Object} config
 */
export function saveTypographyConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    logger.warn('[font-manager] 保存排版配置失败:', e.message);
  }
}

/**
 * 重置排版配置为默认值
 */
export function resetTypographyConfig() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // localStorage 可能被禁用或不可用，忽略即可
    logger.debug('[font-manager] 清除排版配置失败:', e.message);
  }
  return { ...DEFAULT_TYPOGRAPHY_CONFIG };
}

// ========== 预设字体加载 ==========

/**
 * 动态加载 Google Fonts 预设字体
 * 通过注入 <link> 标签实现按需加载，避免首屏加载所有字体
 * @param {string} fontId
 */
export function loadPresetFont(fontId) {
  const font = PRESET_FONTS.find((f) => f.id === fontId);
  if (!font) return;

  // 已加载则跳过
  const existingLink = document.querySelector(`link[data-font-id="${fontId}"]`);
  if (existingLink) return;

  // Google Fonts 字体名映射
  const googleFontMap = {
    'noto-serif-sc': 'Noto+Serif+SC:wght@400;700;900',
    'noto-sans-sc': 'Noto+Sans+SC:wght@400;700;900',
    'ma-shan-zheng': 'Ma+Shan+Zheng',
    'zcool-xiaowei': 'ZCOOL+XiaoWei',
    'zcool-kuaiLe': 'ZCOOL+KuaiLe',
    'long-cang': 'Long+Cang',
    'liu-jian-mao': 'Liu+Jian+Mao+Cao',
    'jetbrains-mono': 'JetBrains+Mono:wght@400;700',
  };

  const fontParam = googleFontMap[fontId];
  if (!fontParam) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontParam}&display=swap`;
  link.dataset.fontId = fontId;
  document.head.appendChild(link);
}

// ========== 自定义字体上传 ==========

/**
 * 从 File 对象加载自定义字体
 * 使用 FontFace API 将字体文件注册到文档
 * @param {File} file - 字体文件（.ttf, .otf, .woff, .woff2）
 * @returns {Promise<{family: string, name: string}>}
 */
export async function loadFontFromFile(file) {
  // 校验文件类型
  const validTypes = [
    'font/ttf',
    'font/otf',
    'font/woff',
    'font/woff2',
    'application/font-ttf',
    'application/font-otf',
    'application/font-woff',
    'application/font-woff2',
  ];
  const ext = file.name.split('.').pop().toLowerCase();
  const validExts = ['ttf', 'otf', 'woff', 'woff2'];

  if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
    throw new Error('不支持的字体格式，请上传 TTF/OTF/WOFF/WOFF2 文件');
  }

  // 大小限制：10MB
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('字体文件过大，请上传 10MB 以下的文件');
  }

  const buffer = await file.arrayBuffer();

  // 生成字体 family 名称（去掉扩展名，只保留安全字符：字母、数字、下划线、连字符、中文）
  const safeBaseName = file.name
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '');
  const familyName = 'ZJCustom_' + (safeBaseName || 'font_' + Date.now());

  // 创建 FontFace 并注册
  if (typeof FontFace === 'undefined') {
    throw new Error('当前浏览器不支持 FontFace API');
  }

  const fontFace = new FontFace(familyName, buffer);
  await fontFace.load();
  document.fonts.add(fontFace);
  _loadedCustomFonts.set(familyName, fontFace);

  logger.info('[font-manager] 自定义字体已加载:', familyName);

  return {
    family: familyName,
    name: file.name,
  };
}

/**
 * 获取已加载的自定义字体列表
 * @returns {Array}
 */
export function getLoadedCustomFonts() {
  return Array.from(_loadedCustomFonts.keys()).map((family) => ({
    family,
    name: family.replace(/^ZJCustom_/, ''),
  }));
}

/**
 * 移除已加载的自定义字体
 * @param {string} family
 */
export function removeCustomFont(family) {
  const fontFace = _loadedCustomFonts.get(family);
  if (fontFace) {
    document.fonts.delete(fontFace);
    _loadedCustomFonts.delete(family);
  }
}

// ========== 字体可用性检测 ==========

/**
 * 检测字体是否已加载可用
 * @param {string} fontFamily
 * @returns {Promise<boolean>}
 */
export async function isFontAvailable(fontFamily) {
  if (!fontFamily) return false;
  if (!document.fonts || !document.fonts.check) {
    // 降级：假设可用
    return true;
  }
  // 提取第一个字体名（去掉引号和 fallback）
  const primaryFont = fontFamily.split(',')[0].replace(/["']/g, '').trim();
  return document.fonts.check(`12px "${primaryFont}"`);
}

/**
 * 等待字体加载完成
 * @param {string} fontFamily
 * @returns {Promise<void>}
 */
export async function ensureFontLoaded(fontFamily) {
  if (!fontFamily || !document.fonts) return;
  try {
    const primaryFont = fontFamily.split(',')[0].replace(/["']/g, '').trim();
    await document.fonts.load(`700 48px "${primaryFont}"`);
  } catch (e) {
    logger.warn('[font-manager] 字体加载失败:', fontFamily, e.message);
  }
}

// ========== 配置辅助函数 ==========

/**
 * 根据 fontId 获取预设字体信息
 * @param {string} fontId
 * @returns {Object|null}
 */
export function getPresetFont(fontId) {
  return PRESET_FONTS.find((f) => f.id === fontId) || null;
}

/**
 * 获取有效的 fontFamily 值（优先自定义字体）
 * @param {Object} config
 * @returns {string}
 */
export function getEffectiveFontFamily(config) {
  if (!config) return '"Noto Serif SC", serif';
  if (config.customFontFamily) return `"${config.customFontFamily}"`;
  if (config.fontFamily) return config.fontFamily;
  return '"Noto Serif SC", serif';
}

/**
 * 获取字体分类标签
 * @param {string} category
 * @returns {string}
 */
export function getCategoryLabel(category) {
  const labels = {
    serif: '衬线',
    'sans-serif': '无衬线',
    handwriting: '手写',
    brush: '毛笔',
    display: '展示',
    mono: '等宽',
  };
  return labels[category] || '其他';
}
