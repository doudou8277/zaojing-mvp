/**
 * 造境 ZaoJing LRU 内存缓存
 * 用于缓存 AI 分析/生图结果，减少重复调用
 * 生产环境可替换为 Redis
 */

const logger = require('./logger');

class LRUCache {
  /**
   * @param {number} maxSize - 最大条目数
   * @param {number} defaultTtlMs - 默认过期时间（毫秒），0 表示永不过期
   * @param {number} maxBytes - 最大内存占用（字节），0 表示不限制
   */
  constructor(maxSize, defaultTtlMs, maxBytes) {
    this.maxSize = maxSize || 100;
    this.defaultTtlMs = defaultTtlMs || 0;
    this.maxBytes = maxBytes || 0; // 0 = 不按字节淘汰
    this.cache = new Map(); // key -> { value, expireAt, bytes }
    this.hits = 0;
    this.misses = 0;
    this.currentBytes = 0;
  }

  /**
   * 估算值的字节大小
   */
  _estimateBytes(value) {
    if (!this.maxBytes) return 0;
    if (typeof value === 'string') {
      // base64 字符串大约 4/3 * 原始大小
      return Buffer.byteLength(value, 'utf8');
    }
    if (value && typeof value === 'object') {
      try {
        return Buffer.byteLength(JSON.stringify(value), 'utf8');
      } catch (e) {
        // 循环引用或不可序列化的值，返回 0
        logger.debug({ err: e.message }, '[cache] 值大小计算失败（可能包含不可序列化数据）');
        return 0;
      }
    }
    return 0;
  }

  /**
   * 生成缓存 Key
   */
  buildKey(...parts) {
    return parts.map(p => {
      if (typeof p === 'object') return JSON.stringify(p);
      return String(p);
    }).join('::');
  }

  /**
   * 获取缓存值
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    // 检查是否过期
    if (entry.expireAt > 0 && Date.now() > entry.expireAt) {
      this.currentBytes -= entry.bytes || 0;
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // LRU：移到末尾（最近使用）
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key, value, ttlMs) {
    const bytes = this._estimateBytes(value);

    // 如果已有旧值，先减去旧值的字节
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      this.currentBytes -= oldEntry.bytes || 0;
      this.cache.delete(key);
    }

    // 如果已满（条目数），删除最旧的条目
    while (this.cache.size >= this.maxSize) {
      this._evictOldest();
    }

    // 如果按字节限制且新条目超限，淘汰旧条目直到有空间
    if (this.maxBytes && bytes > 0) {
      while (this.currentBytes + bytes > this.maxBytes && this.cache.size > 0) {
        this._evictOldest();
      }
    }

    const expireAt = ttlMs !== undefined
      ? (ttlMs > 0 ? Date.now() + ttlMs : 0)
      : (this.defaultTtlMs > 0 ? Date.now() + this.defaultTtlMs : 0);

    this.cache.set(key, { value, expireAt, bytes });
    this.currentBytes += bytes;
  }

  /**
   * 淘汰最旧的条目
   */
  _evictOldest() {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      const entry = this.cache.get(oldestKey);
      this.currentBytes -= (entry && entry.bytes) || 0;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.currentBytes = 0;
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : '0%',
      bytesUsed: this.currentBytes,
      bytesMax: this.maxBytes
    };
  }
}

// 创建不同用途的缓存实例
// 情绪分析缓存：100 条，1 小时过期
const emotionCache = new LRUCache(100, 60 * 60 * 1000);

// 文案生成缓存：100 条，1 小时过期
const copyCache = new LRUCache(100, 60 * 60 * 1000);

// 图片生成缓存：50 条，2 小时过期（图片占内存大，条目少一些）
// 图片缓存：50 条，2 小时 TTL，最大 100MB 内存占用
const imageCache = new LRUCache(50, 2 * 60 * 60 * 1000, 100 * 1024 * 1024);

// 风格解析缓存：50 条，24 小时过期（风格描述变化少）
const styleCache = new LRUCache(50, 24 * 60 * 60 * 1000);

// 定期输出缓存统计（每 10 分钟）
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    const stats = {
      emotion: emotionCache.getStats(),
      copy: copyCache.getStats(),
      image: imageCache.getStats(),
      style: styleCache.getStats()
    };
    logger.debug({ stats }, '缓存统计');
  }, 10 * 60 * 1000).unref();
}

module.exports = {
  LRUCache,
  emotionCache,
  copyCache,
  imageCache,
  styleCache
};
