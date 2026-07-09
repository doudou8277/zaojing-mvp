/**
 * 字体管理与排版工具模块单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PRESET_FONTS,
  FONT_WEIGHTS,
  LETTER_SPACING_OPTIONS,
  DEFAULT_TYPOGRAPHY_CONFIG,
  loadTypographyConfig,
  saveTypographyConfig,
  resetTypographyConfig,
  getPresetFont,
  getEffectiveFontFamily,
  getCategoryLabel,
} from '../utils/font-manager.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock localStorage
const mockStore = {};
const localStorageMock = {
  getItem: vi.fn((key) => mockStore[key] || null),
  setItem: vi.fn((key, value) => {
    mockStore[key] = value;
  }),
  removeItem: vi.fn((key) => {
    delete mockStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('PRESET_FONTS', () => {
  it('应包含多个预设字体', () => {
    expect(PRESET_FONTS.length).toBeGreaterThanOrEqual(6);
  });

  it('每个字体应有完整元数据', () => {
    for (const font of PRESET_FONTS) {
      expect(font.id).toBeTruthy();
      expect(font.name).toBeTruthy();
      expect(font.fontFamily).toBeTruthy();
      expect(font.category).toBeTruthy();
      expect(font.preview).toBeTruthy();
      expect(font.description).toBeTruthy();
    }
  });

  it('应包含思源宋体和思源黑体', () => {
    const ids = PRESET_FONTS.map((f) => f.id);
    expect(ids).toContain('noto-serif-sc');
    expect(ids).toContain('noto-sans-sc');
  });

  it('字体 ID 应唯一', () => {
    const ids = PRESET_FONTS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fontFamily 应为合法 CSS 值', () => {
    for (const font of PRESET_FONTS) {
      expect(font.fontFamily).toMatch(/["']/); // 应包含引号
    }
  });
});

describe('FONT_WEIGHTS', () => {
  it('应包含多个字重选项', () => {
    expect(FONT_WEIGHTS.length).toBeGreaterThanOrEqual(5);
  });

  it('字重值应在 100-900 范围内', () => {
    for (const w of FONT_WEIGHTS) {
      expect(w.value).toBeGreaterThanOrEqual(100);
      expect(w.value).toBeLessThanOrEqual(900);
    }
  });
});

describe('LETTER_SPACING_OPTIONS', () => {
  it('应包含多个字间距选项', () => {
    expect(LETTER_SPACING_OPTIONS.length).toBeGreaterThanOrEqual(3);
  });

  it('应包含标准间距（0）', () => {
    const values = LETTER_SPACING_OPTIONS.map((o) => o.value);
    expect(values).toContain(0);
  });
});

describe('DEFAULT_TYPOGRAPHY_CONFIG', () => {
  it('应有合理的默认值', () => {
    expect(DEFAULT_TYPOGRAPHY_CONFIG.enabled).toBe(false);
    expect(DEFAULT_TYPOGRAPHY_CONFIG.fontId).toBe('noto-serif-sc');
    expect(DEFAULT_TYPOGRAPHY_CONFIG.fontFamily).toContain('Noto Serif SC');
    expect(DEFAULT_TYPOGRAPHY_CONFIG.customFontFamily).toBeNull();
    expect(DEFAULT_TYPOGRAPHY_CONFIG.titleWeight).toBe(700);
    expect(DEFAULT_TYPOGRAPHY_CONFIG.letterSpacing).toBe(0);
    expect(DEFAULT_TYPOGRAPHY_CONFIG.titleSizeScale).toBe(1.0);
    expect(DEFAULT_TYPOGRAPHY_CONFIG.quoteSizeScale).toBe(1.0);
  });
});

describe('loadTypographyConfig / saveTypographyConfig', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
    vi.clearAllMocks();
  });

  it('无存储时应返回默认配置', () => {
    const config = loadTypographyConfig();
    expect(config.enabled).toBe(false);
    expect(config.fontId).toBe('noto-serif-sc');
    expect(config.titleWeight).toBe(700);
  });

  it('保存后应能读取', () => {
    const custom = {
      ...DEFAULT_TYPOGRAPHY_CONFIG,
      enabled: true,
      fontId: 'ma-shan-zheng',
      titleWeight: 900,
    };
    saveTypographyConfig(custom);
    const loaded = loadTypographyConfig();
    expect(loaded.enabled).toBe(true);
    expect(loaded.fontId).toBe('ma-shan-zheng');
    expect(loaded.titleWeight).toBe(900);
  });

  it('读取时应合并默认值（新字段兼容）', () => {
    // 模拟旧版本存储（缺少新字段）
    mockStore['zaojing_typography_config'] = JSON.stringify({
      enabled: true,
      fontId: 'noto-sans-sc',
    });
    const config = loadTypographyConfig();
    expect(config.enabled).toBe(true);
    expect(config.fontId).toBe('noto-sans-sc');
    // 新字段应使用默认值
    expect(config.titleWeight).toBe(700);
    expect(config.titleSizeScale).toBe(1.0);
  });

  it('JSON 解析失败时应返回默认配置', () => {
    mockStore['zaojing_typography_config'] = '{invalid json';
    const config = loadTypographyConfig();
    expect(config.enabled).toBe(false);
    expect(config.fontId).toBe('noto-serif-sc');
  });
});

describe('resetTypographyConfig', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应清除存储并返回默认配置', () => {
    saveTypographyConfig({ ...DEFAULT_TYPOGRAPHY_CONFIG, enabled: true, titleWeight: 900 });
    const config = resetTypographyConfig();
    expect(config.enabled).toBe(false);
    expect(config.titleWeight).toBe(700);
    // 存储应被清除
    expect(mockStore['zaojing_typography_config']).toBeUndefined();
  });
});

describe('getPresetFont', () => {
  it('应返回指定 ID 的字体', () => {
    const font = getPresetFont('noto-serif-sc');
    expect(font).not.toBeNull();
    expect(font.id).toBe('noto-serif-sc');
    expect(font.name).toBe('思源宋体');
  });

  it('不存在时应返回 null', () => {
    expect(getPresetFont('nonexistent')).toBeNull();
  });
});

describe('getEffectiveFontFamily', () => {
  it('无配置时应返回默认字体', () => {
    expect(getEffectiveFontFamily(null)).toContain('Noto Serif SC');
    expect(getEffectiveFontFamily(undefined)).toContain('Noto Serif SC');
  });

  it('有预设字体时应返回预设字体', () => {
    const config = { fontFamily: '"Noto Sans SC", sans-serif' };
    expect(getEffectiveFontFamily(config)).toContain('Noto Sans SC');
  });

  it('有自定义字体时应优先返回自定义字体', () => {
    const config = {
      fontFamily: '"Noto Serif SC", serif',
      customFontFamily: 'ZJCustom_my-font',
    };
    expect(getEffectiveFontFamily(config)).toBe('"ZJCustom_my-font"');
  });

  it('无 fontFamily 字段时应返回默认字体', () => {
    const config = { enabled: true };
    expect(getEffectiveFontFamily(config)).toContain('Noto Serif SC');
  });
});

describe('getCategoryLabel', () => {
  it('应返回正确的中文标签', () => {
    expect(getCategoryLabel('serif')).toBe('衬线');
    expect(getCategoryLabel('sans-serif')).toBe('无衬线');
    expect(getCategoryLabel('handwriting')).toBe('手写');
    expect(getCategoryLabel('brush')).toBe('毛笔');
    expect(getCategoryLabel('display')).toBe('展示');
    expect(getCategoryLabel('mono')).toBe('等宽');
  });

  it('未知分类应返回"其他"', () => {
    expect(getCategoryLabel('unknown')).toBe('其他');
    expect(getCategoryLabel('')).toBe('其他');
  });
});
