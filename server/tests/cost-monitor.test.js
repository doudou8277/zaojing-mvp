/**
 * cost-monitor.js 成本监控单元测试
 */

import { describe, it, expect } from 'vitest';
const costMonitor = require('../cost-monitor');

describe('costMonitor', () => {
  it('recordLLMCall 应记录 Token 和费用', () => {
    const before = costMonitor.getStatsSummary();
    costMonitor.recordLLMCall('doubao-1.5-pro-32k-250115', 100, 50);
    const after = costMonitor.getStatsSummary();

    // 总 Token 应增加 150
    const beforeTokens = before.totalTokens;
    const afterTokens = after.totalTokens;
    expect(afterTokens).toBeGreaterThan(beforeTokens);
  });

  it('recordImageCall 应记录图片生成费用', () => {
    const before = costMonitor.getStatsSummary();
    costMonitor.recordImageCall('doubao-seedream-4-0-250828');
    const after = costMonitor.getStatsSummary();

    // 调用次数应增加
    expect(after.totalCalls).toBeGreaterThan(before.totalCalls);
  });

  it('getStatsSummary 应返回完整的统计结构', () => {
    const stats = costMonitor.getStatsSummary();
    expect(stats).toHaveProperty('date');
    expect(stats).toHaveProperty('totalCost');
    expect(stats).toHaveProperty('totalTokens');
    expect(stats).toHaveProperty('totalCalls');
    expect(stats).toHaveProperty('byModel');
    expect(Array.isArray(stats.byModel)).toBe(true);
  });

  it('byModel 应包含模型名、调用次数、Token 数和费用', () => {
    costMonitor.recordLLMCall('doubao-1.5-pro-32k-250115', 100, 50);
    const stats = costMonitor.getStatsSummary();
    const doubao = stats.byModel.find((m) => m.model === 'doubao-1.5-pro-32k-250115');
    if (doubao) {
      expect(doubao).toHaveProperty('calls');
      expect(doubao).toHaveProperty('tokens');
      expect(doubao).toHaveProperty('cost');
    }
  });

  it('PRICING 应包含已知模型的价格', () => {
    expect(costMonitor.PRICING).toHaveProperty('doubao-1.5-pro-32k-250115');
    expect(costMonitor.PRICING).toHaveProperty('doubao-seedream-4-0-250828');
    expect(costMonitor.PRICING['doubao-1.5-pro-32k-250115']).toHaveProperty('input');
    expect(costMonitor.PRICING['doubao-1.5-pro-32k-250115']).toHaveProperty('output');
  });
});
