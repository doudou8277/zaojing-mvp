/**
 * 造境 ZaoJing — 开放 API 网关模块
 * 提供 API Key 管理、分级配额、用量追踪、计费、Webhook 注册与派发
 *
 * 数据模型：
 *  - ApiKey: { key, name, tier, status, createdAt, expiresAt, rateLimitPerMin, monthlyQuota }
 *  - Usage:  { key, date, endpoint, calls, inputTokens, outputTokens, images, cost }
 *  - Webhook: { id, url, events, secret, status, createdAt, lastTriggered, failureCount }
 *
 * 持久化：使用 JSON 文件存储（原子写入 + 内存缓存）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

const DATA_FILE = path.join(__dirname, 'data', 'api-gateway.json');

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ========== API 层级定义 ==========
const API_TIERS = {
  free: {
    id: 'free',
    label: '免费版',
    rateLimitPerMin: 10,
    monthlyQuota: 100,
    pricePerMonth: 0,
    features: ['poster-generate', 'emotion-analysis'],
  },
  pro: {
    id: 'pro',
    label: '专业版',
    rateLimitPerMin: 60,
    monthlyQuota: 5000,
    pricePerMonth: 99,
    features: ['poster-generate', 'emotion-analysis', 'batch-generate', 'custom-font', 'webhook'],
  },
  enterprise: {
    id: 'enterprise',
    label: '企业版',
    rateLimitPerMin: 300,
    monthlyQuota: 50000,
    pricePerMonth: 999,
    features: ['poster-generate', 'emotion-analysis', 'batch-generate', 'custom-font', 'webhook', 'priority-support', 'sla'],
  },
};

// ========== 计费单价 ==========
const PRICING = {
  'poster-generate': { price: 0.5, unit: '次' },
  'image-generate': { price: 0.3, unit: '次' },
  'emotion-analysis': { price: 0.1, unit: '次' },
  'copy-generate': { price: 0.05, unit: '次' },
  'movie-dna': { price: 0.2, unit: '次' },
  'hot-topics': { price: 0.01, unit: '次' },
};

// ========== 内存缓存 ==========
let _cache = null;
let _cacheTimestamp = 0;

function loadData() {
  if (_cache) {
    try {
      const stats = fs.statSync(DATA_FILE);
      if (stats.mtimeMs === _cacheTimestamp) return _cache;
    } catch (e) {
      // 文件可能被删除，继续重新加载
      logger.debug({ err: e.message }, '[api-gateway] statSync 失败，将重新加载文件');
    }
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    _cache = JSON.parse(raw);
    try {
      _cacheTimestamp = fs.statSync(DATA_FILE).mtimeMs;
    } catch (e) {
      // 更新缓存时间戳失败不影响功能
      logger.debug({ err: e.message }, '[api-gateway] 更新缓存时间戳失败');
    }
  } catch (e) {
    _cache = { keys: [], usage: {}, webhooks: [], createdAt: new Date().toISOString() };
  }
  return _cache;
}

// 原子写入
let _writeQueue = Promise.resolve();
function saveData(data) {
  _writeQueue = _writeQueue.then(() => {
    const tmpFile = DATA_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, DATA_FILE);
    _cache = data;
    try {
      _cacheTimestamp = fs.statSync(DATA_FILE).mtimeMs;
    } catch (e) {
      // 更新缓存时间戳失败不影响功能
      logger.debug({ err: e.message }, '[api-gateway] 保存后更新缓存时间戳失败');
    }
  }).catch((e) => {
    logger.error({ err: e.message }, '[api-gateway] 保存数据失败');
  });
  return _writeQueue;
}

// ========== API Key 管理 ==========

/**
 * 生成新的 API Key
 * @param {Object} options
 * @returns {Object} 新建的 ApiKey 对象（含明文 key，仅此一次返回）
 */
function createApiKey({ name, tier = 'free', expiresInDays = null }) {
  const tierConfig = API_TIERS[tier];
  if (!tierConfig) {
    throw new Error(`无效的层级: ${tier}`);
  }

  const key = 'zj_' + crypto.randomBytes(24).toString('hex');
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const now = new Date();
  const expiresAt = expiresInDays
    ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const apiKey = {
    id: 'key_' + crypto.randomBytes(8).toString('hex'),
    keyHash, // 只存储哈希，不存明文
    name: name || '未命名',
    tier,
    status: 'active',
    createdAt: now.toISOString(),
    expiresAt,
    rateLimitPerMin: tierConfig.rateLimitPerMin,
    monthlyQuota: tierConfig.monthlyQuota,
  };

  const data = loadData();
  data.keys.push(apiKey);
  saveData(data);

  // 返回含明文 key 的对象（调用方应妥善保存）
  return { ...apiKey, key };
}

/**
 * 验证 API Key（通过哈希比对）
 * @param {string} key - 明文 API Key
 * @returns {Object|null} 匹配的 ApiKey 对象（不含明文 key）
 */
