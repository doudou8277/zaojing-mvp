/**
 * atomic-write.js 单元测试
 * 验证原子写入（写 tmp + rename）的正确性、覆盖语义与 tmp 文件清理
 */

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
const { writeAtomic, writeAtomicAsync, writeJsonAtomic, writeJsonAtomicAsync } = require('../utils/atomic-write');

// 使用操作系统临时目录，避免污染项目目录
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'zaojing-atomic-test-'));

afterEach(() => {
  // 清理每个测试产生的文件
  for (const f of fs.readdirSync(TMP_DIR)) {
    try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch (_) { /* ignore */ }
  }
});

// ========== writeJsonAtomic（同步）测试 ==========
describe('writeJsonAtomic（同步）', () => {
  it('正常写入后文件应存在且内容可 JSON.parse', () => {
    const target = path.join(TMP_DIR, 'normal.json');
    const data = { hello: 'world', num: 42, arr: [1, 2, 3] };

    writeJsonAtomic(target, data);

    expect(fs.existsSync(target)).toBe(true);
    const raw = fs.readFileSync(target, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(JSON.parse(raw)).toEqual(data);
  });

  it('文件已存在时应被新内容覆盖', () => {
    const target = path.join(TMP_DIR, 'overwrite.json');
    writeJsonAtomic(target, { version: 1 });
    writeJsonAtomic(target, { version: 2, added: true });

    const raw = fs.readFileSync(target, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(2);
    expect(parsed.added).toBe(true);
  });

  it('写入后 .tmp 文件不应残留（rename 成功后已清理）', () => {
    const target = path.join(TMP_DIR, 'notmp.json');
    writeJsonAtomic(target, { ok: true });

    const tmpPath = target + '.tmp';
    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('写入内容应使用 2 空格缩进格式化', () => {
    const target = path.join(TMP_DIR, 'fmt.json');
    writeJsonAtomic(target, { a: 1 });

    const raw = fs.readFileSync(target, 'utf-8');
    expect(raw).toContain('\n  '); // 2 空格缩进
  });

  it('应能写入 null、空对象、空数组等边界 JSON 值', () => {
    const cases = [null, {}, [], 0, '', false];
    for (let i = 0; i < cases.length; i++) {
      const target = path.join(TMP_DIR, `boundary-${i}.json`);
      writeJsonAtomic(target, cases[i]);
      const parsed = JSON.parse(fs.readFileSync(target, 'utf-8'));
      expect(parsed).toEqual(cases[i]);
    }
  });
});

// ========== writeAtomic（同步）测试 ==========
describe('writeAtomic（同步）', () => {
  it('应写入纯字符串内容', () => {
    const target = path.join(TMP_DIR, 'str.txt');
    writeAtomic(target, 'hello atomic', 'utf-8');
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello atomic');
  });

  it('覆盖已有文件不应残留 .tmp', () => {
    const target = path.join(TMP_DIR, 'str-overwrite.txt');
    writeAtomic(target, 'v1', 'utf-8');
    writeAtomic(target, 'v2', 'utf-8');
    expect(fs.readFileSync(target, 'utf-8')).toBe('v2');
    expect(fs.existsSync(target + '.tmp')).toBe(false);
  });
});

// ========== writeJsonAtomicAsync（异步）测试 ==========
describe('writeJsonAtomicAsync（异步）', () => {
  it('异步写入后文件应存在且 JSON.parse 成功', async () => {
    const target = path.join(TMP_DIR, 'async.json');
    await writeJsonAtomicAsync(target, { async: true, value: [1, 2] });

    expect(fs.existsSync(target)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(target, 'utf-8'));
    expect(parsed).toEqual({ async: true, value: [1, 2] });
  });

  it('异步覆盖写入后 .tmp 文件应被清理', async () => {
    const target = path.join(TMP_DIR, 'async-overwrite.json');
    await writeJsonAtomicAsync(target, { v: 1 });
    await writeJsonAtomicAsync(target, { v: 2 });

    expect(fs.existsSync(target + '.tmp')).toBe(false);
    expect(JSON.parse(fs.readFileSync(target, 'utf-8')).v).toBe(2);
  });
});

// ========== writeAtomicAsync（异步）测试 ==========
describe('writeAtomicAsync（异步）', () => {
  it('应异步写入 Buffer 数据', async () => {
    const target = path.join(TMP_DIR, 'async-buf.bin');
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    await writeAtomicAsync(target, buf);
    const read = fs.readFileSync(target);
    expect(read).toEqual(buf);
    expect(fs.existsSync(target + '.tmp')).toBe(false);
  });
});
