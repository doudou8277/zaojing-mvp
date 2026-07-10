/**
 * 造境 ZaoJing AI 成本监控模块
 * 追踪 Token 用量和估算费用，支持数据持久化
 */

const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./utils/atomic-write');

// 数据持久化文件路径
const STATS_FILE = path.join(__dirname, 'data', 'cost-stats.json');

// 确保数据目录存在
const STATS_DIR = path.dirname(STATS_FILE);
if (!fs.existsSync(STATS_DIR)) {
  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
  } catch (e) {
    logger.debug({ err: e.message }, '成本监控数据目录创建失败（可能已存在）');
  }
}

// 各模型的价格（每 1K Token，单位：美元）
const PRICING = {
  'doubao-1.5-pro-32k-250115': { input: 0.0008, output: 0.002 },
  'doubao-1.5-vision-pro-32k-250115': { input: 0.003, output: 0.009 },
  'doubao-seedream-4-0-250828': { perImage: 0.02 },
};

// 成本统计（按天）
const dailyStats = {
  date: new Date().toDateString(),
  totalCost: 0,
  totalTokens: 0,
  calls: 0,
  byModel: {},
};

// 历史记录（最近 30 天）
let history = [];

// 持久化定时器
let _persistTimer = null;
// 标记是否有未写入的脏数据
let _dirty = false;

/**
 * 从文件加载历史数据
 */
function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const raw = fs.readFileSync(STATS_FILE, 'utf8');
      const data = JSON.parse(raw);
      // 恢复当天数据（如果日期匹配）
      if (data.current && data.current.date === dailyStats.date) {
        Object.assign(dailyStats, data.current);
      }
      // 恢复历史记录
      if (Array.isArray(data.history)) {
        history = data.history.slice(-30);
      }
      logger.info({ date: dailyStats.date, calls: dailyStats.calls }, '成本监控数据已恢复');
    }
  } catch (e) {
    logger.warn({ err: e.message }, '成本监控数据加载失败，从零开始统计');
  }
}

/**
 * 实际写入统计数据到文件
 */
function writeStatsToFile() {
  try {
    const data = {
      current: { ...dailyStats },
      history: history.slice(-30),
      updatedAt: new Date().toISOString(),
    };
    writeJsonAtomic(STATS_FILE, data);
  } catch (e) {
    logger.warn({ err: e.message }, '成本监控数据持久化失败');
  }
  _dirty = false;
}

/**
 * 持久化数据到文件（防抖：5 秒内多次调用只写一次）
 */
function persistStats() {
  _dirty = true;
  if (_persistTimer) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    writeStatsToFile();
  }, 5000);
  _persistTimer.unref(); // 不阻止进程退出
}

/**
 * 立即刷新待写入的统计数据（用于优雅关闭）
 */
function flush() {
  if (_persistTimer) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  if (_dirty) {
    writeStatsToFile();
  }
}

/**
 * 跨天重置：保存当天数据到历史，重置计数器
 */
function rolloverDay() {
  // 保存当天统计到历史
  if (dailyStats.calls > 0) {
    history.push({
      date: dailyStats.date,
      totalCost: dailyStats.totalCost,
      totalTokens: dailyStats.totalTokens,
      calls: dailyStats.calls,
      byModel: { ...dailyStats.byModel },
    });
    // 只保留最近 30 天
    if (history.length > 30) history = history.slice(-30);
  }

  // 重置
  const today = new Date().toDateString();
  dailyStats.date = today;
  dailyStats.totalCost = 0;
  dailyStats.totalTokens = 0;
  dailyStats.calls = 0;
  dailyStats.byModel = {};

  logger.info({ history: history.length }, 'AI 成本日报（跨天重置）');
  persistStats();
}

/**
 * 记录 LLM 调用的 Token 用量
 */
function recordLLMCall(model, inputTokens, outputTokens) {
  // 检查日期是否变更
  const today = new Date().toDateString();
  if (dailyStats.date !== today) {
    rolloverDay();
  }

  const pricing = PRICING[model];
  let cost = 0;

  if (pricing) {
    if (pricing.perImage) {
      cost = pricing.perImage;
    } else {
      cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
    }
  }

  const totalTokens = (inputTokens || 0) + (outputTokens || 0);

  dailyStats.totalCost += cost;
  dailyStats.totalTokens += totalTokens;
  dailyStats.calls++;

  if (!dailyStats.byModel[model]) {
    dailyStats.byModel[model] = { calls: 0, tokens: 0, cost: 0 };
  }
  dailyStats.byModel[model].calls++;
  dailyStats.byModel[model].tokens += totalTokens;
  dailyStats.byModel[model].cost += cost;

  logger.info(
    {
      model,
      inputTokens,
      outputTokens,
      cost: cost.toFixed(4),
    },
    'AI 调用成本'
  );

  // 费用告警：单日超过 $10
  if (dailyStats.totalCost > 10) {
    logger.warn(
      {
        totalCost: dailyStats.totalCost.toFixed(2),
        calls: dailyStats.calls,
      },
      '⚠️ AI 单日费用超过 $10'
    );
  }

  // 防抖持久化
  persistStats();
}

/**
 * 记录图片生成调用
 */
function recordImageCall(model) {
  recordLLMCall(model, 0, 0);
}

/**
 * 获取统计摘要（含历史）
 */
function getStatsSummary() {
  return {
    date: dailyStats.date,
    totalCost: '$' + dailyStats.totalCost.toFixed(4),
    totalTokens: dailyStats.totalTokens,
    totalCalls: dailyStats.calls,
    byModel: Object.entries(dailyStats.byModel).map(([model, s]) => ({
      model,
      calls: s.calls,
      tokens: s.tokens,
      cost: '$' + s.cost.toFixed(4),
    })),
    history: history.slice(-7).map((h) => ({
      date: h.date,
      cost: '$' + h.totalCost.toFixed(4),
      calls: h.calls,
    })),
  };
}

// 启动时加载数据
loadStats();

module.exports = {
  recordLLMCall,
  recordImageCall,
  getStatsSummary,
  flush,
  PRICING,
};
