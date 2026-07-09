/**
 * 热点话题联动工具模块单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HOT_PLATFORMS,
  getLocalHotTopics,
  fetchHotTopics,
  formatHotValue,
  getCategoryColor,
  topicToPrompt,
} from '../utils/hot-topics.js';

// Mock logger to avoid console noise during tests
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// 保存原始 fetch 以便在 afterEach 恢复
const originalFetch = globalThis.fetch;

describe('HOT_PLATFORMS', () => {
  it('应包含 4 个平台', () => {
    expect(HOT_PLATFORMS).toHaveLength(4);
  });

  it('每个平台应有完整的元数据', () => {
    for (const p of HOT_PLATFORMS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.icon).toBeTruthy();
    }
  });

  it('应包含 weibo、douyin、zhihu、bilibili', () => {
    const ids = HOT_PLATFORMS.map((p) => p.id);
    expect(ids).toContain('weibo');
    expect(ids).toContain('douyin');
    expect(ids).toContain('zhihu');
    expect(ids).toContain('bilibili');
  });

  it('平台 ID 应唯一', () => {
    const ids = HOT_PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getLocalHotTopics', () => {
  it('应返回 4 个平台的数据', () => {
    const topics = getLocalHotTopics();
    expect(topics).toHaveProperty('weibo');
    expect(topics).toHaveProperty('douyin');
    expect(topics).toHaveProperty('zhihu');
    expect(topics).toHaveProperty('bilibili');
  });

  it('每个平台应有话题数组', () => {
    const topics = getLocalHotTopics();
    for (const platform of ['weibo', 'douyin', 'zhihu', 'bilibili']) {
      expect(Array.isArray(topics[platform])).toBe(true);
      expect(topics[platform].length).toBeGreaterThan(0);
    }
  });

  it('话题应有 rank、title、hot 字段', () => {
    const topics = getLocalHotTopics();
    const firstWeibo = topics.weibo[0];
    expect(firstWeibo).toHaveProperty('rank');
    expect(firstWeibo).toHaveProperty('title');
    expect(firstWeibo).toHaveProperty('hot');
    expect(typeof firstWeibo.hot).toBe('number');
  });

  it('应返回深拷贝，修改不影响原数据', () => {
    const topics1 = getLocalHotTopics();
    const originalTitle = topics1.weibo[0].title;
    topics1.weibo[0].title = '修改后的标题';

    const topics2 = getLocalHotTopics();
    expect(topics2.weibo[0].title).toBe(originalTitle);
  });
});

describe('formatHotValue', () => {
  it('应正确格式化小于一万的数值', () => {
    expect(formatHotValue(5000)).toBe('5000');
    expect(formatHotValue(9999)).toBe('9999');
  });

  it('应正确格式化万级数值', () => {
    expect(formatHotValue(10000)).toBe('1.0万');
    expect(formatHotValue(4823567)).toBe('482.4万');
    expect(formatHotValue(99999999)).toBe('10000.0万');
  });

  it('应正确格式化亿级数值', () => {
    expect(formatHotValue(100000000)).toBe('1.0亿');
    expect(formatHotValue(123456789)).toBe('1.2亿');
  });

  it('应处理零值', () => {
    expect(formatHotValue(0)).toBe('0');
  });

  it('应处理非法输入', () => {
    expect(formatHotValue(null)).toBe('0');
    expect(formatHotValue(undefined)).toBe('0');
    expect(formatHotValue('abc')).toBe('0');
    expect(formatHotValue(NaN)).toBe('0');
  });
});

describe('getCategoryColor', () => {
  it('应为已知分类返回颜色', () => {
    expect(getCategoryColor('影视')).toBe('#e74c3c');
    expect(getCategoryColor('娱乐')).toBe('#e67e22');
    expect(getCategoryColor('设计')).toBe('#9b59b6');
    expect(getCategoryColor('摄影')).toBe('#1abc9c');
  });

  it('应为未知分类返回默认颜色', () => {
    const color = getCategoryColor('未知分类');
    expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('返回的颜色应为合法十六进制', () => {
    const categories = ['影视', '娱乐', '社会', '设计', '摄影', '教程', '音乐', '未知'];
    for (const cat of categories) {
      expect(getCategoryColor(cat)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('topicToPrompt', () => {
  it('应将话题转换为创作文案', () => {
    const topic = { title: '国产科幻电影迎来新突破', platform: 'weibo' };
    const prompt = topicToPrompt(topic);
    expect(prompt).toContain('国产科幻电影迎来新突破');
    expect(prompt).toContain('微博热搜');
  });

  it('应为不同平台生成正确的来源标识', () => {
    const cases = [
      { platform: 'weibo', expected: '微博热搜' },
      { platform: 'douyin', expected: '抖音热榜' },
      { platform: 'zhihu', expected: '知乎热榜' },
      { platform: 'bilibili', expected: 'B站热门' },
    ];
    for (const c of cases) {
      const prompt = topicToPrompt({ title: '测试话题', platform: c.platform });
      expect(prompt).toContain(c.expected);
    }
  });

  it('空话题应返回空字符串', () => {
    expect(topicToPrompt(null)).toBe('');
    expect(topicToPrompt(undefined)).toBe('');
    expect(topicToPrompt({})).toBe('');
    expect(topicToPrompt({ title: '' })).toBe('');
  });

  it('未知平台应使用默认来源', () => {
    const prompt = topicToPrompt({ title: '测试', platform: 'unknown' });
    expect(prompt).toContain('热搜');
    expect(prompt).toContain('测试');
  });
});

describe('fetchHotTopics', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('后端可用时应返回后端数据', async () => {
    const mockTopics = { weibo: [{ rank: 1, title: '测试', hot: 100 }], douyin: [] };
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ topics: mockTopics, platforms: [], totalCount: 1, cached: true }),
    });

    const result = await fetchHotTopics();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/hot-topics', { method: 'GET' });
    expect(result).toEqual(mockTopics);
  });

  it('forceRefresh 应使用 refresh=1 参数', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ topics: { weibo: [] }, platforms: [], totalCount: 0, cached: false }),
    });

    await fetchHotTopics(true);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/hot-topics?refresh=1', { method: 'GET' });
  });

  it('后端返回 HTTP 错误时应降级为本地数据', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await fetchHotTopics();
    expect(result).toHaveProperty('weibo');
    expect(result.weibo.length).toBeGreaterThan(0);
  });

  it('网络请求失败时应降级为本地数据', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('网络错误'));

    const result = await fetchHotTopics();
    expect(result).toHaveProperty('weibo');
    expect(result).toHaveProperty('douyin');
  });

  it('响应格式异常时应降级为本地数据', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ invalid: 'format' }),
    });

    const result = await fetchHotTopics();
    expect(result).toHaveProperty('weibo');
  });

  it('降级数据应是深拷贝', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('网络错误'));
    const result1 = await fetchHotTopics();
    const originalTitle = result1.weibo[0].title;
    result1.weibo[0].title = '修改';

    globalThis.fetch.mockRejectedValueOnce(new Error('网络错误'));
    const result2 = await fetchHotTopics();
    expect(result2.weibo[0].title).toBe(originalTitle);
  });
});
