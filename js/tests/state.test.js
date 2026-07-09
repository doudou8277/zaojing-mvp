/**
 * 造境 ZaoJing 状态管理模块单元测试
 * 测试 js/state.ts 中的 createStore 函数
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStore } from '../state.ts';

describe('createStore', () => {
  // ========== 初始化 ==========

  it('应正确初始化状态', () => {
    const state = createStore({ count: 0, name: 'test' });
    expect(state.count).toBe(0);
    expect(state.name).toBe('test');
  });

  it('应正确初始化包含多个字段的状态', () => {
    const state = createStore({
      inputText: '',
      count: 10,
      items: ['a', 'b'],
      nested: { value: 1 },
    });
    expect(state.inputText).toBe('');
    expect(state.count).toBe(10);
    expect(state.items).toEqual(['a', 'b']);
    expect(state.nested).toEqual({ value: 1 });
  });

  // ========== setState ==========

  it('setState 应更新状态', () => {
    const state = createStore({ count: 0, name: 'test' });
    state.setState({ count: 5 });
    expect(state.count).toBe(5);
    expect(state.name).toBe('test');
  });

  it('setState 应批量更新多个字段', () => {
    const state = createStore({ count: 0, name: 'test', active: false });
    state.setState({ count: 10, name: 'updated', active: true });
    expect(state.count).toBe(10);
    expect(state.name).toBe('updated');
    expect(state.active).toBe(true);
  });

  it('setState 应只更新指定字段，不影响其他字段', () => {
    const state = createStore({ a: 1, b: 2, c: 3 });
    state.setState({ b: 20 });
    expect(state.a).toBe(1);
    expect(state.b).toBe(20);
    expect(state.c).toBe(3);
  });

  // ========== subscribe ==========

  it('subscribe 应在字段变化时触发回调', () => {
    const state = createStore({ count: 0 });
    const callback = vi.fn();
    state.subscribe('count', callback);

    state.count = 5;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(5, 0, 'count');
  });

  it('subscribe 应在字段多次变化时多次触发回调', () => {
    const state = createStore({ count: 0 });
    const callback = vi.fn();
    state.subscribe('count', callback);

    state.count = 1;
    state.count = 2;
    state.count = 3;
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('subscribe 不应在值未变化时触发回调', () => {
    const state = createStore({ count: 0 });
    const callback = vi.fn();
    state.subscribe('count', callback);

    state.count = 0; // 同值
    expect(callback).not.toHaveBeenCalled();
  });

  it('subscribe 应只监听指定字段，不监听其他字段', () => {
    const state = createStore({ count: 0, name: 'test' });
    const callback = vi.fn();
    state.subscribe('count', callback);

    state.name = 'updated';
    expect(callback).not.toHaveBeenCalled();
  });

  it('subscribe 应返回取消订阅函数', () => {
    const state = createStore({ count: 0 });
    const callback = vi.fn();
    const unsubscribe = state.subscribe('count', callback);

    expect(typeof unsubscribe).toBe('function');

    state.count = 1;
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();

    state.count = 2;
    expect(callback).toHaveBeenCalledTimes(1); // 取消后不再触发
  });

  // ========== subscribeAll ==========

  it('subscribeAll 应在任意字段变化时触发', () => {
    const state = createStore({ count: 0, name: 'test' });
    const callback = vi.fn();
    state.subscribeAll(callback);

    state.count = 5;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('count', 5, 0);

    state.name = 'updated';
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith('name', 'updated', 'test');
  });

  it('subscribeAll 应返回取消订阅函数', () => {
    const state = createStore({ count: 0 });
    const callback = vi.fn();
    const unsubscribe = state.subscribeAll(callback);

    expect(typeof unsubscribe).toBe('function');

    state.count = 1;
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();

    state.count = 2;
    expect(callback).toHaveBeenCalledTimes(1);
  });

  // ========== reset ==========

  it('reset 应恢复初始状态', () => {
    const state = createStore({ count: 0, name: 'initial' });

    state.setState({ count: 100, name: 'changed' });
    expect(state.count).toBe(100);
    expect(state.name).toBe('changed');

    state.reset();
    expect(state.count).toBe(0);
    expect(state.name).toBe('initial');
  });

  it('reset 应恢复包含复杂对象的初始状态', () => {
    const initial = { items: ['a', 'b'], count: 0 };
    const state = createStore(initial);

    state.setState({ items: ['x', 'y', 'z'], count: 99 });
    state.reset();

    expect(state.items).toEqual(['a', 'b']);
    expect(state.count).toBe(0);
  });

  // ========== getSnapshot ==========

  it('getSnapshot 应返回当前状态快照', () => {
    const state = createStore({ count: 0, name: 'test' });
    const snapshot = state.getSnapshot();

    expect(snapshot).toEqual({ count: 0, name: 'test' });
  });

  it('getSnapshot 应返回更新后的状态快照', () => {
    const state = createStore({ count: 0, name: 'test' });
    state.setState({ count: 42 });

    const snapshot = state.getSnapshot();
    expect(snapshot).toEqual({ count: 42, name: 'test' });
  });

  it('getSnapshot 返回的快照应是深拷贝，修改不影响原状态', () => {
    const state = createStore({ items: ['a', 'b'] });
    const snapshot = state.getSnapshot();

    snapshot.items.push('c');
    // 原状态不应被影响
    expect(state.items).toEqual(['a', 'b']);
  });

  // ========== 数组变异方法触发订阅（P1-1 核心验收） ==========

  it('数组 push 应触发订阅回调', () => {
    const state = createStore({ items: ['a', 'b'] });
    const callback = vi.fn();
    state.subscribe('items', callback);

    state.items.push('c');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(state.items).toEqual(['a', 'b', 'c']);
  });

  it('数组 splice 应触发订阅回调', () => {
    const state = createStore({ items: ['a', 'b', 'c'] });
    const callback = vi.fn();
    state.subscribe('items', callback);

    state.items.splice(0, 1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(state.items).toEqual(['b', 'c']);
  });

  it('数组 pop 应触发订阅回调', () => {
    const state = createStore({ items: ['a', 'b'] });
    const callback = vi.fn();
    state.subscribe('items', callback);

    state.items.pop();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(state.items).toEqual(['a']);
  });

  it('数组 shift 应触发订阅回调', () => {
    const state = createStore({ items: ['a', 'b'] });
    const callback = vi.fn();
    state.subscribe('items', callback);

    state.items.shift();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(state.items).toEqual(['b']);
  });

  it('数组 unshift 应触发订阅回调', () => {
    const state = createStore({ items: ['b'] });
    const callback = vi.fn();
    state.subscribe('items', callback);

    state.items.unshift('a');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(state.items).toEqual(['a', 'b']);
  });

  it('数组 sort 应触发订阅回调', () => {
    const state = createStore({ items: [3, 1, 2] });
    const callback = vi.fn();
    state.subscribe('items', callback);

    state.items.sort();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(state.items).toEqual([1, 2, 3]);
  });

  it('数组 fill 应触发订阅回调', () => {
    const state = createStore({ items: [0, 0, 0] });
    const callback = vi.fn();
    state.subscribe('items', callback);

    state.items.fill(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(state.items).toEqual([1, 1, 1]);
  });

  it('数组变异应触发全局订阅回调', () => {
    const state = createStore({ items: ['a'] });
    const callback = vi.fn();
    state.subscribeAll(callback);

    state.items.push('b');
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('items', expect.any(Array), expect.any(Array));
  });

  it('不可变写法 [...arr, item] 应兼容触发订阅', () => {
    const state = createStore({ items: ['a'] });
    const callback = vi.fn();
    state.subscribe('items', callback);

    state.items = [...state.items, 'b'];
    expect(callback).toHaveBeenCalledTimes(1);
    expect(state.items).toEqual(['a', 'b']);
  });

  it('数组变异后 getSnapshot 应返回新快照', () => {
    const state = createStore({ items: ['a'] });

    state.items.push('b');
    const snapshot = state.getSnapshot();
    expect(snapshot.items).toEqual(['a', 'b']);
  });

  // ========== 对象浅比较（P1-1 配套） ==========

  it('对象浅比较应判定变化并触发订阅', () => {
    const state = createStore({ config: { x: 1, y: 2 } });
    const callback = vi.fn();
    state.subscribe('config', callback);

    state.config = { ...state.config, x: 10 };
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('对象浅比较应判定未变化时不触发订阅', () => {
    const state = createStore({ config: { x: 1 } });
    const callback = vi.fn();
    state.subscribe('config', callback);

    state.config = { x: 1 }; // 相同内容
    expect(callback).not.toHaveBeenCalled();
  });
});
