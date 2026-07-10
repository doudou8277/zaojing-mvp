/**
 * 开放 API 网关模块单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const crypto = require('crypto');
const apiGateway = require('../api-gateway');

// 使用 spyOn 替代 vi.mock，直接在真实 fs 模块上 spy
let statSyncSpy, readFileSyncSpy, writeFileSyncSpy, existsSyncSpy, renameSyncSpy, mkdirSyncSpy;
let _mtime = 100;

// 模拟内存中的数据存储
let _mockData = { keys: [], usage: {}, webhooks: [], createdAt: new Date().toISOString() };

beforeEach(() => {
  _mtime++;
  _mockData = { keys: [], usage: {}, webhooks: [], createdAt: new Date().toISOString() };

  statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: _mtime });
  readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(_mockData));
  existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation((file, data) => {
    _mockData = JSON.parse(data);
  });
  renameSyncSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
  mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('API_TIERS', () => {
  it('应包含 free、pro、enterprise 三个层级', () => {
    expect(apiGateway.API_TIERS).toHaveProperty('free');
    expect(apiGateway.API_TIERS).toHaveProperty('pro');
    expect(apiGateway.API_TIERS).toHaveProperty('enterprise');
  });

  it('每个层级应有完整配置', () => {
    for (const tier of Object.values(apiGateway.API_TIERS)) {
      expect(tier.id).toBeTruthy();
      expect(tier.label).toBeTruthy();
      expect(tier.rateLimitPerMin).toBeGreaterThan(0);
      expect(tier.monthlyQuota).toBeGreaterThan(0);
      expect(Array.isArray(tier.features)).toBe(true);
      expect(tier.features.length).toBeGreaterThan(0);
    }
  });

  it('层级配额应递增', () => {
    expect(apiGateway.API_TIERS.free.monthlyQuota).toBeLessThan(apiGateway.API_TIERS.pro.monthlyQuota);
    expect(apiGateway.API_TIERS.pro.monthlyQuota).toBeLessThan(apiGateway.API_TIERS.enterprise.monthlyQuota);
  });
});

describe('PRICING', () => {
  it('应包含主要端点的计费', () => {
    expect(apiGateway.PRICING).toHaveProperty('poster-generate');
    expect(apiGateway.PRICING).toHaveProperty('image-generate');
    expect(apiGateway.PRICING).toHaveProperty('emotion-analysis');
    expect(apiGateway.PRICING).toHaveProperty('copy-generate');
  });

  it('每个计费项应有 price 和 unit', () => {
    for (const item of Object.values(apiGateway.PRICING)) {
      expect(typeof item.price).toBe('number');
      expect(item.price).toBeGreaterThanOrEqual(0);
      expect(item.unit).toBeTruthy();
    }
  });
});

describe('createApiKey', () => {
  it('应创建免费版 Key', () => {
    const apiKey = apiGateway.createApiKey({ name: '测试Key', tier: 'free' });
    expect(apiKey.key).toMatch(/^zj_/);
    expect(apiKey.name).toBe('测试Key');
    expect(apiKey.tier).toBe('free');
    expect(apiKey.status).toBe('active');
    expect(apiKey.keyHash).toBeTruthy();
    expect(apiKey.id).toMatch(/^key_/);
  });

  it('应创建专业版 Key 并设置对应配额', () => {
    const apiKey = apiGateway.createApiKey({ name: 'Pro Key', tier: 'pro' });
    expect(apiKey.tier).toBe('pro');
    expect(apiKey.rateLimitPerMin).toBe(apiGateway.API_TIERS.pro.rateLimitPerMin);
    expect(apiKey.monthlyQuota).toBe(apiGateway.API_TIERS.pro.monthlyQuota);
  });

  it('应支持设置过期时间', () => {
    const apiKey = apiGateway.createApiKey({ name: '过期Key', tier: 'free', expiresInDays: 30 });
    expect(apiKey.expiresAt).toBeTruthy();
    const expiry = new Date(apiKey.expiresAt);
    const now = new Date();
    const diffDays = (expiry - now) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });

  it('无过期时间时 expiresAt 应为 null', () => {
    const apiKey = apiGateway.createApiKey({ name: '永久Key', tier: 'free' });
    expect(apiKey.expiresAt).toBeNull();
  });

  it('无效层级应抛出错误', () => {
    expect(() => apiGateway.createApiKey({ tier: 'invalid' })).toThrow();
  });

  it('每次生成的 key 应唯一', () => {
    const key1 = apiGateway.createApiKey({ name: 'Key1' });
    const key2 = apiGateway.createApiKey({ name: 'Key2' });
    expect(key1.key).not.toBe(key2.key);
    expect(key1.keyHash).not.toBe(key2.keyHash);
  });
});

describe('validateApiKey', () => {
  it('应验证有效的 API Key', () => {
    const created = apiGateway.createApiKey({ name: '测试', tier: 'free' });
    const validated = apiGateway.validateApiKey(created.key);
    expect(validated).not.toBeNull();
    expect(validated.id).toBe(created.id);
    expect(validated.name).toBe('测试');
    // 验证返回值不应包含明文 key
    expect(validated.key).toBeUndefined();
  });

  it('无效的 Key 应返回 null', () => {
    expect(apiGateway.validateApiKey('invalid_key')).toBeNull();
    expect(apiGateway.validateApiKey('')).toBeNull();
    expect(apiGateway.validateApiKey(null)).toBeNull();
    expect(apiGateway.validateApiKey(undefined)).toBeNull();
  });

  it('已禁用的 Key 应返回 null', () => {
    const created = apiGateway.createApiKey({ name: '禁用测试' });
    apiGateway.updateApiKey(created.id, { status: 'disabled' });
    expect(apiGateway.validateApiKey(created.key)).toBeNull();
  });

  it('已过期的 Key 应返回 null', () => {
    const created = apiGateway.createApiKey({ name: '过期测试', expiresInDays: -1 });
    expect(apiGateway.validateApiKey(created.key)).toBeNull();
  });
});

describe('listApiKeys', () => {
  it('应返回所有 Key（不含明文 key 和 keyHash）', () => {
    apiGateway.createApiKey({ name: 'Key A' });
    apiGateway.createApiKey({ name: 'Key B' });
    const keys = apiGateway.listApiKeys();
    expect(keys).toHaveLength(2);
    for (const k of keys) {
      expect(k.key).toBeUndefined();
      expect(k.keyHash).toBeUndefined();
      expect(k.name).toBeTruthy();
    }
  });
});

describe('updateApiKey', () => {
  it('应更新 Key 名称', () => {
    const created = apiGateway.createApiKey({ name: '旧名称' });
    const updated = apiGateway.updateApiKey(created.id, { name: '新名称' });
    expect(updated.name).toBe('新名称');
  });

  it('切换层级应更新配额', () => {
    const created = apiGateway.createApiKey({ name: '升级', tier: 'free' });
    const updated = apiGateway.updateApiKey(created.id, { tier: 'pro' });
    expect(updated.tier).toBe('pro');
    expect(updated.rateLimitPerMin).toBe(apiGateway.API_TIERS.pro.rateLimitPerMin);
    expect(updated.monthlyQuota).toBe(apiGateway.API_TIERS.pro.monthlyQuota);
  });

  it('不存在的 Key ID 应返回 null', () => {
    expect(apiGateway.updateApiKey('nonexistent', { name: 'test' })).toBeNull();
  });
});

describe('deleteApiKey', () => {
  it('应删除存在的 Key', () => {
    const created = apiGateway.createApiKey({ name: '待删除' });
    const result = apiGateway.deleteApiKey(created.id);
    expect(result).toBe(true);
    expect(apiGateway.listApiKeys()).toHaveLength(0);
  });

  it('删除不存在的 Key 应返回 false', () => {
    expect(apiGateway.deleteApiKey('nonexistent')).toBe(false);
  });
});

describe('recordUsage / getUsageStats', () => {
  it('应记录用量并统计', () => {
    const apiKey = apiGateway.createApiKey({ name: '用量测试', tier: 'free' });
    apiGateway.recordUsage(apiKey.id, 'poster-generate');
    apiGateway.recordUsage(apiKey.id, 'poster-generate');
    apiGateway.recordUsage(apiKey.id, 'emotion-analysis');

    const stats = apiGateway.getUsageStats(apiKey.id);
    expect(stats.totalCalls).toBe(3);
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.endpointBreakdown).toHaveProperty('poster-generate');
    expect(stats.endpointBreakdown['poster-generate'].calls).toBe(2);
    expect(stats.endpointBreakdown['emotion-analysis'].calls).toBe(1);
  });

  it('应正确计算配额剩余', () => {
    const apiKey = apiGateway.createApiKey({ name: '配额测试', tier: 'free' });
    // free tier quota = 100
    apiGateway.recordUsage(apiKey.id, 'poster-generate');
    const stats = apiGateway.getUsageStats(apiKey.id);
    expect(stats.quotaUsed).toBe(1);
    expect(stats.quotaRemaining).toBe(99);
    expect(stats.quotaPercentage).toBe(1);
  });

  it('无用量的 Key 应返回零统计', () => {
    const apiKey = apiGateway.createApiKey({ name: '零用量' });
    const stats = apiGateway.getUsageStats(apiKey.id);
    expect(stats.totalCalls).toBe(0);
    expect(stats.totalCost).toBe(0);
    expect(stats.quotaRemaining).toBe(apiGateway.API_TIERS.free.monthlyQuota);
  });
});

describe('getAllUsageStats', () => {
  it('应汇总所有 Key 的用量', () => {
    const key1 = apiGateway.createApiKey({ name: 'Key1', tier: 'free' });
    const key2 = apiGateway.createApiKey({ name: 'Key2', tier: 'pro' });
    apiGateway.recordUsage(key1.id, 'poster-generate');
    apiGateway.recordUsage(key2.id, 'image-generate');
    apiGateway.recordUsage(key2.id, 'copy-generate');

    const stats = apiGateway.getAllUsageStats();
    expect(stats.totalCalls).toBe(3);
    expect(stats.totalCost).toBeGreaterThan(0);
    expect(stats.totalKeys).toBe(2);
    expect(stats.activeKeys).toBe(2);
  });
});

describe('checkQuota', () => {
  it('未超配额应返回 exceeded: false', () => {
    const apiKey = apiGateway.createApiKey({ name: '配额检查', tier: 'free' });
    const result = apiGateway.checkQuota(apiKey);
    expect(result.exceeded).toBe(false);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('无效 Key 应返回 exceeded: true', () => {
    const result = apiGateway.checkQuota(null);
    expect(result.exceeded).toBe(true);
  });
});

describe('checkFeatureAccess', () => {
  it('免费版应能访问基础功能', () => {
    const apiKey = apiGateway.createApiKey({ name: '免费', tier: 'free' });
    expect(apiGateway.checkFeatureAccess(apiKey, 'poster-generate')).toBe(true);
    expect(apiGateway.checkFeatureAccess(apiKey, 'emotion-analysis')).toBe(true);
  });

  it('免费版不能访问 Webhook', () => {
    const apiKey = apiGateway.createApiKey({ name: '免费', tier: 'free' });
    expect(apiGateway.checkFeatureAccess(apiKey, 'webhook')).toBe(false);
  });

  it('专业版应能访问 Webhook', () => {
    const apiKey = apiGateway.createApiKey({ name: '专业', tier: 'pro' });
    expect(apiGateway.checkFeatureAccess(apiKey, 'webhook')).toBe(true);
    expect(apiGateway.checkFeatureAccess(apiKey, 'batch-generate')).toBe(true);
  });

  it('无效 Key 应返回 false', () => {
    expect(apiGateway.checkFeatureAccess(null, 'poster-generate')).toBe(false);
  });
});

describe('registerWebhook / listWebhooks / deleteWebhook', () => {
  it('应注册 Webhook', () => {
    const wh = apiGateway.registerWebhook({
      url: 'https://example.com/webhook',
      events: ['poster.generated'],
      name: '测试 Webhook',
    });
    expect(wh.id).toMatch(/^wh_/);
    expect(wh.url).toBe('https://example.com/webhook');
    expect(wh.events).toContain('poster.generated');
    expect(wh.secret).toBeTruthy();
    expect(wh.status).toBe('active');
  });

  it('无效 URL 应抛出错误', () => {
    expect(() => apiGateway.registerWebhook({ url: 'not-a-url' })).toThrow();
    expect(() => apiGateway.registerWebhook({ url: '' })).toThrow();
  });

  it('不支持的事件类型应抛出错误', () => {
    expect(() =>
      apiGateway.registerWebhook({
        url: 'https://example.com/wh',
        events: ['invalid.event'],
      })
    ).toThrow();
  });

  it('应列出所有 Webhook', () => {
    apiGateway.registerWebhook({ url: 'https://a.com/wh', events: ['poster.generated'] });
    apiGateway.registerWebhook({ url: 'https://b.com/wh', events: ['batch.completed'] });
    const list = apiGateway.listWebhooks();
    expect(list).toHaveLength(2);
  });

  it('应删除 Webhook', () => {
    const wh = apiGateway.registerWebhook({ url: 'https://c.com/wh', events: ['poster.generated'] });
    expect(apiGateway.deleteWebhook(wh.id)).toBe(true);
    expect(apiGateway.listWebhooks()).toHaveLength(0);
  });

  it('删除不存在的 Webhook 应返回 false', () => {
    expect(apiGateway.deleteWebhook('nonexistent')).toBe(false);
  });
});
