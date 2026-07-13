/**
 * 造境 ZaoJing — 批量生成页模块
 * 支持批量文本输入 / CSV 导入，并发任务队列，实时进度，结果网格
 */
import { $, state, toast, escapeHtml, logger, navigate } from '../shared.js';
import { DIRECTORS, POSTER_FORMATS } from '../data.js';
import * as AIClient from '../ai-client';
import { createModuleBoundary } from '../utils/error-boundary.js';
import { BatchQueue, parseBatchInput, parseCSV } from '../utils/batch-queue.js';
import { safeRevokeUrl } from '../utils/sanitize.js';

const posterBoundary = createModuleBoundary('BatchPoster');

// ========== 依赖注入 ==========
let _getPosterEngine = null;

/**
 * 初始化批量生成页模块
 * @param {Object} deps
 * @param {Function} deps.getPosterEngine - 返回 PosterEngine 模块的异步函数
 */
export function setupBatchPage({ getPosterEngine }) {
  _getPosterEngine = getPosterEngine;
}

// ========== 模块状态 ==========
let _batchQueue = null;
let _batchResults = [];
let _batchDirectorId = 'miyazaki';
let _batchFormat = 'vertical';

// 释放所有批量结果的 Blob URL，防止内存泄漏
function cleanupBatchResults() {
  _batchResults.forEach((item) => {
    if (item && item.result && item.result.dataUrl) {
      safeRevokeUrl(item.result.dataUrl);
    }
  });
  _batchResults = [];
}

// ========== 打开 / 关闭弹窗 ==========
export function openBatchModal() {
  navigate('batch');
  // 重置 UI
  resetBatchUI();
  // 初始化导演选择器
  initBatchDirectorSelector();
  // 初始化版式选择器
  initBatchFormatSelector();
}

export function closeBatchModal() {
  // 如果正在生成，询问是否中止
  if (_batchQueue && _batchQueue.isStarted() && !_batchQueue.isAborted()) {
    const stats = _batchQueue.getStats();
    if (stats.running > 0 || stats.pending > 0) {
      if (!confirm('批量生成正在进行中，确定要关闭吗？')) return;
      _batchQueue.abort();
    }
  }
  navigate('input');
}

function resetBatchUI() {
  cleanupBatchResults();
  _batchQueue = null;
  const progressSection = $('batch-progress-section');
  const resultsSection = $('batch-results-section');
  const startBtn = $('btn-batch-start');
  const inputSection = $('batch-input-section');
  if (progressSection) progressSection.style.display = 'none';
  if (resultsSection) resultsSection.style.display = 'none';
  if (startBtn) startBtn.disabled = false;
  if (inputSection) inputSection.style.display = 'block';
}

