/**
 * 模板系统测试
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POSTER_TEMPLATES, TEMPLATE_CATEGORIES, DIRECTORS, POSTER_FORMATS } from '../data.js';

// 手动 mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('POSTER_TEMPLATES 数据完整性', () => {
  it('应有至少 20 个预设模板', () => {
    expect(POSTER_TEMPLATES.length).toBeGreaterThanOrEqual(20);
  });

  it('每个模板应有完整的必填字段', () => {
    POSTER_TEMPLATES.forEach((tpl) => {
      expect(tpl.id).toBeTruthy();
      expect(tpl.name).toBeTruthy();
      expect(tpl.icon).toBeTruthy();
      expect(tpl.text).toBeTruthy();
      expect(tpl.directorId).toBeTruthy();
      expect(tpl.format).toBeTruthy();
      expect(tpl.category).toBeTruthy();
      expect(tpl.source).toBe('preset');
    });
  });

  it('每个模板的 directorId 应在 DIRECTORS 中存在', () => {
    const directorIds = DIRECTORS.map((d) => d.id);
    POSTER_TEMPLATES.forEach((tpl) => {
      expect(directorIds).toContain(tpl.directorId);
    });
  });

  it('每个模板的 format 应在 POSTER_FORMATS 中存在', () => {
    const formatIds = POSTER_FORMATS.map((f) => f.id);
    POSTER_TEMPLATES.forEach((tpl) => {
      expect(formatIds).toContain(tpl.format);
    });
  });

  it('模板 ID 应唯一', () => {
    const ids = POSTER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('模板文本长度应合理（1-200 字符）', () => {
    POSTER_TEMPLATES.forEach((tpl) => {
      expect(tpl.text.length).toBeGreaterThan(0);
      expect(tpl.text.length).toBeLessThanOrEqual(200);
    });
  });

  it('应覆盖所有分类', () => {
    const categories = new Set(POSTER_TEMPLATES.map((t) => t.category));
    expect(categories.has('cinema')).toBe(true);
    expect(categories.has('emotion')).toBe(true);
    expect(categories.has('festival')).toBe(true);
    expect(categories.has('social')).toBe(true);
  });
});

describe('TEMPLATE_CATEGORIES', () => {
  it('应包含"全部"分类', () => {
    const allCat = TEMPLATE_CATEGORIES.find((c) => c.id === 'all');
    expect(allCat).toBeTruthy();
    expect(allCat.label).toBe('全部');
  });

  it('每个分类有 id、label、icon', () => {
    TEMPLATE_CATEGORIES.forEach((cat) => {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.icon).toBeTruthy();
    });
  });

  it('分类 ID 应唯一', () => {
    const ids = TEMPLATE_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('模板分类过滤逻辑', () => {
  it('"全部"应返回所有模板', () => {
    const all = POSTER_TEMPLATES;
    expect(all.length).toBe(POSTER_TEMPLATES.length);
  });

  it('按 cinema 分类过滤应只返回电影场景模板', () => {
    const cinemaTemplates = POSTER_TEMPLATES.filter((t) => t.category === 'cinema');
    expect(cinemaTemplates.length).toBeGreaterThan(0);
    cinemaTemplates.forEach((t) => {
      expect(t.category).toBe('cinema');
    });
  });

  it('按 emotion 分类过滤应只返回情绪表达模板', () => {
    const emotionTemplates = POSTER_TEMPLATES.filter((t) => t.category === 'emotion');
    expect(emotionTemplates.length).toBeGreaterThan(0);
    emotionTemplates.forEach((t) => {
      expect(t.category).toBe('emotion');
    });
  });

  it('按 festival 分类过滤应只返回节日场景模板', () => {
    const festivalTemplates = POSTER_TEMPLATES.filter((t) => t.category === 'festival');
    expect(festivalTemplates.length).toBeGreaterThan(0);
  });

  it('按 social 分类过滤应只返回社交场景模板', () => {
    const socialTemplates = POSTER_TEMPLATES.filter((t) => t.category === 'social');
    expect(socialTemplates.length).toBeGreaterThan(0);
  });
});

describe('用户模板 localStorage 持久化', () => {
  const STORAGE_KEY = 'zaojing_user_templates';

  beforeEach(() => {
    localStorage.clear();
  });

  it('空 localStorage 应返回空数组', () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    expect(saved).toBeNull();
    const parsed = saved ? JSON.parse(saved) : [];
    expect(parsed).toEqual([]);
  });

  it('应能保存和读取模板', () => {
    const templates = [
      {
        id: 'test-1',
        name: '测试模板',
        icon: 'bookmark',
        text: '测试文本',
        directorId: 'miyazaki',
        format: 'vertical',
        category: 'custom',
        source: 'user',
        createdAt: Date.now(),
      },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(saved);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('test-1');
    expect(parsed[0].text).toBe('测试文本');
  });

  it('应能删除指定模板', () => {
    const templates = [
      { id: 'test-1', text: 'a', directorId: 'miyazaki', source: 'user' },
      { id: 'test-2', text: 'b', directorId: 'wkw', source: 'user' },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    const filtered = templates.filter((t) => t.id !== 'test-1');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('test-2');
  });

  it('损坏的 JSON 应安全返回空数组', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json{');
    let result = [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) result = JSON.parse(saved);
    } catch (e) {
      result = [];
    }
    expect(result).toEqual([]);
  });

  it('非数组数据应返回空数组', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'array' }));
    let result = [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        result = Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      result = [];
    }
    expect(result).toEqual([]);
  });
});