function validateApiKey(key) {
  if (!key || typeof key !== 'string') return null;
  const keyHash = crypto.createHash('sha256').update(key).digest('hex');
  const data = loadData();
  const apiKey = data.keys.find((k) => k.keyHash === keyHash);
  if (!apiKey) return null;
  if (apiKey.status !== 'active') return null;
  if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) return null;
  return apiKey;
}

/**
 * 列出所有 API Key（不含明文 key）
 * @returns {Array}
 */
function listApiKeys() {
  const data = loadData();
  return data.keys.map(({ keyHash, ...rest }) => rest);
}

/**
 * 更新 API Key 状态
 * @param {string} keyId
 * @param {Object} updates
 * @returns {Object|null}
 */
function updateApiKey(keyId, updates) {
  const data = loadData();
  const key = data.keys.find((k) => k.id === keyId);
  if (!key) return null;

  // 校验 tier 有效性
  if (updates.tier !== undefined && !API_TIERS[updates.tier]) {
    throw new Error(`无效的层级: ${updates.tier}`);
  }

  // 白名单字段
  const allowedFields = ['name', 'tier', 'status', 'rateLimitPerMin', 'monthlyQuota'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      key[field] = updates[field];
    }
  }

  // 切换层级时更新配额
  if (updates.tier && API_TIERS[updates.tier]) {
    key.rateLimitPerMin = API_TIERS[updates.tier].rateLimitPerMin;
    key.monthlyQuota = API_TIERS[updates.tier].monthlyQuota;
  }

  saveData(data);
  const { keyHash, ...rest } = key;
  return rest;
}

/**
 * 删除 API Key
 * @param {string} keyId
 * @returns {boolean}
 */
function deleteApiKey(keyId) {
  const data = loadData();
  const idx = data.keys.findIndex((k) => k.id === keyId);
  if (idx === -1) return false;
  data.keys.splice(idx, 1);
  saveData(data);
  return true;
}

// ========== 用量追踪与计费 ==========

/**
 * 记录一次 API 调用
 * @param {string} keyId - API Key ID
 * @param {string} endpoint - 端点标识
 * @param {Object} metrics - { inputTokens, outputTokens, images }
 */
function recordUsage(keyId, endpoint, metrics = {}) {
  const data = loadData();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  if (!data.usage[keyId]) data.usage[keyId] = {};
  if (!data.usage[keyId][today]) {
    data.usage[keyId][today] = { calls: 0, cost: 0, endpoints: {} };
  }

  const dayUsage = data.usage[keyId][today];
  dayUsage.calls += 1;

  if (!dayUsage.endpoints[endpoint]) {
    dayUsage.endpoints[endpoint] = { calls: 0, cost: 0 };
  }
  dayUsage.endpoints[endpoint].calls += 1;

  // 计算费用
  const pricing = PRICING[endpoint];
  if (pricing) {
    const cost = pricing.price;
    dayUsage.cost += cost;
    dayUsage.endpoints[endpoint].cost += cost;
  }

  // 异步保存（不阻塞请求）
  saveData(data);
}

/**
 * 获取指定 Key 的用量统计
 * @param {string} keyId
 * @param {string} [month] - YYYY-MM 格式，默认当月
 * @returns {Object}
 */
function getUsageStats(keyId, month) {
  const data = loadData();
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const keyUsage = data.usage[keyId] || {};

  let totalCalls = 0;
  let totalCost = 0;
  const dailyBreakdown = {};
  const endpointBreakdown = {};

  for (const [date, usage] of Object.entries(keyUsage)) {
    if (!date.startsWith(targetMonth)) continue;
    totalCalls += usage.calls;
    totalCost += usage.cost;
    dailyBreakdown[date] = { calls: usage.calls, cost: usage.cost };

    for (const [ep, epUsage] of Object.entries(usage.endpoints || {})) {
      if (!endpointBreakdown[ep]) {
        endpointBreakdown[ep] = { calls: 0, cost: 0 };
      }
      endpointBreakdown[ep].calls += epUsage.calls;
      endpointBreakdown[ep].cost += epUsage.cost;
    }
  }

  // 获取配额信息
  const apiKey = data.keys.find((k) => k.id === keyId);
  const monthlyQuota = apiKey ? apiKey.monthlyQuota : 0;

  return {
    keyId,
    month: targetMonth,
    totalCalls,
    totalCost: Math.round(totalCost * 100) / 100,
    monthlyQuota,
    quotaUsed: totalCalls,
    quotaRemaining: Math.max(0, monthlyQuota - totalCalls),
    quotaPercentage: monthlyQuota > 0 ? Math.round((totalCalls / monthlyQuota) * 100) : 0,
    dailyBreakdown,
    endpointBreakdown,
  };
}

/**
 * 获取所有 Key 的汇总用量
 * @param {string} [month]
 * @returns {Object}
 */
