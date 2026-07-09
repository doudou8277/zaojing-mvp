/**
 * 造境 ZaoJing 轻量日志工具
 * 统一日志接口，便于后续扩展（如日志级别过滤、远程上报等）
 *
 * 用法：
 *   import { logger } from './logger.js';
 *   logger.error('[Module] 出错了:', err.message);
 *   logger.info('初始化完成');
 */

const PREFIX = '[ZaoJing]';

/**
 * 日志接口
 * 提供统一的日志级别方法，便于后续扩展（如日志级别过滤、远程上报等）
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const logger: Logger = {
  debug(...args: unknown[]) {
    console.debug(PREFIX, ...args);
  },
  info(...args: unknown[]) {
    console.info(PREFIX, ...args);
  },
  warn(...args: unknown[]) {
    console.warn(PREFIX, ...args);
  },
  error(...args: unknown[]) {
    console.error(PREFIX, ...args);
  },
};

export { logger };
