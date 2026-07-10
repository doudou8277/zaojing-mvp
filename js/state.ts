/**
 * 造境 ZaoJing 轻量状态管理模块（TypeScript 版）
 * 基于 Proxy 实现响应式追踪，保持向后兼容
 *
 * 用法：
 *   const state = createStore({ count: 0 });
 *   state.count = 1;                    // 直接赋值（向后兼容）
 *   state.items.push(item);             // 数组变异方法自动触发订阅
 *   state.subscribe('count', (newVal) => { ... });  // 订阅特定字段
 *   state.setState({ count: 2, name: 'test' });     // 批量更新
 *   state.reset();                      // 重置为初始值
 */

import { logger } from './utils/logger.js';

type Subscriber<T> = (newValue: T, oldValue: T, field: string) => void;
type GlobalSubscriber = (field: string, newValue: unknown, oldValue: unknown) => void;

interface StoreMethods<T> {
  subscribe: <K extends keyof T>(field: K, callback: Subscriber<T[K]>) => () => void;
  subscribeAll: (callback: GlobalSubscriber) => () => void;
  setState: (updates: Partial<T>) => void;
  reset: () => void;
  getSnapshot: () => T;
}

type Store<T> = T & StoreMethods<T>;

/**
 * 浅相等判断，处理对象/数组
 * 引用相等直接返回 true；否则逐键比较
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}

/** 需要拦截的数组变异方法 */
const ARRAY_MUTATORS = new Set(['push', 'pop', 'splice', 'shift', 'unshift', 'sort', 'reverse', 'fill', 'copyWithin']);

/** 追踪已包装的数组 Proxy，避免重复包装 */
const wrappedArrays = new WeakSet<unknown[]>();

/**
 * 包装数组的变异方法，调用后自动触发通知
 * 解决 Proxy set 陷阱的 !== 引用比较对原地修改无效的问题
 */
function wrapArrayMutators(arr: unknown[], notify: () => void): unknown[] {
  const proxy = new Proxy(arr, {
    get(target: unknown[], prop: string): unknown {
      const val = target[prop as keyof unknown[]];
      if (ARRAY_MUTATORS.has(prop)) {
        return (...args: unknown[]): unknown => {
          const result = (val as (...a: unknown[]) => unknown).apply(target, args);
          notify();
          return result;
        };
      }
      return val;
    },
  });
  wrappedArrays.add(proxy);
  return proxy;
}

/**
 * 深拷贝辅助函数
 * 优先使用 structuredClone（支持 Date/Map/Set），降级到 JSON 序列化
 */
function deepClone<T>(value: T): T {
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(value);
    } catch (e) {
      // structuredClone 不支持函数、Symbol、Error 等，降级到 JSON 序列化
      logger.debug('[state] structuredClone 失败，降级到 JSON 序列化:', e instanceof Error ? e.message : String(e));
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function createStore<T extends Record<string, unknown>>(initialState: T): Store<T> {
  const subscribers: Record<string, Set<Subscriber<unknown>>> = {};
  const globalSubscribers = new Set<GlobalSubscriber>();
  const initialSnapshot = deepClone(initialState);

  /** 通知指定字段的订阅者 + 全局订阅者 */
  function notify(key: string, newValue: unknown, oldValue: unknown): void {
    if (subscribers[key]) {
      subscribers[key].forEach((cb) => {
        try {
          cb(newValue, oldValue, key);
        } catch (e) {
          logger.error('[State] 订阅回调错误:', e);
        }
      });
    }
    globalSubscribers.forEach((cb) => {
      try {
        cb(key, newValue, oldValue);
      } catch (e) {
        logger.error('[State] 全局订阅回调错误:', e);
      }
    });
  }

  const proxy = new Proxy(
    { ...initialState },
    {
      set(target: Record<string, unknown>, key: string, value: unknown): boolean {
        const oldValue = target[key];

        // 数组值包装变异方法，使 push/splice 等能触发订阅
        let processedValue = value;
        if (Array.isArray(value) && !wrappedArrays.has(value as unknown[])) {
          processedValue = wrapArrayMutators(value as unknown[], () => {
            notify(key, target[key], oldValue);
          });
        }

        target[key] = processedValue;

        // 浅比较判定是否变化（替代 !== 引用比较）
        if (!shallowEqual(oldValue, processedValue)) {
          notify(key, processedValue, oldValue);
        }
        return true;
      },

      get(target: Record<string, unknown>, key: string): unknown {
        // 提供方法
        if (key === 'subscribe') {
          return (field: string, callback: Subscriber<unknown>): (() => void) => {
            if (!subscribers[field]) subscribers[field] = new Set();
            subscribers[field].add(callback);
            return () => subscribers[field].delete(callback);
          };
        }
        if (key === 'subscribeAll') {
          return (callback: GlobalSubscriber): (() => void) => {
            globalSubscribers.add(callback);
            return () => globalSubscribers.delete(callback);
          };
        }
        if (key === 'setState') {
          return (updates: Partial<T>): void => {
            Object.keys(updates).forEach((k) => {
              (proxy as Record<string, unknown>)[k] = (updates as Record<string, unknown>)[k];
            });
          };
        }
        if (key === 'reset') {
          return (): void => {
            Object.keys(initialSnapshot).forEach((k) => {
              (proxy as Record<string, unknown>)[k] = (initialSnapshot as Record<string, unknown>)[k];
            });
          };
        }
        if (key === 'getSnapshot') {
          return (): T => deepClone(proxy) as T;
        }
        return target[key];
      },
    }
  );

  // 初始化时对所有数组字段包装变异方法
  Object.keys(initialState).forEach((k) => {
    const val = (initialState as Record<string, unknown>)[k];
    if (Array.isArray(val)) {
      (proxy as Record<string, unknown>)[k] = val; // 触发 set 陷阱，自动包装
    }
  });

  return proxy as Store<T>;
}

export { createStore };