// ========== 导演选择器 ==========
function initBatchDirectorSelector() {
  const container = $('batch-director-grid');
  if (!container) return;
  container.innerHTML = '';

  DIRECTORS.filter((d) => d.available).forEach((director) => {
    const card = document.createElement('div');
    card.className = 'batch-director-card';
    if (director.id === _batchDirectorId) card.classList.add('selected');
    card.dataset.id = director.id;
    card.innerHTML = `
      <span class="batch-director-avatar">${director.avatar}</span>
      <span class="batch-director-name">${escapeHtml(director.name)}</span>
    `;
    card.addEventListener('click', () => {
      container.querySelectorAll('.batch-director-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      _batchDirectorId = director.id;
    });
    container.appendChild(card);
  });
}

// ========== 版式选择器 ==========
function initBatchFormatSelector() {
  const container = $('batch-format-select');
  if (!container) return;
  container.innerHTML = '';

  // 经典版式
  const classicGroup = document.createElement('optgroup');
  classicGroup.label = '经典版式';
  POSTER_FORMATS.filter((f) => f.group !== 'social').forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.label} (${f.width}×${f.height})`;
    classicGroup.appendChild(opt);
  });
  container.appendChild(classicGroup);

  // 社交平台
  const socialGroup = document.createElement('optgroup');
  socialGroup.label = '社交平台';
  POSTER_FORMATS.filter((f) => f.group === 'social').forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = `${f.label} (${f.desc})`;
    socialGroup.appendChild(opt);
  });
  container.appendChild(socialGroup);

  container.value = _batchFormat;
  container.onchange = () => {
    _batchFormat = container.value;
  };
}

// ========== CSV 上传 ==========
export function handleBatchCSVUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    const tasks = parseCSV(content, _batchDirectorId);
    if (tasks.length === 0) {
      toast('CSV 文件未解析到有效内容');
      return;
    }
    // 将解析结果填入 textarea（每行一条文本）
    const textarea = $('batch-text-input');
    if (textarea) {
      textarea.value = tasks.map((t) => t.text).join('\n');
      updateBatchInputCount();
    }
    toast(`已导入 ${tasks.length} 条文本`);
  };
  reader.onerror = () => toast('文件读取失败');
  reader.readAsText(file, 'UTF-8');
}

// ========== 输入计数 ==========
function updateBatchInputCount() {
  const textarea = $('batch-text-input');
  const countEl = $('batch-input-count');
  if (!textarea || !countEl) return;
  const tasks = parseBatchInput(textarea.value, _batchDirectorId);
  countEl.textContent = `${tasks.length} 条`;
  countEl.classList.toggle('has-items', tasks.length > 0);
}

// ========== 启动批量生成 ==========
export async function startBatchGeneration() {
  const textarea = $('batch-text-input');
  if (!textarea || !textarea.value.trim()) {
    toast('请输入或导入批量文本');
    return;
  }

  let tasks = parseBatchInput(textarea.value, _batchDirectorId);
  if (tasks.length === 0) {
    toast('未解析到有效文本');
    return;
  }

  if (tasks.length > 50) {
    tasks = tasks.slice(0, 50);
    toast('单次批量最多 50 条，已截断');
  }

  // 切换 UI 到进度模式
  const inputSection = $('batch-input-section');
  const progressSection = $('batch-progress-section');
  const startBtn = $('btn-batch-start');
  if (inputSection) inputSection.style.display = 'none';
  if (progressSection) progressSection.style.display = 'block';
  if (startBtn) startBtn.disabled = true;

  // 清理旧结果的 Blob URL，防止内存泄漏
  cleanupBatchResults();

  // 创建任务队列
  _batchQueue = new BatchQueue({
    concurrency: 2,
    onProgress: renderBatchProgress,
    onTaskComplete: (task, result) => {
      _batchResults.push({ task, result });
      renderBatchResults();
    },
    onTaskError: (task, err) => {
      logger.warn(`批量任务失败 [${task.text.substring(0, 20)}]:`, err.message);
    },
    onAllComplete: (results) => {
      const stats = _batchQueue.getStats();
      toast(`批量生成完成：成功 ${stats.completed}，失败 ${stats.failed}`);
      const finishBtn = $('btn-batch-finish');
      if (finishBtn) finishBtn.textContent = '完成';
    },
  });

  _batchQueue.addAll(tasks);

  // 进度区域显示中止按钮
  const abortBtn = $('btn-batch-abort');
  if (abortBtn) abortBtn.style.display = 'inline-flex';

  // 启动处理
  const PosterEngine = await _getPosterEngine();

  await _batchQueue.start(async (task) => {
    // 1. 如果启用 AI，先生成 AI 图片
    let aiImageUrl = null;
    if (state.useAI && state.aiHealthStatus) {
      aiImageUrl = await posterBoundary.run(
        () =>
          AIClient.generateImage({
            text: task.text,
            directorId: task.directorId,
            engine: state.aiEngine,
            size: _batchFormat,
          }),
        (err) => {
          logger.warn(`批量 AI 生图失败 [${task.text.substring(0, 20)}]:`, err.message);
          return null;
        }
      );
      aiImageUrl = aiImageUrl ? aiImageUrl.dataUrl : null;
    }

    // 2. 调用 PosterEngine 生成海报
    const result = await PosterEngine.generate({
      text: task.text,
      directorId: task.directorId,
      moodTagId: state.moodTagId,
      format: _batchFormat,
      showQuote: state.showQuote,
      aiImageUrl: aiImageUrl,
      emotion: state.emotionAnalysis ? state.emotionAnalysis.primaryEmotion : null,
    });

    return result;
  });
}

// ========== 渲染进度 ==========
function renderBatchProgress(stats) {
  const progressBar = $('batch-progress-bar');
  const statsText = $('batch-stats-text');
  const statsDetail = $('batch-stats-detail');

  if (progressBar) {
    progressBar.style.width = stats.progress + '%';
    progressBar.setAttribute('aria-valuenow', String(stats.progress));
  }
  if (statsText) {
    statsText.textContent = `${stats.progress}%`;
  }
  if (statsDetail) {
    statsDetail.textContent = `总计 ${stats.total} · 成功 ${stats.completed} · 失败 ${stats.failed} · 进行中 ${stats.running}`;
  }
}

// ========== 渲染结果网格 ==========
function renderBatchResults() {
  const container = $('batch-results-grid');
  const resultsSection = $('batch-results-section');
  if (!container) return;
  if (resultsSection) resultsSection.style.display = 'block';

  container.innerHTML = '';
  _batchResults.forEach((item, index) => {
    const { task, result } = item;
    const card = document.createElement('div');
    card.className = 'batch-result-card';
    const director = DIRECTORS.find((d) => d.id === task.directorId);
    const directorName = director ? director.name : task.directorId;
    card.innerHTML = `
      <div class="batch-result-img-wrap">
        <img src="${result.dataUrl}" alt="${escapeHtml(result.title || task.text.substring(0, 20))}" loading="lazy">
      </div>
      <div class="batch-result-info">
        <span class="batch-result-title">${escapeHtml(result.title || task.text.substring(0, 20))}</span>
        <span class="batch-result-meta">${escapeHtml(directorName)}</span>
      </div>
      <button class="btn btn-ghost btn-sm batch-download-btn" data-index="${index}"><svg class="ico"><use href="#i-download"/></svg> 下载</button>
    `;
    const downloadBtn = card.querySelector('.batch-download-btn');
    downloadBtn.addEventListener('click', () => downloadBatchPoster(index));
    container.appendChild(card);
  });
}

// ========== 下载单张 ==========
function downloadBatchPoster(index) {
  const item = _batchResults[index];
  if (!item || !item.result) return;
  const { result, task } = item;
  const link = document.createElement('a');
  link.download = `造境_${result.title || task.text.substring(0, 10)}_${index + 1}.png`;
  link.href = result.dataUrl;
  link.click();
  toast('已开始下载');
}

// ========== 下载全部 ==========
export function downloadAllBatchPosters() {
  if (_batchResults.length === 0) {
    toast('暂无可下载的海报');
    return;
  }
  _batchResults.forEach((item, index) => {
    // 错开下载时间，避免浏览器拦截
    setTimeout(() => downloadBatchPoster(index), index * 300);
  });
  toast(`正在下载 ${_batchResults.length} 张海报...`);
}

// ========== 中止生成 ==========
export function abortBatchGeneration() {
  if (_batchQueue && _batchQueue.isStarted() && !_batchQueue.isAborted()) {
    _batchQueue.abort();
    toast('已中止剩余任务');
    const abortBtn = $('btn-batch-abort');
    if (abortBtn) abortBtn.style.display = 'none';
  }
}

// ========== 完成按钮（关闭弹窗或回到输入） ==========
export function finishBatch() {
  closeBatchModal();
}
