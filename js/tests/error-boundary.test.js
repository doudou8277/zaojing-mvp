/**
 * 造境 ZaoJing 错误边界单元测试
 * 测试 js/utils/error-boundary.ts 中的 safeAsync、safeSync、createModuleBoundary
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeAsync, safeSync, createModuleBoundary } from '../utils/error-boundary.ts';

// 抑制错误边界在捕获错误时输出的 console.error 日志噪音
let errorSpy;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ========== safeAsync ==========
describe('safeAsync', () => {
  it('成功时应返回函数结果', async () => {
    const result = await safeAsync(async () => 42);
    expect(result).toBe(42);
  });

  it('成功时应返回异步计算的结果', async () => {
    const result = await safeAsync(async () => {
      return await Promise.resolve('hello');
    });
    expect(result).toBe('hello');
  });

  it('出错时应返回 fallback 值', async () => {
    const result = await safeAsync(
      async () => {
        throw new Error('失败');
      },
      { fallback: '默认值' }
    );
    expect(result).toBe('默认值');
  });

  it('出错时应调用 fallback 函数并传入错误对象', async () => {
    const fallbackFn = vi.fn((err) => `恢复: ${err.message}`);
    const result = await safeAsync(
      async () => {
        throw new Error('爆炸');
      },
      { fallback: fallbackFn }
    );

    expect(fallbackFn).toHaveBeenCalledTimes(1);
    expect(fallbackFn).toHaveBeenCalledWith(expect.any(Error));
    expect(result).toBe('恢复: 爆炸');
  });

  it('fallback 函数接收的错误对象应包含正确的 message', async () => {
    const fallbackFn = vi.fn();
    await safeAsync(
      async () => {
        throw new Error('特定错误信息');
      },
      { fallback: fallbackFn }
    );

    expect(fallbackFn).toHaveBeenCalledTimes(1);
    const err = fallbackFn.mock.calls[0][0];
    expect(err.message).toBe('特定错误信息');
  });

  it('出错且未提供 fallback 时应返回 null', async () => {
    const result = await safeAsync(async () => {
      throw new Error('无 fallback');
    });
    expect(result).toBeNull();
  });

  it('出错时应使用 module 名称记录日志', async () => {
    await safeAsync(
      async () => {
        throw new Error('日志测试');
      },
      { module: 'TestModule' }
    );

    expect(errorSpy).toHaveBeenCalledWith(
      '[ZaoJing]',
      '[TestModule] 模块错误:',
      '日志测试'
    );
  });

  it('未指定 module 时应使用默认模块名 unknown', async () => {
    await safeAsync(async () => {
      throw new Error('默认模块');
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[ZaoJing]',
      '[unknown] 模块错误:',
      '默认模块'
    );
  });
});

// ========== safeSync ==========
describe('safeSync', () => {
  it('成功时应返回函数结果', () => {
    const result = safeSync(() => 42);
    expect(result).toBe(42);
  });

  it('成功时应返回对象结果', () => {
    const result = safeSync(() => ({ a: 1, b: 2 }));
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('出错时应返回 fallback 值', () => {
    const result = safeSync(
      () => {
        throw new Error('同步失败');
      },
      { fallback: '安全值' }
    );
    expect(result).toBe('安全值');
  });

  it('出错时应调用 fallback 函数并传入错误对象', () => {
    const fallbackFn = vi.fn((err) => `恢复: ${err.message}`);
    const result = safeSync(
      () => {
        throw new Error('同步爆炸');
      },
      { fallback: fallbackFn }
    );

    expect(fallbackFn).toHaveBeenCalledTimes(1);
    expect(fallbackFn).toHaveBeenCalledWith(expect.any(Error));
    expect(result).toBe('恢复: 同步爆炸');
  });

  it('出错且未提供 fallback 时应返回 null', () => {
    const result = safeSync(() => {
      throw new Error('无 fallback');
    });
    expect(result).toBeNull();
  });

  it('出错时应使用 module 名称记录日志', async () => {
    safeSync(
      () => {
        throw new Error('同步日志');
      },
      { module: 'SyncModule' }
    );

    expect(errorSpy).toHaveBeenCalledWith(
      '[ZaoJing]',
      '[SyncModule] 模块错误:',
      '同步日志'
    );
  });
});

// ========== createModuleBoundary ==========
describe('createModuleBoundary', () => {
  it('应返回包含 run 和 runSync 方法的对象', () => {
    const boundary = createModuleBoundary('TestModule');
    expect(boundary).toHaveProperty('run');
    expect(boundary).toHaveProperty('runSync');
    expect(typeof boundary.run).toBe('function');
    expect(typeof boundary.runSync).toBe('function');
  });

  // ----- run 委托 safeAsync -----
  it('run 成功时应返回异步函数结果（委托 safeAsync）', async () => {
    const boundary = createModuleBoundary('TestModule');
    const result = await boundary.run(async () => 'async-result');
    expect(result).toBe('async-result');
  });

  it('run 出错时应返回 fallback 值（委托 safeAsync）', async () => {
    const boundary = createModuleBoundary('TestModule');
    const result = await boundary.run(
      async () => {
        throw new Error('run 失败');
      },
      'fallback-value'
    );
    expect(result).toBe('fallback-value');
  });

  it('run 出错时应使用模块名记录日志（委托 safeAsync）', async () => {
    const boundary = createModuleBoundary('BoundaryModule');
    await boundary.run(async () => {
      throw new Error('委托错误');
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[ZaoJing]',
      '[BoundaryModule] 模块错误:',
      '委托错误'
    );
  });

  it('run 出错时 fallback 函数应接收错误对象（委托 safeAsync）', async () => {
    const boundary = createModuleBoundary('TestModule');
    const fallbackFn = vi.fn((err) => `handled: ${err.message}`);
    const result = await boundary.run(
      async () => {
        throw new Error('delegated');
      },
      fallbackFn
    );

    expect(fallbackFn).toHaveBeenCalledWith(expect.any(Error));
    expect(result).toBe('handled: delegated');
  });

  // ----- runSync 委托 safeSync -----
  it('runSync 成功时应返回同步函数结果（委托 safeSync）', () => {
    const boundary = createModuleBoundary('TestModule');
    const result = boundary.runSync(() => 'sync-result');
    expect(result).toBe('sync-result');
  });

  it('runSync 出错时应返回 fallback 值（委托 safeSync）', () => {
    const boundary = createModuleBoundary('TestModule');
    const result = boundary.runSync(
      () => {
        throw new Error('runSync 失败');
      },
      'sync-fallback'
    );
    expect(result).toBe('sync-fallback');
  });

  it('runSync 出错时应使用模块名记录日志（委托 safeSync）', () => {
    const boundary = createModuleBoundary('SyncBoundary');
    boundary.runSync(() => {
      throw new Error('sync 委托错误');
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[ZaoJing]',
      '[SyncBoundary] 模块错误:',
      'sync 委托错误'
    );
  });

  it('runSync 出错时 fallback 函数应接收错误对象（委托 safeSync）', () => {
    const boundary = createModuleBoundary('TestModule');
    const fallbackFn = vi.fn((err) => `sync-handled: ${err.message}`);
    const result = boundary.runSync(
      () => {
        throw new Error('sync-delegated');
      },
      fallbackFn
    );

    expect(fallbackFn).toHaveBeenCalledWith(expect.any(Error));
    expect(result).toBe('sync-handled: sync-delegated');
  });

  it('不同模块名应独立记录各自的日志', async () => {
    const boundaryA = createModuleBoundary('ModuleA');
    const boundaryB = createModuleBoundary('ModuleB');

    await boundaryA.run(async () => {
      throw new Error('A 错误');
    });
    await boundaryB.run(async () => {
      throw new Error('B 错误');
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[ZaoJing]',
      '[ModuleA] 模块错误:',
      'A 错误'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[ZaoJing]',
      '[ModuleB] 模块错误:',
      'B 错误'
    );
  });
});
