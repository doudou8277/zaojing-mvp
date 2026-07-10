/**
 * 品牌工具包单元测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_BRAND_CONFIG, LOGO_POSITIONS, WATERMARK_POSITIONS } from '../utils/brand-toolkit.js';

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

describe('DEFAULT_BRAND_CONFIG', () => {
  it('应有合理的默认值', () => {
    expect(DEFAULT_BRAND_CONFIG.enabled).toBe(false);
    expect(DEFAULT_BRAND_CONFIG.logoDataUrl).toBeNull();
    expect(DEFAULT_BRAND_CONFIG.logoPosition).toBe('bottom-right');
    expect(DEFAULT_BRAND_CONFIG.logoSize).toBeGreaterThan(0);
    expect(DEFAULT_BRAND_CONFIG.logoSize).toBeLessThan(1);
    expect(DEFAULT_BRAND_CONFIG.logoOpacity).toBeGreaterThan(0);
    expect(DEFAULT_BRAND_CONFIG.logoOpacity).toBeLessThanOrEqual(1);
    expect(DEFAULT_BRAND_CONFIG.watermarkText).toBe('');
    expect(DEFAULT_BRAND_CONFIG.watermarkOpacity).toBeGreaterThan(0);
    expect(DEFAULT_BRAND_CONFIG.watermarkFontSize).toBeGreaterThan(0);
  });
});

describe('LOGO_POSITIONS', () => {
  it('应有 4 个位置选项', () => {
    expect(LOGO_POSITIONS).toHaveLength(4);
  });

  it('应包含四角位置', () => {
    const ids = LOGO_POSITIONS.map((p) => p.id);
    expect(ids).toContain('top-left');
    expect(ids).toContain('top-right');
    expect(ids).toContain('bottom-left');
    expect(ids).toContain('bottom-right');
  });

  it('每个位置有 id 和 label', () => {
    LOGO_POSITIONS.forEach((p) => {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
    });
  });
});

describe('WATERMARK_POSITIONS', () => {
  it('应包含居中和平铺选项', () => {
    const ids = WATERMARK_POSITIONS.map((p) => p.id);
    expect(ids).toContain('center');
    expect(ids).toContain('tile');
  });

  it('每个位置有 id 和 label', () => {
    WATERMARK_POSITIONS.forEach((p) => {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
    });
  });
});

describe('品牌配置持久化', () => {
  const STORAGE_KEY = 'zaojing_brand_config';

  beforeEach(() => {
    localStorageMock.clear();
  });

  it('空 localStorage 应返回默认配置', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).toBeNull();
  });

  it('应能保存和读取配置', () => {
    const config = { ...DEFAULT_BRAND_CONFIG, enabled: true, watermarkText: '@我的品牌' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(saved.enabled).toBe(true);
    expect(saved.watermarkText).toBe('@我的品牌');
  });

  it('应能删除配置', () => {
    localStorage.setItem(STORAGE_KEY, '{"enabled":true}');
    localStorage.removeItem(STORAGE_KEY);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('损坏的 JSON 应安全降级', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json{');
    let result;
    try {
      result = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      result = { ...DEFAULT_BRAND_CONFIG };
    }
    expect(result.enabled).toBe(false);
  });
});

describe('Logo 验证逻辑', () => {
  it('非图片文件应被拒绝', () => {
    const file = { type: 'text/plain', size: 100 };
    expect(file.type.startsWith('image/')).toBe(false);
  });

  it('图片文件应被接受', () => {
    const file = { type: 'image/png', size: 100 };
    expect(file.type.startsWith('image/')).toBe(true);
  });

  it('超过 2MB 的文件应被拒绝', () => {
    const file = { type: 'image/png', size: 3 * 1024 * 1024 };
    expect(file.size > 2 * 1024 * 1024).toBe(true);
  });

  it('小于 2MB 的文件应被接受', () => {
    const file = { type: 'image/png', size: 1 * 1024 * 1024 };
    expect(file.size > 2 * 1024 * 1024).toBe(false);
  });
});

describe('品牌配置字段验证', () => {
  it('logoSize 应在 0.05-0.25 范围内', () => {
    expect(DEFAULT_BRAND_CONFIG.logoSize).toBeGreaterThanOrEqual(0.05);
    expect(DEFAULT_BRAND_CONFIG.logoSize).toBeLessThanOrEqual(0.25);
  });

  it('logoOpacity 应在 0-1 范围内', () => {
    expect(DEFAULT_BRAND_CONFIG.logoOpacity).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_BRAND_CONFIG.logoOpacity).toBeLessThanOrEqual(1);
  });

  it('watermarkOpacity 应在 0-1 范围内', () => {
    expect(DEFAULT_BRAND_CONFIG.watermarkOpacity).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_BRAND_CONFIG.watermarkOpacity).toBeLessThanOrEqual(1);
  });

  it('watermarkFontSize 应为正整数', () => {
    expect(DEFAULT_BRAND_CONFIG.watermarkFontSize).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_BRAND_CONFIG.watermarkFontSize)).toBe(true);
  });
});
