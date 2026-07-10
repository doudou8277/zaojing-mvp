/**
 * ai-service.js 纯函数单元测试
 */

import { describe, it, expect } from 'vitest';
const aiService = require('../ai-service');

const { cleanJsonResponse, localEmotionAnalysis, generateLocalTitles, localCopy, localParseStyle, localImageAnalysis } =
  aiService._pure;

// ========== cleanJsonResponse ==========
describe('cleanJsonResponse', () => {
  it('应移除 ```json 代码块标记', () => {
    const input = '```json\n{"key": "value"}\n```';
    const result = cleanJsonResponse(input);
    expect(result).toBe('{"key": "value"}');
  });

  it('应移除无语言标记的 ``` 代码块', () => {
    const input = '```\n{"key": "value"}\n```';
    const result = cleanJsonResponse(input);
    expect(result).toBe('{"key": "value"}');
  });

  it('应处理无代码块的纯 JSON', () => {
    const input = '{"key": "value"}';
    const result = cleanJsonResponse(input);
    expect(result).toBe('{"key": "value"}');
  });

  it('应处理空字符串', () => {
    const result = cleanJsonResponse('');
    expect(result).toBe('');
  });

  it('应处理多行 JSON 内容', () => {
    const input = '```json\n{\n  "name": "test",\n  "value": 42\n}\n```';
    const result = cleanJsonResponse(input);
    expect(JSON.parse(result)).toEqual({ name: 'test', value: 42 });
  });
});

// ========== localEmotionAnalysis ==========
describe('localEmotionAnalysis', () => {
  it('应根据 moodTagId 返回对应情绪', () => {
    const result = localEmotionAnalysis('一些文字', 'emo');
    expect(result.primaryEmotion).toBe('忧伤');
    expect(result.emotionIntensity).toBe(7);
    expect(result.recommendedDirectors).toHaveLength(2);
    expect(result.recommendedDirectors[0].matchScore).toBe(85);
  });

  it('当无 moodTagId 时应使用关键词匹配', () => {
    const result = localEmotionAnalysis('我一个人走在空荡的街道上', null);
    expect(result.primaryEmotion).toBe('孤独');
    expect(result.recommendedDirectors[0].directorId).toBe('wkw');
  });

  it('应匹配英文关键词', () => {
    const result = localEmotionAnalysis('I feel so lonely tonight', null);
    expect(result.primaryEmotion).toBe('孤独');
  });

  it('应匹配"温暖"关键词', () => {
    const result = localEmotionAnalysis('今天阳光很好，想回家', null);
    expect(result.primaryEmotion).toBe('温暖');
  });

  it('应匹配"愤怒"关键词', () => {
    const result = localEmotionAnalysis('我很生气，这不公平', null);
    expect(result.primaryEmotion).toBe('愤怒');
  });

  it('无匹配关键词时应返回"复杂"情绪', () => {
    const result = localEmotionAnalysis('今天天气不错', null);
    expect(result.primaryEmotion).toBe('复杂');
  });

  it('应返回完整的结构化结果', () => {
    const result = localEmotionAnalysis('测试文本', 'lonely');
    expect(result).toHaveProperty('primaryEmotion');
    expect(result).toHaveProperty('emotionIntensity');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('recommendedDirectors');
    expect(result).toHaveProperty('suggestedTitles');
    expect(result).toHaveProperty('aiQuote');
  });

  it('应根据情绪返回贴切金句', () => {
    const result = localEmotionAnalysis('我好孤独', null);
    expect(result.aiQuote).toBe('城市那么大，却容不下一个拥抱。');
  });
});

// ========== generateLocalTitles ==========
describe('generateLocalTitles', () => {
  it('短文本（<=10字）应直接使用原文作为标题', () => {
    const result = generateLocalTitles('短文本');
    expect(result[0]).toBe('短文本');
    expect(result).toContain('关于那一刻');
  });

  it('长文本应截取前 9 字作为主标题', () => {
    const result = generateLocalTitles('这是一段很长的文字内容用于测试标题生成');
    expect(result[0]).toBe('这是一段很长的文');
  });

  it('长文本应包含后 9 字作为备选', () => {
    const result = generateLocalTitles('这是一段很长的文字内容用于测试标题生成');
    expect(result[1]).toBe('用于测试标题生成');
  });

  it('长文本应包含首尾组合标题', () => {
    const result = generateLocalTitles('这是一段很长的文字内容用于测试标题生成');
    expect(result[2]).toContain('·');
  });

  it('应始终包含"关于那一刻"作为兜底标题', () => {
    const result = generateLocalTitles('任意文本');
    expect(result).toContain('关于那一刻');
  });

  it('应返回 4 个标题', () => {
    const result = generateLocalTitles('测试文本足够长用来生成多个标题');
    expect(result).toHaveLength(4);
  });
});

// ========== localCopy ==========
describe('localCopy', () => {
  it('应返回包含 titles、quotes、review 的完整结构', () => {
    const result = localCopy('测试文本', '王家卫', '孤独');
    expect(result).toHaveProperty('titles');
    expect(result).toHaveProperty('quotes');
    expect(result).toHaveProperty('review');
  });

  it('quotes 应包含 3 条金句', () => {
    const result = localCopy('测试', '宫崎骏', '温暖');
    expect(result.quotes).toHaveLength(3);
  });

  it('review 应包含导演名和情绪', () => {
    const result = localCopy('测试', '诺兰', '宏大');
    expect(result.review).toContain('诺兰');
    expect(result.review).toContain('宏大');
  });

  it('无情绪参数时应正常工作', () => {
    const result = localCopy('测试', '王家卫', null);
    expect(result.quotes).toHaveLength(3);
    expect(result.review).toBeTruthy();
  });
});

// ========== localParseStyle ==========
describe('localParseStyle', () => {
  it('应匹配赛博朋克关键词', () => {
    const result = localParseStyle('赛博朋克风格，霓虹灯');
    expect(result.styleName || result.name).toBeTruthy();
  });

  it('应匹配水墨关键词', () => {
    const result = localParseStyle('水墨画风格');
    expect(result.styleName || result.name).toBeTruthy();
  });

  it('应返回包含 colors 和 styleDNA 的完整结构', () => {
    const result = localParseStyle('赛博朋克');
    expect(result).toHaveProperty('colors');
    expect(result).toHaveProperty('styleDNA');
  });

  it('无匹配关键词时应返回默认风格', () => {
    const result = localParseStyle('完全无法识别的描述');
    expect(result).toBeTruthy();
    expect(result.styleName || result.name).toBeTruthy();
  });
});

// ========== localImageAnalysis ==========
describe('localImageAnalysis', () => {
  it('应返回完整的分析结构', () => {
    const result = localImageAnalysis();
    expect(result).toHaveProperty('primaryEmotion');
    expect(result).toHaveProperty('emotionIntensity');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('recommendedDirectors');
    expect(result).toHaveProperty('suggestedTitles');
    expect(result).toHaveProperty('aiQuote');
  });

  it('emotionIntensity 应在 6-9 范围内', () => {
    // 运行多次验证随机值范围
    for (let i = 0; i < 20; i++) {
      const result = localImageAnalysis();
      expect(result.emotionIntensity).toBeGreaterThanOrEqual(6);
      expect(result.emotionIntensity).toBeLessThanOrEqual(9);
    }
  });

  it('recommendedDirectors 应包含 2 个导演', () => {
    const result = localImageAnalysis();
    expect(result.recommendedDirectors).toHaveLength(2);
  });
});
