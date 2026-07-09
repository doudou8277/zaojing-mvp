/**
 * 造境 ZaoJing Prometheus 指标模块
 * 暴露 HTTP 请求、AI 调用、缓存等指标供 Prometheus 抓取
 */

const promClient = require('prom-client');

// 创建 Registry
const register = new promClient.Registry();

// 默认指标（Node.js 进程信息）
promClient.collectDefaultMetrics({
  register,
  prefix: 'zaojing_',
  labels: { app: 'zaojing-server' }
});

// ========== 自定义指标 ==========

// HTTP 请求计数
const httpRequestCounter = new promClient.Counter({
  name: 'zaojing_http_requests_total',
  help: 'HTTP 请求总数',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

// HTTP 请求延迟
const httpRequestDuration = new promClient.Histogram({
  name: 'zaojing_http_request_duration_seconds',
  help: 'HTTP 请求延迟（秒）',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// AI 调用计数
const aiCallCounter = new promClient.Counter({
  name: 'zaojing_ai_calls_total',
  help: 'AI API 调用总数',
  labelNames: ['service', 'model', 'status'],
  registers: [register]
});

// AI 调用延迟
const aiCallDuration = new promClient.Histogram({
  name: 'zaojing_ai_call_duration_seconds',
  help: 'AI API 调用延迟（秒）',
  labelNames: ['service', 'model'],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [register]
});

// 缓存命中/未命中
const cacheCounter = new promClient.Counter({
  name: 'zaojing_cache_operations_total',
  help: '缓存操作总数',
  labelNames: ['type', 'result'],
  registers: [register]
});

// 当前活跃连接数
const activeConnections = new promClient.Gauge({
  name: 'zaojing_active_connections',
  help: '当前活跃连接数',
  registers: [register]
});

// 图片生成计数
const imageGeneratedCounter = new promClient.Counter({
  name: 'zaojing_images_generated_total',
  help: '图片生成总数',
  labelNames: ['engine', 'director'],
  registers: [register]
});

module.exports = {
  register,
  httpRequestCounter,
  httpRequestDuration,
  aiCallCounter,
  aiCallDuration,
  cacheCounter,
  activeConnections,
  imageGeneratedCounter
};
