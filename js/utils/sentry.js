/**
 * 造境 ZaoJing 轻量错误追踪模块
 * 不依赖 Sentry SDK，通过 fetch 上报到后端 /api/errors 端点
 * 生产环境自动启用，开发环境仅 console
 */

import { logger } from './logger.js';

const isProduction = import.meta.env?.PROD || false;
const ERROR_QUEUE = [];
const MAX_QUEUE = 20;
const FLUSH_INTERVAL = 30000; // 30秒批量上报

// 页面加载时间，用于计算错误发生时序
const PAGE_LOAD_TIME = Date.now();

/**
 * 采集错误上下文
 */
function captureContext() {
  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
    timeSinceLoad: Date.now() - PAGE_LOAD_TIME,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    sessionId: sessionStorage.getItem('zaojing_sid') || (() => {
      const sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('zaojing_sid', sid);
      return sid;
    })()
  };
}

/**
 * 上报错误到后端
 */
function reportError(errorData) {
  if (!isProduction) {
    logger.error('[Sentry-proxy]', errorData.message);
    return;
  }

  ERROR_QUEUE.push(errorData);
  if (ERROR_QUEUE.length >= MAX_QUEUE) {
    flushErrors();
  }
}

/**
 * 批量上报错误队列
 */
let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    await flushErrors();
  }, FLUSH_INTERVAL);
}

async function flushErrors() {
  if (ERROR_QUEUE.length === 0) return;
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const batch = ERROR_QUEUE.splice(0, ERROR_QUEUE.length);
  try {
    await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors: batch })
    });
  } catch (e) {
    // 上报失败，静默丢弃（避免无限循环）
    logger.warn('[Sentry-proxy] 错误上报失败:', e.message);
  }
}

/**
 * 捕获异常
 */
export function captureException(error, extra = {}) {
  const errorData = {
    type: 'exception',
    message: error.message || String(error),
    stack: error.stack,
    ...captureContext(),
    extra
  };
  reportError(errorData);
  scheduleFlush();
}

/**
 * 捕获消息
 */
export function captureMessage(message, level = 'info', extra = {}) {
  const errorData = {
    type: 'message',
    level,
    message,
    ...captureContext(),
    extra
  };
  reportError(errorData);
  scheduleFlush();
}

/**
 * 初始化全局错误捕获
 */
export function initErrorTracking() {
  // 捕获未处理的异常
  window.addEventListener('error', (event) => {
    captureException(event.error || new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  // 捕获未处理的 Promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    captureException(error, { source: 'unhandledrejection' });
  });

  // 页面卸载前同步上报错误队列
  window.addEventListener('beforeunload', () => {
    if (ERROR_QUEUE.length === 0) return;
    const batch = ERROR_QUEUE.splice(0, ERROR_QUEUE.length);
    // 使用 sendBeacon 同步发送，确保页面关闭前完成
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({ errors: batch })], { type: 'application/json' });
      navigator.sendBeacon('/api/errors', blob);
    }
  });

  logger.info('[Sentry-proxy] 错误追踪已初始化');
}

export { flushErrors };
