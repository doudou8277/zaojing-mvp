/**
 * 造境 ZaoJing 前端错误边界
 * 包装异步操作，捕获错误后降级处理而非崩溃整个应用
 */

import { logger } from './logger.js';

/**
 * 安全执行选项
 * @template T - 返回值类型
 */
export interface SafeAsyncOptions<T> {
  /** 模块名称（用于日志） */
  module?: string;
  /** 降级值或降级回调函数 */
  fallback?: T | ((error: Error) => T);
}

/**
 * 模块错误边界接口
 * 所有调用都自动 try-catch，捕获错误后降级处理
 */
export interface ModuleBoundary {
  run<T>(fn: () => Promise<T>, fallback?: T | ((error: Error) => T)): Promise<T>;
  runSync<T>(fn: () => T, fallback?: T | ((error: Error) => T)): T;
}

/**
 * 安全提取错误消息，兼容 Error 实例、字符串、普通对象
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; error?: unknown; msg?: unknown };
    if (typeof e.message === 'string') return e.message;
    if (typeof e.msg === 'string') return e.msg;
    if (e.error instanceof Error) return e.error.message;
    try { return JSON.stringify(error).slice(0, 200); } catch { return String(error); }
  }
  return String(error ?? '未知错误');
}

/**
 * 安全执行异步函数，捕获错误后执行降级回调
 * @param fn - 要执行的异步函数
 * @param options - 选项
 * @returns 函数结果或降级值
 */
export async function safeAsync<T>(fn: () => Promise<T>, options?: SafeAsyncOptions<T>): Promise<T> {
  const { module = 'unknown', fallback } = options ?? {};
  try {
    return await fn();
  } catch (error) {
    logger.error(`[${module}] 模块错误:`, getErrorMessage(error));
    if (typeof fallback === 'function') return (fallback as (error: Error) => T)(error as Error);
    return (fallback ?? null) as T;
  }
}

/**
 * 安全执行同步函数，捕获错误后执行降级回调
 * @param fn - 要执行的同步函数
 * @param options - 选项
 * @returns 函数结果或降级值
 */
export function safeSync<T>(fn: () => T, options?: SafeAsyncOptions<T>): T {
  const { module = 'unknown', fallback } = options ?? {};
  try {
    return fn();
  } catch (error) {
    logger.error(`[${module}] 模块错误:`, getErrorMessage(error));
    if (typeof fallback === 'function') return (fallback as (error: Error) => T)(error as Error);
    return (fallback ?? null) as T;
  }
}

/**
 * 创建模块错误边界
 * 返回一个包装器，所有调用都自动 try-catch
 * @param moduleName - 模块名称
 */
export function createModuleBoundary(moduleName: string): ModuleBoundary {
  return {
    async run<T>(fn: () => Promise<T>, fallback?: T | ((error: Error) => T)): Promise<T> {
      return safeAsync(fn, { module: moduleName, fallback });
    },
    runSync<T>(fn: () => T, fallback?: T | ((error: Error) => T)): T {
      return safeSync(fn, { module: moduleName, fallback });
    }
  };
}