function getAllUsageStats(month) {
  const data = loadData();
  const targetMonth = month || new Date().toISOString().slice(0, 7);

  let totalCalls = 0;
  let totalCost = 0;
  const keyBreakdown = {};

  for (const keyId of Object.keys(data.usage)) {
    const stats = getUsageStats(keyId, targetMonth);
    if (stats.totalCalls > 0) {
      totalCalls += stats.totalCalls;
      totalCost += stats.totalCost;
      const apiKey = data.keys.find((k) => k.id === keyId);
      keyBreakdown[keyId] = {
        name: apiKey ? apiKey.name : '已删除',
        tier: apiKey ? apiKey.tier : 'unknown',
        calls: stats.totalCalls,
        cost: stats.totalCost,
      };
    }
  }

  return {
    month: targetMonth,
    totalCalls,
    totalCost: Math.round(totalCost * 100) / 100,
    activeKeys: data.keys.filter((k) => k.status === 'active').length,
    totalKeys: data.keys.length,
    keyBreakdown,
  };
}

// ========== Webhook 管理 ==========

/**
 * 注册 Webhook
 * @param {Object} options
 * @returns {Object}
 */
function registerWebhook({ url, events, name }) {
  if (!url || typeof url !== 'string') {
    throw new Error('Webhook URL 不能为空');
  }
  // URL 格式校验
  try {
    new URL(url);
  } catch (e) {
    throw new Error('Webhook URL 格式无效');
  }

  const validEvents = ['poster.generated', 'batch.completed', 'usage.quota_warning', 'key.expired'];
  const events_ = Array.isArray(events) ? events : [events];
  for (const ev of events_) {
    if (!validEvents.includes(ev)) {
      throw new Error(`不支持的事件类型: ${ev}`);
    }
  }

  const webhook = {
    id: 'wh_' + crypto.randomBytes(8).toString('hex'),
    name: name || '未命名 Webhook',
    url,
    events: events_,
    secret: crypto.randomBytes(16).toString('hex'),
    status: 'active',
    createdAt: new Date().toISOString(),
    lastTriggered: null,
    failureCount: 0,
  };

  const data = loadData();
  data.webhooks.push(webhook);
  saveData(data);

  return webhook;
}

/**
 * 列出所有 Webhook
 * @returns {Array}
 */
function listWebhooks() {
  const data = loadData();
  return data.webhooks;
}

/**
 * 删除 Webhook
 * @param {string} webhookId
 * @returns {boolean}
 */
function deleteWebhook(webhookId) {
  const data = loadData();
  const idx = data.webhooks.findIndex((w) => w.id === webhookId);
  if (idx === -1) return false;
  data.webhooks.splice(idx, 1);
  saveData(data);
  return true;
}

/**
 * 派发 Webhook 事件
 * @param {string} event - 事件类型
 * @param {Object} payload - 事件数据
 */
async function dispatchWebhook(event, payload) {
  const data = loadData();
  const webhooks = data.webhooks.filter((w) => w.status === 'active' && w.events.includes(event));

  for (const webhook of webhooks) {
    try {
      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      });

      // HMAC 签名
      const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ZaoJing-Event': event,
          'X-ZaoJing-Signature': signature,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Webhook 返回 ${response.status}`);
      }

      webhook.lastTriggered = new Date().toISOString();
      webhook.failureCount = 0;
    } catch (e) {
      webhook.failureCount += 1;
      logger.warn({ err: e.message, webhookId: webhook.id }, '[api-gateway] Webhook 派发失败');
      // 连续失败 5 次自动禁用
      if (webhook.failureCount >= 5) {
        webhook.status = 'disabled';
        logger.warn({ webhookId: webhook.id }, '[api-gateway] Webhook 连续失败 5 次，已自动禁用');
      }
    }
  }

  saveData(data);
}

// ========== 配额检查 ==========

/**
 * 检查 API Key 是否超出配额
 * @param {Object} apiKey - validateApiKey 的返回值
 * @returns {{ exceeded: boolean, remaining: number, message?: string }}
 */
function checkQuota(apiKey) {
  if (!apiKey) return { exceeded: true, remaining: 0, message: '无效的 API Key' };

  const stats = getUsageStats(apiKey.id);
  if (stats.quotaRemaining <= 0) {
    return {
      exceeded: true,
      remaining: 0,
      message: `当月配额已用尽 (${stats.totalCalls}/${apiKey.monthlyQuota})`,
    };
  }

  return { exceeded: false, remaining: stats.quotaRemaining };
}

/**
 * 检查功能权限
 * @param {Object} apiKey
 * @param {string} feature
 * @returns {boolean}
 */
function checkFeatureAccess(apiKey, feature) {
  if (!apiKey) return false;
  const tierConfig = API_TIERS[apiKey.tier];
  if (!tierConfig) return false;
  return tierConfig.features.includes(feature);
}

module.exports = {
  API_TIERS,
  PRICING,
  createApiKey,
  validateApiKey,
  listApiKeys,
  updateApiKey,
  deleteApiKey,
  recordUsage,
  getUsageStats,
  getAllUsageStats,
  registerWebhook,
  listWebhooks,
  deleteWebhook,
  dispatchWebhook,
  checkQuota,
  checkFeatureAccess,
};
