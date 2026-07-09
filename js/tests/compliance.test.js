/**
 * 内容合规检测单元测试
 */
import { describe, it, expect } from 'vitest';
import {
  checkCompliance,
  RISK_LEVEL,
  RISK_CATEGORIES,
  getRiskLevelLabel,
  getRiskLevelColor,
  formatComplianceResult,
  getRiskWordStats,
  RISK_WORDS,
} from '../utils/compliance.js';

describe('checkCompliance - 基本功能', () => {
  it('空文本应通过检测', () => {
    const result = checkCompliance('');
    expect(result.passed).toBe(true);
    expect(result.risks).toEqual([]);
    expect(result.maxLevel).toBeNull();
  });

  it('null/undefined 应通过检测', () => {
    expect(checkCompliance(null).passed).toBe(true);
    expect(checkCompliance(undefined).passed).toBe(true);
  });

  it('非字符串应通过检测', () => {
    expect(checkCompliance(123).passed).toBe(true);
    expect(checkCompliance({}).passed).toBe(true);
  });

  it('正常文本应通过检测', () => {
    const result = checkCompliance('深夜加班后走出写字楼，抬头看见月亮');
    expect(result.passed).toBe(true);
    expect(result.risks).toEqual([]);
  });
});

describe('checkCompliance - 广告法极限用语', () => {
  it('应检测到"最佳"', () => {
    const result = checkCompliance('这是市面上最佳的产品');
    expect(result.passed).toBe(false);
    expect(result.maxLevel).toBe(RISK_LEVEL.BLOCK);
    expect(result.risks).toHaveLength(1);
    expect(result.risks[0].word).toBe('最佳');
    expect(result.risks[0].category).toBe('extreme');
    expect(result.risks[0].severity).toBe(RISK_LEVEL.BLOCK);
  });

  it('应检测到"第一"', () => {
    const result = checkCompliance('我们是行业第一');
    expect(result.passed).toBe(false);
    expect(result.risks[0].word).toBe('第一');
  });

  it('应检测到"唯一"', () => {
    const result = checkCompliance('这是市面上唯一的选择');
    expect(result.risks[0].word).toBe('唯一');
  });

  it('应检测到"顶级"', () => {
    const result = checkCompliance('顶级享受');
    expect(result.risks[0].word).toBe('顶级');
  });

  it('应检测到"No.1"', () => {
    const result = checkCompliance('我们是 No.1');
    expect(result.risks[0].word).toBe('No.1');
  });

  it('应检测到"绝对"', () => {
    const result = checkCompliance('这是绝对正确的');
    expect(result.risks[0].word).toBe('绝对');
  });

  it('应检测到"永久"', () => {
    const result = checkCompliance('永久免费使用');
    expect(result.risks[0].word).toBe('永久');
  });

  it('应检测到"遥遥领先"', () => {
    const result = checkCompliance('我们在技术上遥遥领先');
    expect(result.risks[0].word).toBe('遥遥领先');
  });
});

describe('checkCompliance - 多风险词检测', () => {
  it('应同时检测多个风险词', () => {
    const result = checkCompliance('这是市面上最佳且唯一的选择，遥遥领先');
    expect(result.risks.length).toBeGreaterThanOrEqual(3);
    const words = result.risks.map((r) => r.word);
    expect(words).toContain('最佳');
    expect(words).toContain('唯一');
    expect(words).toContain('遥遥领先');
  });

  it('同一风险词只记录一次', () => {
    const result = checkCompliance('最佳最佳最佳');
    const bestRisks = result.risks.filter((r) => r.word === '最佳');
    expect(bestRisks).toHaveLength(1);
  });

  it('不同分类的风险词都应检测到', () => {
    const result = checkCompliance('这是最佳产品，包治百病，保本保息');
    const categories = result.risks.map((r) => r.category);
    expect(categories).toContain('extreme');
    expect(categories).toContain('false');
    expect(categories).toContain('financial');
  });
});

describe('checkCompliance - 虚假宣传', () => {
  it('应检测到"100%有效"', () => {
    const result = checkCompliance('我们的产品100%有效');
    expect(result.passed).toBe(false);
    expect(result.risks[0].word).toBe('100%有效');
    expect(result.risks[0].category).toBe('false');
  });

  it('应检测到"包治百病"', () => {
    const result = checkCompliance('这个药包治百病');
    expect(result.risks[0].word).toBe('包治百病');
  });

  it('应检测到"稳赚不赔"', () => {
    const result = checkCompliance('投资这个项目稳赚不赔');
    expect(result.risks[0].word).toBe('稳赚不赔');
  });
});

describe('checkCompliance - 医疗/金融违规', () => {
  it('应检测到"祖传秘方"（警告级别）', () => {
    const result = checkCompliance('我家有祖传秘方');
    expect(result.risks[0].word).toBe('祖传秘方');
    expect(result.risks[0].category).toBe('medical');
    expect(result.risks[0].severity).toBe(RISK_LEVEL.WARNING);
  });

  it('应检测到"保本保息"（警告级别）', () => {
    const result = checkCompliance('理财产品保本保息');
    expect(result.risks[0].word).toBe('保本保息');
    expect(result.risks[0].category).toBe('financial');
    expect(result.risks[0].severity).toBe(RISK_LEVEL.WARNING);
  });

  it('医疗+金融警告不阻止通过', () => {
    const result = checkCompliance('祖传秘方保本保息');
    // 两个都是 WARNING 级别，不阻止
    expect(result.maxLevel).toBe(RISK_LEVEL.WARNING);
    // passed 为 true 因为没有 BLOCK 级别
    expect(result.passed).toBe(true);
  });
});

