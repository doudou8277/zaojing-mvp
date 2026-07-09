/**
 * 批量任务队列单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchQueue, parseBatchInput, parseCSV, parseCSVLine } from '../utils/batch-queue.js';

describe('BatchQueue', () => {
  let queue;

  beforeEach(() => {
    queue = new BatchQueue({ concurrency: 2 });
  });

  describe('构造与配置', () => {
    it('应使用默认并发数 2', () => {
      expect(queue.concurrency).toBe(2);
    });

    it('应支持自定义并发数', () => {
      const q = new BatchQueue({ concurrency: 5 });
      expect(q.concurrency).toBe(5);
    });

    it('并发数最小为 1', () => {
      const q = new BatchQueue({ concurrency: 0 });
      expect(q.concurrency).toBe(1);
    });

    it('初始状态正确', () => {
      expect(queue.tasks).toEqual([]);
      expect(queue.running).toBe(0);
      expect(queue.completed).toBe(0);
      expect(queue.failed).toBe(0);
      expect(queue.isStarted()).toBe(false);
      expect(queue.isAborted()).toBe(false);
    });
  });

  describe('add / addAll', () => {
    it('add 应添加任务并设置默认状态', () => {
      queue.add({ id: 't1', text: 'hello', directorId: 'miyazaki' });
      expect(queue.tasks).toHaveLength(1);
      expect(queue.tasks[0].status).toBe('pending');
      expect(queue.tasks[0].result).toBeNull();
      expect(queue.tasks[0].error).toBeNull();
    });

    it('addAll 应批量添加任务', () => {
      queue.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
        { id: 't3', text: 'c', directorId: 'nolan' },
      ]);
      expect(queue.tasks).toHaveLength(3);
    });
  });

  describe('getStats', () => {
    it('空队列统计正确', () => {
      const stats = queue.getStats();
      expect(stats.total).toBe(0);
      expect(stats.progress).toBe(0);
    });

    it('有任务时统计正确', () => {
      queue.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
      ]);
      const stats = queue.getStats();
      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(2);
      expect(stats.progress).toBe(0);
    });
  });

  describe('start - 基本执行', () => {
    it('应依次执行所有任务并返回结果', async () => {
      queue.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
        { id: 't3', text: 'c', directorId: 'nolan' },
      ]);

      const processor = vi.fn(async (task) => `result-${task.id}`);
      const results = await queue.start(processor);

      expect(results).toHaveLength(3);
      expect(results).toEqual(['result-t1', 'result-t2', 'result-t3']);
      expect(processor).toHaveBeenCalledTimes(3);
      expect(queue.completed).toBe(3);
      expect(queue.failed).toBe(0);
    });

    it('所有任务状态应为 done', async () => {
      queue.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
      ]);
      await queue.start(async () => 'ok');
      expect(queue.tasks[0].status).toBe('done');
      expect(queue.tasks[0].result).toBe('ok');
    });

    it('不应重复启动同一队列', async () => {
      queue.add({ id: 't1', text: 'a', directorId: 'miyazaki' });
      await queue.start(async () => 'ok');
      await expect(queue.start(async () => 'ok')).rejects.toThrow('队列已启动');
    });
  });

  describe('start - 并发控制', () => {
    it('应限制并发数', async () => {
      const concurrency1 = new BatchQueue({ concurrency: 1 });
      let maxRunning = 0;
      let currentRunning = 0;

      concurrency1.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
        { id: 't3', text: 'c', directorId: 'nolan' },
        { id: 't4', text: 'd', directorId: 'wes' },
      ]);

      await concurrency1.start(async () => {
        currentRunning++;
        maxRunning = Math.max(maxRunning, currentRunning);
        await new Promise((r) => setTimeout(r, 10));
        currentRunning--;
        return 'ok';
      });

      expect(maxRunning).toBe(1);
    });

    it('并发 2 时最多同时运行 2 个', async () => {
      let maxRunning = 0;
      let currentRunning = 0;

      queue.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
        { id: 't3', text: 'c', directorId: 'nolan' },
        { id: 't4', text: 'd', directorId: 'wes' },
      ]);

      await queue.start(async () => {
        currentRunning++;
        maxRunning = Math.max(maxRunning, currentRunning);
        await new Promise((r) => setTimeout(r, 10));
        currentRunning--;
        return 'ok';
      });

      expect(maxRunning).toBe(2);
    });
  });

  describe('start - 错误处理', () => {
    it('单个任务失败不影响其他任务', async () => {
      queue.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
        { id: 't3', text: 'c', directorId: 'nolan' },
      ]);

      const processor = vi.fn(async (task) => {
        if (task.id === 't2') throw new Error('boom');
        return `result-${task.id}`;
      });

      const results = await queue.start(processor);

      expect(results).toHaveLength(2);
      expect(queue.completed).toBe(2);
      expect(queue.failed).toBe(1);
      expect(queue.tasks[1].status).toBe('failed');
      expect(queue.tasks[1].error).toBe('boom');
    });

    it('应调用 onTaskError 回调', async () => {
      const onError = vi.fn();
      const q = new BatchQueue({ onTaskError: onError });
      q.add({ id: 't1', text: 'a', directorId: 'miyazaki' });

      await q.start(async () => {
        throw new Error('fail');
      });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][1]).toBeInstanceOf(Error);
      expect(onError.mock.calls[0][1].message).toBe('fail');
    });

    it('非 Error 对象的异常应转换为 Error', async () => {
      const onError = vi.fn();
      const q = new BatchQueue({ onTaskError: onError });
      q.add({ id: 't1', text: 'a', directorId: 'miyazaki' });

      await q.start(async () => {
        throw 'string error';
      });

      expect(onError.mock.calls[0][1]).toBeInstanceOf(Error);
      expect(onError.mock.calls[0][1].message).toBe('string error');
    });
  });

  describe('start - 回调', () => {
    it('应调用 onProgress 回调', async () => {
      const onProgress = vi.fn();
      const q = new BatchQueue({ concurrency: 1, onProgress });
      q.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
      ]);

      await q.start(async () => 'ok');

      expect(onProgress).toHaveBeenCalled();
      // 最后一次进度应为 100%
      const lastCall = onProgress.mock.calls[onProgress.mock.calls.length - 1][0];
      expect(lastCall.progress).toBe(100);
    });

    it('应调用 onTaskComplete 回调', async () => {
      const onComplete = vi.fn();
      const q = new BatchQueue({ onTaskComplete: onComplete });
      q.add({ id: 't1', text: 'a', directorId: 'miyazaki' });

      await q.start(async () => 'result');

      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onComplete.mock.calls[0][0].id).toBe('t1');
      expect(onComplete.mock.calls[0][1]).toBe('result');
    });

    it('应调用 onAllComplete 回调', async () => {
      const onAllComplete = vi.fn();
      const q = new BatchQueue({ onAllComplete });
      q.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
      ]);

      const results = await q.start(async () => 'ok');

      expect(onAllComplete).toHaveBeenCalledTimes(1);
      expect(onAllComplete.mock.calls[0][0]).toHaveLength(2);
    });
  });

  describe('abort', () => {
    it('中止后不再执行未开始的任务', async () => {
      const concurrency1 = new BatchQueue({ concurrency: 1 });
      let executed = 0;

      concurrency1.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
        { id: 't3', text: 'c', directorId: 'nolan' },
        { id: 't4', text: 'd', directorId: 'wes' },
      ]);

      const promise = concurrency1.start(async (task) => {
        executed++;
        if (executed === 1) {
          // 在第一个任务执行后中止
          concurrency1.abort();
        }
        await new Promise((r) => setTimeout(r, 10));
        return 'ok';
      });

      await promise;

      // 至少执行了 1 个（正在运行的），但不应执行全部
      expect(executed).toBeLessThan(4);
      expect(concurrency1.isAborted()).toBe(true);
    });

    it('中止后 pending 任务状态应为 aborted', async () => {
      const concurrency1 = new BatchQueue({ concurrency: 1 });
      concurrency1.addAll([
        { id: 't1', text: 'a', directorId: 'miyazaki' },
        { id: 't2', text: 'b', directorId: 'wkw' },
        { id: 't3', text: 'c', directorId: 'nolan' },
      ]);

      const promise = concurrency1.start(async () => {
        concurrency1.abort();
        await new Promise((r) => setTimeout(r, 10));
        return 'ok';
      });

      await promise;

      const abortedTasks = concurrency1.tasks.filter((t) => t.status === 'aborted');
      expect(abortedTasks.length).toBeGreaterThan(0);
    });
  });
});

describe('parseBatchInput', () => {
  it('应按行解析文本', () => {
    const text = '第一行\n第二行\n第三行';
    const tasks = parseBatchInput(text, 'miyazaki');
    expect(tasks).toHaveLength(3);
    expect(tasks[0].text).toBe('第一行');
    expect(tasks[0].directorId).toBe('miyazaki');
    expect(tasks[0].status).toBe('pending');
  });

  it('应跳过空行', () => {
    const text = '第一行\n\n  \n第二行';
    const tasks = parseBatchInput(text, 'miyazaki');
    expect(tasks).toHaveLength(2);
  });

  it('应去除首尾空白', () => {
    const text = '  第一行  \n  第二行  ';
    const tasks = parseBatchInput(text, 'miyazaki');
    expect(tasks[0].text).toBe('第一行');
    expect(tasks[1].text).toBe('第二行');
  });

  it('应支持 \r\n 换行', () => {
    const text = '第一行\r\n第二行\r\n第三行';
    const tasks = parseBatchInput(text, 'miyazaki');
    expect(tasks).toHaveLength(3);
  });

  it('应限制最大条目数', () => {
    const text = Array.from({ length: 100 }, (_, i) => `第${i + 1}行`).join('\n');
    const tasks = parseBatchInput(text, 'miyazaki', 10);
    expect(tasks).toHaveLength(10);
  });

  it('空文本返回空数组', () => {
    expect(parseBatchInput('', 'miyazaki')).toEqual([]);
    expect(parseBatchInput('  \n  \n  ', 'miyazaki')).toEqual([]);
  });

  it('每个任务应有唯一 ID', () => {
    const tasks = parseBatchInput('a\nb\nc', 'miyazaki');
    const ids = tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });
});

describe('parseCSV', () => {
  it('应解析单列 CSV', () => {
    const csv = '第一行\n第二行\n第三行';
    const tasks = parseCSV(csv, 'miyazaki');
    expect(tasks).toHaveLength(3);
    expect(tasks[0].text).toBe('第一行');
    expect(tasks[0].directorId).toBe('miyazaki');
  });

  it('应解析双列 CSV（text,directorId）', () => {
    const csv = '深夜加班,miyazaki\n雨夜,wkw';
    const tasks = parseCSV(csv, 'miyazaki');
    expect(tasks).toHaveLength(2);
    expect(tasks[0].text).toBe('深夜加班');
    expect(tasks[0].directorId).toBe('miyazaki');
    expect(tasks[1].text).toBe('雨夜');
    expect(tasks[1].directorId).toBe('wkw');
  });

  it('第二列为空时使用默认导演', () => {
    const csv = '深夜加班,';
    const tasks = parseCSV(csv, 'nolan');
    expect(tasks[0].directorId).toBe('nolan');
  });

  it('应跳过表头行', () => {
    const csv = 'text,directorId\n深夜加班,miyazaki\n雨夜,wkw';
    const tasks = parseCSV(csv, 'miyazaki');
    expect(tasks).toHaveLength(2);
    expect(tasks[0].text).toBe('深夜加班');
  });

  it('应跳过中文表头', () => {
    const csv = '文本,导演\n深夜加班,miyazaki';
    const tasks = parseCSV(csv, 'miyazaki');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe('深夜加班');
  });

  it('应跳过空行', () => {
    const csv = '第一行\n\n第二行';
    const tasks = parseCSV(csv, 'miyazaki');
    expect(tasks).toHaveLength(2);
  });

  it('应限制最大条目数', () => {
    const csv = Array.from({ length: 100 }, (_, i) => `第${i + 1}行`).join('\n');
    const tasks = parseCSV(csv, 'miyazaki', 10);
    expect(tasks).toHaveLength(10);
  });

  it('应支持双引号包裹的文本', () => {
    const csv = '"深夜,加班",miyazaki\n"雨夜,孤独",wkw';
    const tasks = parseCSV(csv, 'miyazaki');
    expect(tasks[0].text).toBe('深夜,加班');
    expect(tasks[1].text).toBe('雨夜,孤独');
  });
});

describe('parseCSVLine', () => {
  it('应解析简单 CSV 行', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('应解析双引号包裹的字段', () => {
    expect(parseCSVLine('"hello, world",b')).toEqual(['hello, world', 'b']);
  });

  it('应处理双引号转义', () => {
    expect(parseCSVLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('单字段返回单元素数组', () => {
    expect(parseCSVLine('only')).toEqual(['only']);
  });

  it('空行返回单元素数组', () => {
    expect(parseCSVLine('')).toEqual(['']);
  });
});
