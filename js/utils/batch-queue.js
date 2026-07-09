/**
 * 造境 ZaoJing — 批量任务队列
 * 支持并发控制的通用任务队列，用于批量海报生成
 *
 * 用法：
 *   const queue = new BatchQueue({ concurrency: 2, onProgress, onTaskComplete, onTaskError, onAllComplete });
 *   queue.add({ id, text, directorId });
 *   const results = await queue.start(async (task) => { ... return result; });
 *   queue.abort(); // 中止剩余任务
 */

import { logger } from './logger.js';

/**
 * @typedef {Object} BatchTask
 * @property {string} id - 任务唯一 ID
 * @property {string} text - 输入文字
 * @property {string} directorId - 导演 ID
 * @property {'pending'|'running'|'done'|'failed'|'aborted'} status - 任务状态
 * @property {*} [result] - 生成结果
 * @property {string} [error] - 错误信息
 */

/**
 * @typedef {Object} BatchStats
 * @property {number} total - 总任务数
 * @property {number} pending - 等待中
 * @property {number} running - 执行中
 * @property {number} completed - 已完成
 * @property {number} failed - 已失败
 * @property {number} progress - 进度百分比 (0-100)
 */

/**
 * @typedef {Object} BatchQueueOptions
 * @property {number} [concurrency] - 并发数，默认 2
 * @property {(stats: BatchStats) => void} [onProgress] - 进度回调
 * @property {(task: BatchTask, result: *) => void} [onTaskComplete] - 单任务完成回调
 * @property {(task: BatchTask, error: Error) => void} [onTaskError] - 单任务失败回调
 * @property {(results: *[]) => void} [onAllComplete] - 全部完成回调
 */

class BatchQueue {
  /**
   * @param {BatchQueueOptions} [options]
   */
  constructor(options) {
    options = options || {};
    const c = typeof options.concurrency === 'number' ? options.concurrency : 2;
    this.concurrency = Math.max(1, c);
    /** @type {BatchTask[]} */
    this.tasks = [];
    this.running = 0;
    this.completed = 0;
    this.failed = 0;
    this.onProgress = options.onProgress || (function () {});
    this.onTaskComplete = options.onTaskComplete || (function () {});
    this.onTaskError = options.onTaskError || (function () {});
    this.onAllComplete = options.onAllComplete || (function () {});
    this._aborted = false;
    this._started = false;
  }

  /**
   * 添加任务到队列
   * @param {Object} task - 任务数据（不含 status）
   */
  add(task) {
    this.tasks.push(Object.assign({ status: 'pending', result: null, error: null }, task));
  }

  /**
   * 批量添加任务
   * @param {Object[]} tasks
   */
  addAll(tasks) {
    tasks.forEach((t) => this.add(t));
  }

  /**
   * 启动队列，依次执行所有任务
   * @param {(task: BatchTask) => Promise<*>} processor - 任务处理函数
   * @returns {Promise<*[]>} 所有成功任务的结果数组
   */
  start(processor) {
    if (this._started) {
      return Promise.reject(new Error('队列已启动，请创建新队列'));
    }
    this._started = true;
    this._aborted = false;

    const results = [];
    const self = this;
    let queueIndex = 0;

    function runNext() {
      if (self._aborted) return Promise.resolve();
      if (queueIndex >= self.tasks.length) return Promise.resolve();

      const task = self.tasks[queueIndex++];
      task.status = 'running';
      self.running++;
      self.onProgress(self.getStats());

      return Promise.resolve()
        .then(() => processor(task))
        .then((result) => {
          task.status = 'done';
          task.result = result;
          self.completed++;
          results.push(result);
          self.onTaskComplete(task, result);
        })
        .catch((err) => {
          task.status = 'failed';
          task.error = err && err.message ? err.message : String(err);
          self.failed++;
          logger.warn('[batch-queue] 任务失败:', task.id, task.error);
          self.onTaskError(task, err instanceof Error ? err : new Error(task.error));
        })
        .then(() => {
          self.running--;
          self.onProgress(self.getStats());
        });
    }

    const self2 = this;
    return new Promise((resolve) => {
      let active = 0;
      let finished = false;

      function schedule() {
        if (self2._aborted) {
          if (!finished) {
            finished = true;
            self2.onAllComplete(results);
            resolve(results);
          }
          return;
        }

        // 填充并发槽位
        while (active < self2.concurrency && queueIndex < self2.tasks.length) {
          active++;
          runNext().then(() => {
            active--;
            checkComplete();
            schedule();
          });
        }

        checkComplete();
      }

      function checkComplete() {
        if (finished) return;
        const totalDone = self2.completed + self2.failed;
        if (totalDone >= self2.tasks.length && active === 0) {
          finished = true;
          self2.onAllComplete(results);
          resolve(results);
        }
      }

      schedule();
    });
  }

