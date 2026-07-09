/**
 * 造境 ZaoJing — 智能存储工具
 * 小数据（< 100KB）使用 localStorage（快速同步读取），
 * 大图/大对象使用 IndexedDB（避免 5MB QuotaExceededError）。
 * 在 IndexedDB 不可用（如隐私模式）时降级到 localStorage。
 */

const DB_NAME = 'zaojing-storage';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

/**
 * 打开 IndexedDB 连接；若不可用则返回 null（降级到 localStorage）
 */
function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        // IndexedDB 不可用（如隐私模式）
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * 将值存入 IndexedDB；若 db 为 null 则静默失败（返回 false）
 */
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

/**
 * 从 IndexedDB 读取值；若 db 为 null 或 key 不存在则返回 null
 */
export async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result ?? null) as T | null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/**
 * 从 IndexedDB 删除键；若 db 为 null 则静默失败
 */
export async function idbDelete(key: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * 智能存储：
 * - 小数据（序列化后 < 100KB）优先使用 localStorage（快速）
 * - 大数据或 localStorage 写入失败（QuotaExceededError）时降级到 IndexedDB
 * - 若 IndexedDB 也不可用，最后再尝试 localStorage（尽力而为）
 */
export async function smartSet(key: string, value: unknown): Promise<void> {
  const isString = typeof value === 'string';
  const str = isString ? value : JSON.stringify(value);

  // 小数据直接用 localStorage
  if (str.length < 100 * 1024) {
    try {
      localStorage.setItem(key, isString ? value : JSON.stringify(value));
      // 写入 localStorage 成功后，清理可能存在的 IndexedDB 旧值（避免数据不一致）
      idbDelete(key).catch(() => {});
      return;
    } catch {
      // localStorage 失败（QuotaExceeded），继续降级到 IndexedDB
    }
  }

  // 大数据或 localStorage 失败 → 尝试 IndexedDB
  const ok = await idbSet(key, value);
  if (ok) {
    // IndexedDB 写入成功后，从 localStorage 删除旧值（避免占用空间）
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }

  // IndexedDB 也不可用 → 最后再试一次 localStorage（尽力而为）
  try {
    localStorage.setItem(key, isString ? value : JSON.stringify(value));
  } catch {
    // 完全无法存储，静默失败
  }
}

/**
 * 智能读取：
 * - 先查 localStorage（快速路径，兼容旧数据）
 * - 未命中再查 IndexedDB
 */
export async function smartGet<T = unknown>(
  key: string,
): Promise<T | string | null> {
  // 先查 localStorage
  const lsVal = localStorage.getItem(key);
  if (lsVal !== null) {
    // 如果看起来是 JSON（以 { 或 [ 开头），尝试解析
    if (lsVal.startsWith('{') || lsVal.startsWith('[')) {
      try {
        return JSON.parse(lsVal) as T;
      } catch {
        // fallthrough → 返回原始字符串
      }
    }
    return lsVal;
  }
  // 再查 IndexedDB
  return idbGet<T>(key);
}

/**
 * 智能删除：同时清除 localStorage 和 IndexedDB 中的键
 */
export async function smartDelete(key: string): Promise<void> {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  await idbDelete(key);
}
