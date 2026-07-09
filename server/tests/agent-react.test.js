/**
 * ReAct Agent 单元测试
 * 覆盖：selfEvaluate 纯函数、executeAgentTool 工具分发、AGENT_TOOLS 结构、降级路径
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const aiService = require('../ai-service');

const { selfEvaluate, executeAgentTool } = aiService._pure;
const { AGENT_TOOLS, agentCreate, agentCreateLegacy } = aiService;

// ========== AGENT_TOOLS 结构 ==========
describe('AGENT_TOOLS 工具定义', () => {
  it('应包含 5 个工具', () => {
    expect(AGENT_TOOLS).toHaveLength(5);
  });

  it('每个工具应有正确的 function calling 结构', () => {
    const requiredNames = ['analyze_emotion', 'generate_image', 'generate_copy', 'self_evaluate', 'finish'];
    const actualNames = AGENT_TOOLS.map(t => t.function.name);
    expect(actualNames.sort()).toEqual(requiredNames.sort());
  });

  it('每个工具的 parameters 应包含 type: object', () => {
    AGENT_TOOLS.forEach(tool => {
      expect(tool.type).toBe('function');
      expect(tool.function.parameters.type).toBe('object');
      expect(Array.isArray(tool.function.parameters.required)).toBe(true);
    });
  });

  it('finish 工具应包含 summary 参数', () => {
    const finishTool = AGENT_TOOLS.find(t => t.function.name === 'finish');
    expect(finishTool.function.parameters.properties.summary).toBeDefined();
    expect(finishTool.function.parameters.required).toContain('summary');
  });
});

// ========== selfEvaluate 纯函数 ==========
describe('selfEvaluate 自评函数', () => {
  it('完整结果（图片+文案）应得高分', () => {
    const entry = {
      directorId: 'miyazaki',
      image: { engine: 'seedream', imageBase64: 'fake_base64' },
      copy: { title: '风之谷', quote: '带上信仰前行' }
    };
    const result = selfEvaluate('miyazaki', entry, '温暖');
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.directorName).toBe('宫崎骏');
    expect(result.notes).toHaveLength(1);
  });

  it('图片缺失应扣分并给出提示', () => {
    const entry = {
      directorId: 'wkw',
      image: { error: '生成失败' },
      copy: { title: '重庆森林', quote: '过期罐头' }
    };
    const result = selfEvaluate('wkw', entry, '孤独');
    expect(result.score).toBeLessThan(80);
    expect(result.notes).toContain('图片缺失或生成失败');
  });

  it('文案缺失应扣分', () => {
    const entry = {
      directorId: 'nolan',
      image: { engine: 'seedream', imageUrl: '/img/x.png' },
      copy: null
    };
    const result = selfEvaluate('nolan', entry, '宏大');
    expect(result.score).toBeLessThan(80);
    expect(result.notes).toContain('文案缺失');
  });

  it('分数应限制在 0-100 范围', () => {
    const emptyEntry = { directorId: 'x', image: null, copy: null };
    const result = selfEvaluate('x', emptyEntry, null);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('未知导演 ID 应原样返回 directorName', () => {
    const entry = {
      directorId: 'unknown_dir',
      image: { engine: 'seedream', imageBase64: 'x' },
      copy: { title: 't', quote: 'q' }
    };
    const result = selfEvaluate('unknown_dir', entry, 'e');
    expect(result.directorName).toBe('unknown_dir');
  });
});

// ========== executeAgentTool 工具分发 ==========
describe('executeAgentTool 工具分发', () => {
  it('finish 工具应设置 state.finished 并返回 done: true', async () => {
    const state = { finished: false, summary: '', resultsByDirector: {}, emotion: null };
    const obs = await executeAgentTool('finish', { summary: '创作完成' }, { state });
    const parsed = JSON.parse(obs);
    expect(parsed.done).toBe(true);
    expect(state.finished).toBe(true);
    expect(state.summary).toBe('创作完成');
  });

  it('self_evaluate 工具对无图片结果应返回 score: 0', async () => {
    const state = { finished: false, summary: '', resultsByDirector: {}, emotion: null };
    const obs = await executeAgentTool('self_evaluate', { directorId: 'miyazaki' }, { state });
    const parsed = JSON.parse(obs);
    expect(parsed.score).toBe(0);
    expect(parsed.note).toContain('尚无图片');
  });

  it('self_evaluate 工具对完整结果应返回正分', async () => {
    const state = {
      finished: false,
      summary: '',
      emotion: { primaryEmotion: '温暖' },
      resultsByDirector: {
        miyazaki: {
          directorId: 'miyazaki',
          image: { engine: 'seedream', imageBase64: 'x' },
          copy: { title: 't', quote: 'q' }
        }
      }
    };
    const obs = await executeAgentTool('self_evaluate', { directorId: 'miyazaki' }, { state });
    const parsed = JSON.parse(obs);
    expect(parsed.score).toBeGreaterThanOrEqual(90);
    expect(parsed.directorName).toBe('宫崎骏');
  });

  it('未知工具应返回错误信息', async () => {
    const state = { finished: false, summary: '', resultsByDirector: {}, emotion: null };
    const obs = await executeAgentTool('nonexistent_tool', {}, { state });
    const parsed = JSON.parse(obs);
    expect(parsed.error).toContain('未知工具');
  });
});

// ========== agentCreate 降级路径 ==========
// 当未配置 VOLCENGINE_API_KEY 时，ReAct 模式会失败，应降级到 agentCreateLegacy
describe('agentCreate 降级路径', () => {
  const originalKey = process.env.VOLCENGINE_API_KEY;

  beforeAll(() => {
    // 临时移除 API Key，触发降级
    delete process.env.VOLCENGINE_API_KEY;
  });

  it('无 API Key 时应降级到固定流程并返回 reasoningChain', async () => {
    const result = await agentCreate({
      text: '一个人走在雨夜的街道上',
      moodTagId: 'lonely',
      directorIds: ['wkw'],
      engine: 'seedream',
      size: 'vertical'
    });

    // 降级路径应返回 fallback 标记
    expect(result.fallback).toBe(true);
    // 返回结构兼容性：emotion + results + agentLog + reasoningChain
    expect(result.emotion).toBeDefined();
    expect(result.emotion.primaryEmotion).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
    expect(Array.isArray(result.agentLog)).toBe(true);
    expect(Array.isArray(result.reasoningChain)).toBe(true);
    // 降级路径的 reasoningChain 应从 agentLog 转换而来
    expect(result.reasoningChain.length).toBe(result.agentLog.length);
    expect(result.summary).toContain('降级');
  }, 15000);

  it('降级路径应为指定导演生成结果', async () => {
    const result = await agentCreateLegacy({
      text: '温暖的午后阳光',
      moodTagId: null,
      directorIds: ['miyazaki'],
      engine: 'seedream',
      size: 'vertical'
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].directorId).toBe('miyazaki');
    // 无 API Key 时图片生成会失败，但应有 error 字段或降级处理
    expect(result.results[0].image).toBeDefined();
    expect(result.results[0].copy).toBeDefined();
  }, 15000);

  // 恢复环境变量（避免影响其他测试）
  afterAll(() => {
    if (originalKey !== undefined) {
      process.env.VOLCENGINE_API_KEY = originalKey;
    }
  });
});
