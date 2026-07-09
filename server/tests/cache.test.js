/**
 * cache.js LRU 缓存单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
const { LRUCache } = require('../cache');

describe('LRUCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LRUCache(3, 0); // 3 条目，永不过期
  });

  it('应存储和读取值', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('未命中的 key 应返回 undefined', () => {
    expect(cache.get('nonexistent')).toBeUndefined();
  });

  it('超过 maxSize 时应淘汰最久未使用的条目', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // 'a' 应被淘汰

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('LRU 应将最近访问的条目移到末尾', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    cache.get('a'); // 访问 'a'，使其成为最近使用

    cache.set('d', 4); // 'b' 应被淘汰（最久未使用）

    expect(cache.get('a')).toBe(1); // 'a' 仍在
    expect(cache.get('b')).toBeUndefined(); // 'b' 被淘汰
  });

  it('应支持 TTL 过期', (done) => {
    const shortCache = new LRUCache(10, 100); // 100ms 过期
    shortCache.set('key', 'value');
    expect(shortCache.get('key')).toBe('value');

    setTimeout(() => {
      expect(shortCache.get('key')).toBeUndefined();
      done();
    }, 150);
  });

  it('应支持自定义 TTL 覆盖默认值', (done) => {
    const cache = new LRUCache(10, 0); // 默认永不过期
    cache.set('key', 'value', 100); // 但这条 100ms 过期

    expect(cache.get('key')).toBe('value');
    setTimeout(() => {
      expect(cache.get('key')).toBeUndefined();
      done();
    }, 150);
  });

  it('buildKey 应正确拼接多个参数', () => {
    const key = cache.buildKey('text', 'miyazaki', { emotion: 'happy' });
    expect(key).toContain('text');
    expect(key).toContain('miyazaki');
    expect(key).toContain('happy');
  });

  it('buildKey 应处理对象参数', () => {
    const key = cache.buildKey({ a: 1, b: 2 });
    expect(key).toContain('a');
    expect(key).toContain('1');
  });

  it('clear 应清空所有缓存', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('getStats 应返回正确的统计信息', () => {
    cache.set('a', 1);
    cache.get('a'); // hit
    cache.get('b'); // miss

    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe('50.0%');
  });

  it('更新已存在的 key 应覆盖旧值', () => {
    cache.set('key', 'old');
    cache.set('key', 'new');
    expect(cache.get('key')).toBe('new');
  });
});