  /**
   * 中止队列：正在执行的任务会完成，但不再启动新任务
   */
  abort() {
    this._aborted = true;
    // 将未开始的任务标记为 aborted
    this.tasks.forEach((t) => {
      if (t.status === 'pending') t.status = 'aborted';
    });
  }

  /**
   * 获取当前队列统计
   * @returns {BatchStats}
   */
  getStats() {
    const total = this.tasks.length;
    const done = this.completed + this.failed;
    return {
      total,
      pending: total - done - this.running,
      running: this.running,
      completed: this.completed,
      failed: this.failed,
      progress: total === 0 ? 0 : Math.round((done / total) * 100),
    };
  }

  /**
   * 是否已启动
   * @returns {boolean}
   */
  isStarted() {
    return this._started;
  }

  /**
   * 是否已中止
   * @returns {boolean}
   */
  isAborted() {
    return this._aborted;
  }
}

/**
 * 解析批量输入文本为任务列表
 * 每行一条文本，空行跳过，自动去除首尾空白
 * @param {string} text - 多行文本
 * @param {string} directorId - 默认导演 ID
 * @param {number} [maxItems=50] - 最大条目数
 * @returns {BatchTask[]}
 */
function parseBatchInput(text, directorId, maxItems) {
  const limit = maxItems || 50;
  const lines = text.split(/\r?\n/);
  const tasks = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (tasks.length >= limit) break;
    tasks.push({
      id: 'batch-' + Date.now() + '-' + tasks.length,
      text: trimmed,
      directorId: directorId,
      status: 'pending',
      result: null,
      error: null,
    });
  }
  return tasks;
}

/**
 * 解析 CSV 文件内容为任务列表
 * 支持格式：
 *   - 纯文本（每行一条）
 *   - 两列：text,directorId（directorId 可选）
 *   - 带表头：text,directorId（首行跳过）
 * @param {string} csvContent - CSV 文件内容
 * @param {string} defaultDirectorId - 默认导演 ID
 * @param {number} [maxItems=50]
 * @returns {BatchTask[]}
 */
function parseCSV(csvContent, defaultDirectorId, maxItems) {
  const limit = maxItems || 50;
  const lines = csvContent.split(/\r?\n/);
  const tasks = [];
  let startIndex = 0;

  // 检测是否有表头
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase().trim();
    if (firstLine === 'text,directorid' || firstLine === 'text,director' || firstLine === '文本,导演') {
      startIndex = 1;
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (tasks.length >= limit) break;

    // 简单 CSV 解析：支持双引号包裹
    const parts = parseCSVLine(line);
    const text = (parts[0] || '').trim();
    if (!text) continue;
    const directorId = (parts[1] || '').trim() || defaultDirectorId;

    tasks.push({
      id: 'csv-' + Date.now() + '-' + tasks.length,
      text: text,
      directorId: directorId,
      status: 'pending',
      result: null,
      error: null,
    });
  }
  return tasks;
}

/**
 * 解析单行 CSV（支持双引号包裹和转义）
 * @param {string} line
 * @returns {string[]}
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

export { BatchQueue, parseBatchInput, parseCSV, parseCSVLine };
