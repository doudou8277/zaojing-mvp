/**
 * 造境 ZaoJing 轻量日志工具单元测试
 * 测试 js/utils/logger.ts 中的 logger 对象
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../utils/logger.ts';

// 各 console 方法的 spy
let debugSpy;
let infoSpy;
let warnSpy;
let errorSpy;

beforeEach(() => {
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  debugSpy.mockRestore();
  infoSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

// ========== logger 接口 ==========
describe('logger 接口', () => {
  it('应包含 debug 方法', () => {
    expect(logger).toHaveProperty('debug');
    expect(typeof logger.debug).toBe('function');
  });

  it('应包含 info 方法', () => {
    expect(logger).toHaveProperty('info');
    expect(typeof logger.info).toBe('function');
  });

  it('应包含 warn 方法', () => {
    expect(logger).toHaveProperty('warn');
    expect(typeof logger.warn).toBe('function');
  });

  it('应包含 error 方法', () => {
    expect(logger).toHaveProperty('error');
    expect(typeof logger.error).toBe('function');
  });
});

// ========== 前缀 ==========
describe('日志前缀', () => {
  it('前缀应为 [ZaoJing]', () => {
    logger.debug('测试消息');
    expect(debugSpy).toHaveBeenCalledWith('[ZaoJing]', '测试消息');
  });
});

// ========== debug ==========
describe('logger.debug', () => {
  it('应调用 console.debug', () => {
    logger.debug('调试信息');
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  it('应以 [ZaoJing] 前缀调用 console.debug', () => {
    logger.debug('调试信息');
    expect(debugSpy).toHaveBeenCalledWith('[ZaoJing]', '调试信息');
  });

  it('应支持多个参数', () => {
    logger.debug('消息', 1, { key: 'value' });
    expect(debugSpy).toHaveBeenCalledWith('[ZaoJing]', '消息', 1, {
      key: 'value',
    });
  });

  it('无参数时应仅传入前缀', () => {
    logger.debug();
    expect(debugSpy).toHaveBeenCalledWith('[ZaoJing]');
  });
});

// ========== info ==========
describe('logger.info', () => {
  it('应调用 console.info', () => {
    logger.info('普通信息');
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it('应以 [ZaoJing] 前缀调用 console.info', () => {
    logger.info('普通信息');
    expect(infoSpy).toHaveBeenCalledWith('[ZaoJing]', '普通信息');
  });

  it('应支持多个参数', () => {
    logger.info('初始化', '完成', 100);
    expect(infoSpy).toHaveBeenCalledWith('[ZaoJing]', '初始化', '完成', 100);
  });
});

// ========== warn ==========
describe('logger.warn', () => {
  it('应调用 console.warn', () => {
    logger.warn('警告信息');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('应以 [ZaoJing] 前缀调用 console.warn', () => {
    logger.warn('警告信息');
    expect(warnSpy).toHaveBeenCalledWith('[ZaoJing]', '警告信息');
  });

  it('应支持多个参数', () => {
    logger.warn('配置缺失', { field: 'timeout' });
    expect(warnSpy).toHaveBeenCalledWith('[ZaoJing]', '配置缺失', {
      field: 'timeout',
    });
  });
});

// ========== error ==========
describe('logger.error', () => {
  it('应调用 console.error', () => {
    logger.error('错误信息');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('应以 [ZaoJing] 前缀调用 console.error', () => {
    logger.error('错误信息');
    expect(errorSpy).toHaveBeenCalledWith('[ZaoJing]', '错误信息');
  });

  it('应支持多个参数（如错误对象）', () => {
    const err = new Error('测试错误');
    logger.error('[Module] 出错了:', err.message);
    expect(errorSpy).toHaveBeenCalledWith(
      '[ZaoJing]',
      '[Module] 出错了:',
      err.message
    );
  });
});

// ========== 各方法对应正确的 console 方法 ==========
describe('方法与 console 方法对应关系', () => {
  it('debug 只调用 console.debug，不调用其他', () => {
    logger.debug('msg');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('info 只调用 console.info，不调用其他', () => {
    logger.info('msg');
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('warn 只调用 console.warn，不调用其他', () => {
    logger.warn('msg');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('error 只调用 console.error，不调用其他', () => {
    logger.error('msg');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