describe('checkCompliance - 返回值结构', () => {
  it('风险项应包含完整字段', () => {
    const result = checkCompliance('最佳产品');
    const risk = result.risks[0];
    expect(risk).toHaveProperty('word');
    expect(risk).toHaveProperty('category');
    expect(risk).toHaveProperty('categoryLabel');
    expect(risk).toHaveProperty('severity');
    expect(risk).toHaveProperty('suggestion');
    expect(risk).toHaveProperty('position');
    expect(risk).toHaveProperty('context');
  });

  it('position 应为风险词在文本中的位置', () => {
    const result = checkCompliance('这是一个最佳的产品');
    const risk = result.risks[0];
    expect(risk.position).toBe(4);
  });

  it('context 应包含风险词前后各 5 个字符', () => {
    const result = checkCompliance('这是一个最佳的产品真的很好');
    const risk = result.risks[0];
    expect(risk.context).toContain('最佳');
  });
});

describe('RISK_LEVEL 常量', () => {
  it('应有三个级别', () => {
    expect(RISK_LEVEL.BLOCK).toBe('block');
    expect(RISK_LEVEL.WARNING).toBe('warning');
    expect(RISK_LEVEL.INFO).toBe('info');
  });
});

describe('RISK_CATEGORIES', () => {
  it('应包含所有分类', () => {
    expect(RISK_CATEGORIES.extreme).toBeTruthy();
    expect(RISK_CATEGORIES['false']).toBeTruthy();
    expect(RISK_CATEGORIES.sensitive).toBeTruthy();
    expect(RISK_CATEGORIES.vulgar).toBeTruthy();
    expect(RISK_CATEGORIES.medical).toBeTruthy();
    expect(RISK_CATEGORIES.financial).toBeTruthy();
  });

  it('每个分类应有 id、label、severity', () => {
    Object.values(RISK_CATEGORIES).forEach((cat) => {
      expect(cat.id).toBeTruthy();
      expect(cat.label).toBeTruthy();
      expect(cat.severity).toBeTruthy();
    });
  });
});

describe('getRiskLevelLabel', () => {
  it('应返回正确的中文标签', () => {
    expect(getRiskLevelLabel(RISK_LEVEL.BLOCK)).toBe('严重风险');
    expect(getRiskLevelLabel(RISK_LEVEL.WARNING)).toBe('中等风险');
    expect(getRiskLevelLabel(RISK_LEVEL.INFO)).toBe('轻微提示');
    expect(getRiskLevelLabel(null)).toBe('安全');
  });
});

describe('getRiskLevelColor', () => {
  it('应返回正确的颜色值', () => {
    expect(getRiskLevelColor(RISK_LEVEL.BLOCK)).toBe('#e74c3c');
    expect(getRiskLevelColor(RISK_LEVEL.WARNING)).toBe('#f39c12');
    expect(getRiskLevelColor(RISK_LEVEL.INFO)).toBe('#3498db');
    expect(getRiskLevelColor(null)).toBe('#27ae60');
  });
});

describe('formatComplianceResult', () => {
  it('无风险应返回安全提示', () => {
    const result = { risks: [] };
    expect(formatComplianceResult(result)).toBe('内容合规，未检测到风险');
  });

  it('有风险应返回格式化文本', () => {
    const result = checkCompliance('最佳产品');
    const formatted = formatComplianceResult(result);
    expect(formatted).toContain('最佳');
    expect(formatted).toContain('广告法极限用语');
  });
});

describe('getRiskWordStats', () => {
  it('应返回总词数', () => {
    const stats = getRiskWordStats();
    expect(stats.total).toBe(RISK_WORDS.length);
    expect(stats.total).toBeGreaterThan(30);
  });

  it('应按分类统计', () => {
    const stats = getRiskWordStats();
    expect(stats.byCategory.extreme).toBeGreaterThan(10);
    expect(stats.byCategory.false).toBeGreaterThan(0);
    expect(stats.byCategory.medical).toBeGreaterThan(0);
    expect(stats.byCategory.financial).toBeGreaterThan(0);
  });
});

describe('RISK_WORDS 数据完整性', () => {
  it('每个风险词应有 word 和 category', () => {
    RISK_WORDS.forEach((rw) => {
      expect(rw.word).toBeTruthy();
      expect(rw.category).toBeTruthy();
    });
  });

  it('每个风险词的 category 应在 RISK_CATEGORIES 中', () => {
    RISK_WORDS.forEach((rw) => {
      expect(RISK_CATEGORIES[rw.category]).toBeTruthy();
    });
  });

  it('每个风险词应有修改建议', () => {
    RISK_WORDS.forEach((rw) => {
      expect(rw.suggestion).toBeTruthy();
      expect(rw.suggestion.length).toBeGreaterThan(0);
    });
  });
});
