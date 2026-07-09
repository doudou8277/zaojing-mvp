/**
 * 造境 ZaoJing — 结果页模块
 * 从 app.js 提取：海报展示 / 二次创作 / 下载分享 / 历史记录 / 电影墙
 */

import { $, state, toast, navigate, escapeHtml, sleep, openModal, closeModal, openResultToolsModal } from '../shared.js';
import { logger } from '../utils/logger.js';
import { lazyLoadAll } from '../utils/lazy-load.js';
import { safeRevokeUrl } from '../utils/sanitize.js';
import { shareToPlatform, saveImageToLocal, generatePlatformCopy } from '../utils/social-share.js';
import {
  animatePoster,
  downloadVideoBlob,
  ANIMATION_PRESETS,
  isAnimationSupported,
} from '../utils/poster-animator.js';
import { applyBrandingToImage, loadBrandConfig } from '../utils/brand-toolkit.js';
import { smartSet, smartGet, smartDelete } from '../utils/storage.js';
import * as AIClient from '../ai-client';
import {
  DIRECTORS,
  POSTER_FORMATS,
  generateMovieInfo,
  generateReview,
  generateDirectorNotes,
  getRandomQuote,
} from '../data.js';
import QRCode from 'qrcode';

// ========== 依赖注入 ==========
// getPosterEngine() 和 _MovieModule 原本定义在 app.js 模块作用域内，
// 此处通过 setupResultPage 由 app.js 注入，避免循环依赖。
let _getPosterEngine = null;
let _getMovieModule = null;

/**
 * 初始化结果页模块，注入 app.js 中的懒加载依赖
 * @param {Object} deps
 * @param {Function} deps.getPosterEngine - 返回 PosterEngine 模块的异步函数
 * @param {Function} deps.getMovieModule  - 返回当前 MovieModule 实例的函数
 */
export function setupResultPage({ getPosterEngine, getMovieModule }) {
  _getPosterEngine = getPosterEngine;
  _getMovieModule = getMovieModule;
}

// ========== 结果页 ==========
// ========== 品牌工具应用 ==========

/**
 * 如果品牌工具已启用，对当前海报应用 Logo/水印
 * @param {Object} result - 海报结果
 * @param {HTMLImageElement} imgEl - 海报图片元素
 */
async function applyBrandingIfNeeded(result, imgEl) {
  try {
    const config = loadBrandConfig();
    if (!config || !config.enabled) return;
    if (!config.watermarkText && !config.logoDataUrl) return;

    const brandedUrl = await applyBrandingToImage(result.dataUrl, config);
    if (brandedUrl && brandedUrl !== result.dataUrl) {
      imgEl.src = brandedUrl;
      // 保存带品牌标识的版本用于下载
      result._brandedDataUrl = brandedUrl;
    }
  } catch (e) {
    logger.warn('品牌工具应用失败:', e.message);
  }
}

function showResultPage() {
  const results = state.posterResults;
  const isMulti = results.length > 1;
  const current = results[state.currentPosterIndex];
  const isGrid9 = current.directorId === 'grid9';
  const director = DIRECTORS.find((d) => d.id === current.directorId);

  // 单张 vs 系列展示
  if (isMulti) {
    $('poster-single').style.display = 'none';
    $('poster-series').style.display = 'block';
    renderSeriesGrid();
  } else {
    $('poster-single').style.display = 'block';
    $('poster-series').style.display = 'none';
    const posterImg = $('poster-img');
    posterImg.src = current.dataUrl;
    posterImg.style.display = 'block';
    posterImg.alt = `${current.director || ''}风格海报 - ${current.title || ''}`;

    // 应用品牌工具（Logo/水印）
    applyBrandingIfNeeded(current, posterImg);

    // 如果有电影来源，显示灵感来源面板
    if (current.movieRef) {
      let refEl = $('movie-inspiration');
      if (!refEl) {
        refEl = document.createElement('div');
        refEl.id = 'movie-inspiration';
        refEl.className = 'movie-inspiration-panel';
        $('poster-single').appendChild(refEl);
      }
      const ref = current.movieRef;
      const movieModule = _getMovieModule ? _getMovieModule() : null;
      const movie = movieModule ? movieModule.state.movies.find((m) => m.id === ref.id) : null;
      refEl.innerHTML = `
        <div class="inspiration-label">灵感来源</div>
        <div class="inspiration-movie">${escapeHtml(ref.title)}</div>
        ${movie ? `<div class="inspiration-style">${escapeHtml(movie.visualStyle)}</div>` : ''}
      `;
      refEl.style.display = 'block';
    }
  }

  // 标题和信息
  $('result-title').textContent = state.currentTitle;
  if (isGrid9) {
    $('result-meta').textContent = `6位导演合集 · ${current.format}`;
    $('poster-director-info').textContent = '系列合集';
  } else {
    $('result-meta').textContent = isMulti
      ? `${results.length} 位导演系列 · ${current.format}`
      : `${director ? director.name : ''}风格 · ${current.format}`;
    $('poster-director-info').textContent = isMulti
      ? `${state.currentPosterIndex + 1}/${results.length} 位导演`
      : director
        ? director.name
        : '';
  }
  $('poster-format-info').textContent = `${current.width} × ${current.height}`;
  $('poster-time-info').textContent = '刚刚';

  // 金句（九宫格模式无金句）
  state.currentQuote = current.quote || '';
  $('quote-text').textContent = current.quote ? `「${current.quote}」` : '';
  $('quote-author').textContent = director ? `— ${director.name}` : '';

  // 初始化二次创作控件
  initTitleSelector();
  initFormatSelector();

  const toggleQuote = $('toggle-quote');
  toggleQuote.classList.toggle('on', state.showQuote);

  // 九宫格模式下隐藏金句相关控件
  const quoteToggleRow = $('quote-toggle-row');
  if (quoteToggleRow) {
    quoteToggleRow.style.display = isGrid9 ? 'none' : 'flex';
  }
  const quoteRefreshRow = $('quote-refresh-row');
  if (quoteRefreshRow) {
    quoteRefreshRow.style.display = isGrid9 ? 'none' : 'flex';
  }
  const quoteDisplay = $('quote-display');
  if (quoteDisplay) {
    quoteDisplay.style.display = isGrid9 ? 'none' : 'block';
  }

  $('result-options').style.display = 'block';

  // 渲染电影信息、AI 影评、导演手记
  renderMovieInfo();
  renderReview();
  renderDirectorNotes();

  navigate('result');

  // 加载多平台适配文案（异步，不阻塞页面渲染）
  loadPlatformCopy();
}

// ========== 多平台文案 ==========

async function loadPlatformCopy() {
  const current = state.posterResults[state.currentPosterIndex];
  if (!current) return;

  const platformCopySection = $('platform-copy-section');
  const platformCopyEl = $('platform-copy');
  if (!platformCopyEl || !platformCopySection) return;

  // 显示加载状态
  platformCopySection.style.display = 'block';
  platformCopyEl.innerHTML = '<div class="platform-copy-loading">文案生成中...</div>';

  try {
    // 检查后端是否可用
    if (!state.aiHealthStatus) {
      // 降级：使用本地生成的文案
      const localCopy = generatePlatformCopy(current);
      renderPlatformCopy(localCopy);
      return;
    }

    const result = await AIClient.generatePlatformCopy({
      text: state.inputText,
      directorId: current.directorId,
      emotion: state.emotionAnalysis?.primaryEmotion,
    });
    renderPlatformCopy(result);
  } catch (err) {
    logger.warn('多平台文案生成失败，使用本地文案:', err.message);
    // 降级：使用本地文案
    const localCopy = generatePlatformCopy(current);
    renderPlatformCopy(localCopy);
  }
}

function renderPlatformCopy(copy) {
  const el = $('platform-copy');
  if (!el) return;

  const platforms = [
    { id: 'weibo', label: '微博', icon: '📱', color: '#e6162d' },
    { id: 'xhs', label: '小红书', icon: '📕', color: '#ff2442' },
    { id: 'douyin', label: '抖音', icon: '🎵', color: '#25f4ee' },
    { id: 'wechat', label: '微信', icon: '💬', color: '#07c160' },
  ];

  el.innerHTML = `
    <div class="platform-copy-tabs">
      ${platforms.map((p, i) => `
        <button class="platform-copy-tab ${i === 0 ? 'active' : ''}" data-platform="${p.id}" style="${i === 0 ? `border-color:${p.color}` : ''}">
          ${p.icon} ${p.label}
        </button>
      `).join('')}
    </div>
    <div class="platform-copy-content">
      ${platforms.map((p, i) => `
        <div class="platform-copy-panel ${i === 0 ? 'active' : ''}" data-platform="${p.id}">
          <div class="platform-copy-text">${escapeHtml(copy[p.id] || '')}</div>
          <button class="btn btn-ghost btn-sm platform-copy-btn" data-copy-text="${escapeHtml(copy[p.id] || '')}">复制文案</button>
        </div>
      `).join('')}
    </div>
  `;

  // Tab 切换
  el.querySelectorAll('.platform-copy-tab').forEach((tab) => {
    tab.onclick = () => {
      const platform = tab.dataset.platform;
      el.querySelectorAll('.platform-copy-tab').forEach((t) => {
        t.classList.remove('active');
        t.style.borderColor = '';
      });
      tab.classList.add('active');
      tab.style.borderColor = platforms.find((p) => p.id === platform).color;
      el.querySelectorAll('.platform-copy-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.platform === platform);
      });
    };
  });

  // 复制按钮
  el.querySelectorAll('.platform-copy-btn').forEach((btn) => {
    btn.onclick = () => {
      const text = btn.dataset.copyText;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => toast('文案已复制'));
      }
    };
  });
}

// ========== 渲染电影信息卡片 ==========
function renderMovieInfo() {
  const card = $('movie-info-card');
  if (!card) return;

  const current = state.posterResults[state.currentPosterIndex];
  if (!current || current.directorId === 'grid9') {
    card.style.display = 'none';
    return;
  }

  const emotion = state.emotionAnalysis ? state.emotionAnalysis.primaryEmotion : null;
  const info = generateMovieInfo(state.inputText, current.directorId, emotion);

  card.style.display = 'block';
  $('movie-title').textContent = info.title;
  $('movie-director').textContent = info.director;
  $('movie-release-date').textContent = info.releaseDate;
  $('movie-rating').textContent = info.rating;
  $('movie-box-office').textContent = info.boxOffice;

  // 渲染类型标签
  const genresEl = $('movie-genres');
  genresEl.innerHTML = '';
  info.genres.forEach((g) => {
    const tag = document.createElement('span');
    tag.className = 'genre-tag';
    tag.textContent = g;
    genresEl.appendChild(tag);
  });
}

// ========== 渲染 AI 影评 ==========
function renderReview() {
  const section = $('review-section');
  if (!section) return;

  const current = state.posterResults[state.currentPosterIndex];
  if (!current || current.directorId === 'grid9') {
    section.style.display = 'none';
    return;
  }

  const emotion = state.emotionAnalysis ? state.emotionAnalysis.primaryEmotion : null;
  const review = generateReview(state.inputText, current.directorId, emotion);

  section.style.display = 'block';
  $('review-score').textContent = review.score;
  $('review-text').textContent = review.review;
}

// ========== 渲染导演手记 ==========
function renderDirectorNotes() {
  const section = $('director-notes-section');
  if (!section) return;

  const current = state.posterResults[state.currentPosterIndex];
  if (!current || current.directorId === 'grid9') {
    section.style.display = 'none';
    return;
  }

  const emotion = state.emotionAnalysis ? state.emotionAnalysis.primaryEmotion : null;
  const notes = generateDirectorNotes(current.directorId, emotion);

  section.style.display = 'block';
  $('director-notes-text').textContent = notes;
}

function renderSeriesGrid() {
  const grid = $('series-grid');
  grid.innerHTML = '';
  state.posterResults.forEach((result, i) => {
    const director = DIRECTORS.find((d) => d.id === result.directorId);
    const item = document.createElement('div');
    item.className = 'series-item';
    if (i === state.currentPosterIndex) item.classList.add('active');
    item.style.animationDelay = i * 0.1 + 's';
    item.innerHTML = `
      <img data-src="${escapeHtml(result.dataUrl)}" alt="${escapeHtml(director.name)}风格海报">
      <div class="series-label">${escapeHtml(director.name)}</div>
    `;
    item.addEventListener('click', () => {
      state.currentPosterIndex = i;
      showResultPage();
    });
    grid.appendChild(item);
  });

  // 扫描系列网格中的懒加载图片
  lazyLoadAll();
}

// ========== 标题选择器 ==========
function initTitleSelector() {
  const container = $('title-selector');
  container.innerHTML = '';

  state.altTitles.forEach((title, i) => {
    const chip = document.createElement('button');
    chip.className = 'title-chip';
    chip.textContent = title;
    if (title === state.currentTitle) chip.classList.add('selected');
    chip.addEventListener('click', async () => {
      state.currentTitle = title;
      document.querySelectorAll('.title-chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      await regenerateCurrentPoster({ title });
    });
    container.appendChild(chip);
  });
}

// ========== 版式选择器 ==========
function initFormatSelector() {
  const container = $('format-selector');
  container.innerHTML = '';

  const groups = { classic: '经典版式', social: '社交平台' };
  for (const [groupKey, groupLabel] of Object.entries(groups)) {
    const groupFormats = POSTER_FORMATS.filter((f) => (f.group || 'classic') === groupKey);
    if (groupFormats.length === 0) continue;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'format-group';

    const label = document.createElement('div');
    label.className = 'format-group-label';
    label.textContent = groupLabel;
    groupDiv.appendChild(label);

    const btnsDiv = document.createElement('div');
    btnsDiv.className = 'format-group-btns';

    for (const fmt of groupFormats) {
      const chip = document.createElement('button');
      chip.className = 'format-chip';
      chip.textContent = fmt.label;
      if (state.posterFormat === fmt.id) chip.classList.add('selected');
      chip.addEventListener('click', async () => {
        if (state.posterFormat === fmt.id) return;
        state.posterFormat = fmt.id;
        document.querySelectorAll('.format-chip').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        $('poster-format-info').textContent = `${fmt.width} × ${fmt.height}`;
        toast('正在重新生成…');
        await regenerateAllPosters();
        toast('已切换为' + fmt.label);
      });
      btnsDiv.appendChild(chip);
    }
    groupDiv.appendChild(btnsDiv);
    container.appendChild(groupDiv);
  }
}

// ========== 重新生成当前海报 ==========
async function regenerateCurrentPoster(overrides) {
  if (state.isGenerating) return;
  // 九宫格模式下，标题切换需要重新生成整个合集
  if (state.posterFormat === 'grid9') {
    if (overrides && overrides.title) {
      state.currentTitle = overrides.title;
    }
    await regenerateAllPosters();
    return;
  }

  state.isGenerating = true;
  try {
    const current = state.posterResults[state.currentPosterIndex];
    const PosterEngine = await _getPosterEngine();
    const result = await PosterEngine.generate({
      text: state.inputText,
      directorId: current.directorId,
      moodTagId: state.moodTagId,
      format: state.posterFormat,
      showQuote: state.showQuote,
      title: overrides && overrides.title ? overrides.title : state.currentTitle,
      quote: overrides && overrides.quote ? overrides.quote : undefined,
    });

    // 在替换前释放旧海报的 Blob URL，避免内存泄漏
    const oldResult = state.posterResults[state.currentPosterIndex];
    safeRevokeUrl(oldResult?.dataUrl);
    state.posterResults[state.currentPosterIndex] = result;

    // 更新展示
    const isMulti = state.posterResults.length > 1;
    if (!isMulti) {
      $('poster-img').src = result.dataUrl;
    } else {
      renderSeriesGrid();
    }

    $('result-title').textContent = result.title;
    $('poster-format-info').textContent = `${result.width} × ${result.height}`;

    if (result.quote) {
      state.currentQuote = result.quote;
      $('quote-text').textContent = `「${result.quote}」`;
    }
  } catch (err) {
    logger.error('重新生成失败:', err);
    toast('生成失败，请重试');
  } finally {
    state.isGenerating = false;
  }
}

// ========== 重新生成所有海报（版式切换时） ==========
async function regenerateAllPosters() {
  if (state.isGenerating) return;
  state.isGenerating = true;
  try {
    const PosterEngine = await _getPosterEngine();
    if (state.posterFormat === 'grid9') {
      // 切换到九宫格：生成单张合成图
      const gridResult = await PosterEngine.generateGrid9({
        text: state.inputText,
        directorIds: state.selectedDirectorIds,
        moodTagId: state.moodTagId,
        showQuote: state.showQuote,
        title: state.currentTitle,
      });
      // 在替换前释放旧海报的 Blob URL，避免内存泄漏
      if (state.posterResults && state.posterResults.length) {
        state.posterResults.forEach((r) => { safeRevokeUrl(r.dataUrl); });
      }
      state.posterResults = [gridResult];
      state.currentPosterIndex = 0;
    } else {
      // 切换到其他格式：重新生成各导演海报
      const results = [];
      for (const directorId of state.selectedDirectorIds) {
        const result = await PosterEngine.generate({
          text: state.inputText,
          directorId: directorId,
          moodTagId: state.moodTagId,
          format: state.posterFormat,
          showQuote: state.showQuote,
          title: state.currentTitle,
        });
        results.push(result);
      }
      // 在替换前释放旧海报的 Blob URL，避免内存泄漏
      if (state.posterResults && state.posterResults.length) {
        state.posterResults.forEach((r) => { safeRevokeUrl(r.dataUrl); });
      }
      state.posterResults = results;
      state.currentPosterIndex = 0;
    }

    showResultPage();
  } catch (err) {
    logger.error('批量重新生成失败:', err);
    toast('生成失败，请重试');
  } finally {
    state.isGenerating = false;
  }
}

// ========== 下载 ==========
function downloadPoster() {
  const current = state.posterResults[state.currentPosterIndex];
  if (!current) return;
  const link = document.createElement('a');
  link.download = `造境_${current.title}_${current.director}_${Date.now()}.png`;
  // 优先使用带品牌标识的版本
  link.href = current._brandedDataUrl || current.dataUrl;
  link.click();
  toast('海报已保存到下载文件夹');
}

// ========== 分享 ==========
async function sharePoster() {
  const current = state.posterResults[state.currentPosterIndex];
  if (!current) return;
  const shareId = btoa(
    unescape(encodeURIComponent(current.directorId + '|' + current.title + '|' + Date.now()))
  ).substring(0, 16);
  const shareUrl = `${window.location.origin}${window.location.pathname}#share/${shareId}`;

  // 填充分享弹窗（验证 dataUrl 格式，防止恶意 src 注入）
  const shareImgSrc =
    typeof current.dataUrl === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(current.dataUrl)
      ? current.dataUrl
      : '';
  $('share-preview').innerHTML = shareImgSrc ? `<img src="${escapeHtml(shareImgSrc)}" alt="海报预览">` : '';
  // 本地生成二维码（不依赖第三方服务）
  try {
    const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 160, margin: 1 });
    $('share-qr').innerHTML = `<img src="${escapeHtml(qrDataUrl)}" alt="二维码">`;
  } catch (err) {
    logger.warn('二维码生成失败:', err.message);
    $('share-qr').innerHTML = '<p style="color:#8a8478">二维码生成失败</p>';
  }
  $('share-link-input').value = shareUrl;
  openResultToolsModal('share');

  // 存储当前分享URL供下载二维码使用
  $('result-tools-modal').dataset.shareUrl = shareUrl;

  // 生成多平台适配文案
  const platformCopy = generatePlatformCopy(current);
  $('result-tools-modal').dataset.platformCopy = JSON.stringify(platformCopy);
}

function closeShareModal() {
  closeModal('result-tools-modal');
}

function copyShareLink() {
  const link = $('share-link-input').value;
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        toast('链接已复制到剪贴板');
      })
      .catch((err) => { logger.warn('剪贴板写入失败，降级到 execCommand:', err); fallbackCopy(link); });
  } else {
    fallbackCopy(link);
  }
}

async function downloadQRCode() {
  const shareUrl = $('result-tools-modal').dataset.shareUrl;
  if (!shareUrl) return;
  try {
    const qrDataUrl = await QRCode.toDataURL(shareUrl, { width: 400, margin: 1 });
    const link = document.createElement('a');
    link.download = '造境_分享二维码.png';
    link.href = qrDataUrl;
    link.click();
    toast('二维码已下载');
  } catch (err) {
    logger.warn('二维码下载失败:', err.message);
    toast('二维码下载失败');
  }
}

// ========== 多平台分享 ==========
function handlePlatformShare(platform) {
  const current = state.posterResults[state.currentPosterIndex];
  if (!current) return;

  const platformCopy = JSON.parse($('result-tools-modal').dataset.platformCopy || '{}');
  const shareUrl = $('result-tools-modal').dataset.shareUrl || window.location.href;

  const msg = shareToPlatform(platform, {
    text: platformCopy[platform] || current.title || '',
    imageSrc: current.dataUrl,
    url: shareUrl,
  });

  if (msg) {
    toast(msg);
  }
}

function savePosterImage() {
  const current = state.posterResults[state.currentPosterIndex];
  if (!current || !current.dataUrl) {
    toast('海报未就绪');
    return;
  }
  saveImageToLocal(current.dataUrl, `造境_${current.title || '电影海报'}`);
  toast('海报已保存，可在相册或下载文件夹中找到');
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    toast('分享链接已复制到剪贴板');
  } catch (e) {
    toast('复制失败，请手动复制链接');
  }
  document.body.removeChild(textarea);
}

// ========== 历史记录 & 电影墙 ==========
function saveToHistory(result) {
  const director = DIRECTORS.find((d) => d.id === result.directorId);
  const record = {
    id: Date.now() + Math.random(),
    title: result.title,
    director: director ? director.name : result.director,
    directorId: result.directorId,
    format: result.format,
    timestamp: new Date().toISOString(),
  };
  state.history.unshift(record);
  if (state.history.length > 20) state.history = state.history.slice(0, 20);
  try {
    const liteHistory = state.history.slice(0, 10);
    localStorage.setItem('zaojing_history', JSON.stringify(liteHistory));
  } catch (e) {
    logger.warn('历史记录存储失败:', e);
  }

  // 保存到电影墙（含压缩图片）
  saveToWall(result, record);
}

function saveToWall(result, record) {
  try {
    // 将 PNG dataUrl 转为 JPEG 压缩存储
    const img = new Image();
    img.onload = async function () {
      const canvas = document.createElement('canvas');
      // 缩略图尺寸：最大 400px 宽
      const maxW = 400;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const thumbDataUrl = canvas.toDataURL('image/jpeg', 0.75);

      // 默认不存原图，避免存储溢出
      // 原图可通过"再拍一张"重新生成
      const wallItem = {
        id: record.id,
        title: record.title,
        director: record.director,
        directorId: record.directorId,
        format: record.format,
        timestamp: record.timestamp,
        thumb: thumbDataUrl,
      };

      state.wallItems.unshift(wallItem);
      if (state.wallItems.length > 12) state.wallItems = state.wallItems.slice(0, 12);

      try {
        await smartSet('zaojing_wall', state.wallItems);
      } catch (e) {
        // 存储溢出，减少条目数
        while (state.wallItems.length > 6) {
          state.wallItems.pop();
        }
        try {
          await smartSet('zaojing_wall', state.wallItems);
        } catch (e2) {
          logger.warn('电影墙存储失败:', e2);
          toast('存储空间不足，电影墙仅保留最新作品');
        }
      }
    };
    img.onerror = function () {
      logger.warn('电影墙保存失败: 图片加载失败');
      toast('保存到电影墙失败');
    };
    img.src = result.dataUrl;
  } catch (e) {
    logger.warn('电影墙保存失败:', e);
  }
}

async function loadWall() {
  try {
    const stored = await smartGet('zaojing_wall');
    if (stored) {
      // smartGet 对 JSON 数据会自动解析，但也可能返回字符串
      state.wallItems = typeof stored === 'string' ? JSON.parse(stored) : stored;
    }
  } catch (e) {
    logger.warn('电影墙读取失败:', e);
  }
}

async function deleteWallItem(id) {
  state.wallItems = state.wallItems.filter((item) => item.id !== id);
  try {
    await smartSet('zaojing_wall', state.wallItems);
  } catch (e) {
    logger.warn('电影墙更新失败:', e);
  }
  renderWallGrid();
}

async function clearWall() {
  state.wallItems = [];
  try {
    await smartDelete('zaojing_wall');
  } catch (e) {
    logger.warn('电影墙清空失败:', e);
  }
  renderWallGrid();
}

function loadHistory() {
  try {
    const stored = localStorage.getItem('zaojing_history');
    if (stored) state.history = JSON.parse(stored);
  } catch (e) {
    logger.warn('历史记录读取失败:', e);
  }
}

// ========== 重新生成（随机新金句） ==========
async function regenerate() {
  if (state.isGenerating) return;
  state.isGenerating = true;
  toast('正在重新拍摄…');
  try {
    // 重新生成所有海报（会得到新的随机金句）
    const PosterEngine = await _getPosterEngine();
    for (let i = 0; i < state.posterResults.length; i++) {
      const old = state.posterResults[i];
      const result = await PosterEngine.generate({
        text: state.inputText,
        directorId: old.directorId,
        moodTagId: state.moodTagId,
        format: state.posterFormat,
        showQuote: state.showQuote,
        title: i === state.currentPosterIndex ? state.currentTitle : undefined,
      });
      // 释放旧海报的 Blob URL，防止内存泄漏
      safeRevokeUrl(old.blobUrl);
      state.posterResults[i] = result;
      saveToHistory(result);
    }

    const current = state.posterResults[state.currentPosterIndex];
    const isMulti = state.posterResults.length > 1;
    if (!isMulti) {
      $('poster-img').src = current.dataUrl;
    } else {
      renderSeriesGrid();
    }
    state.currentQuote = current.quote;
    $('quote-text').textContent = current.quote ? `「${current.quote}」` : '';
    toast('重新拍摄完成！');
  } catch (err) {
    logger.error('重新生成失败:', err);
    toast('生成失败，请重试');
  } finally {
    state.isGenerating = false;
  }
}

// ========== 换一句金句 ==========
async function refreshQuote() {
  if (state.isGenerating) return;
  const current = state.posterResults[state.currentPosterIndex];
  const newQuote = getRandomQuote(current.directorId, state.currentQuote);
  if (!newQuote || newQuote === state.currentQuote) {
    toast('暂无更多金句');
    return;
  }
  state.currentQuote = newQuote;
  await regenerateCurrentPoster({ quote: newQuote });
  toast('已换一句金句');
}

// ========== 电影墙页面 ==========
function initWallPage() {
  renderWallGrid();
  navigate('wall');
}

function renderWallGrid() {
  const grid = $('wall-grid');
  const empty = $('wall-empty');
  const actions = $('wall-actions');
  const countEl = $('wall-count');

  if (state.wallItems.length === 0) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    empty.style.display = 'block';
    actions.style.display = 'none';
    countEl.textContent = '你的电影海报作品集';
    return;
  }

  grid.style.display = 'grid';
  empty.style.display = 'none';
  actions.style.display = 'flex';
  countEl.textContent = `共 ${state.wallItems.length} 件作品`;

  grid.innerHTML = '';
  state.wallItems.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'wall-item';
    el.style.animationDelay = i * 0.05 + 's';

    const date = new Date(item.timestamp);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;

    el.innerHTML = `
      <img data-src="${escapeHtml(item.thumb || item.fullImage)}" alt="${escapeHtml(item.title)}">
      <button class="wall-delete" data-id="${escapeHtml(item.id)}" title="删除">×</button>
      <div class="wall-overlay">
        <div class="wall-title">${escapeHtml(item.title)}</div>
        <div class="wall-meta">${escapeHtml(item.director)} · ${dateStr}</div>
      </div>
    `;

    // 点击查看大图/下载
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('wall-delete')) return;
      const fullImage = item.fullImage || item.thumb;
      if (fullImage) {
        const link = document.createElement('a');
        link.download = `造境_${item.title}_${item.director}.png`;
        link.href = fullImage;
        link.click();
        toast('海报已下载');
      }
    });

    // 删除按钮
    const deleteBtn = el.querySelector('.wall-delete');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWallItem(item.id);
      toast('已删除');
    });

    grid.appendChild(el);
  });

  // 扫描电影墙中的懒加载图片
  lazyLoadAll();
}

// ========== 海报动效化 ==========

let _currentVideoBlob = null;

function openAnimateModal() {
  const current = state.posterResults[state.currentPosterIndex];
  if (!current || !current.dataUrl) {
    toast('海报未就绪');
    return;
  }
  if (!isAnimationSupported()) {
    toast('当前浏览器不支持视频录制，请使用 Chrome 或 Firefox');
    return;
  }

  // 渲染动效选项
  const presetsContainer = $('animate-presets');
  presetsContainer.innerHTML = '';
  for (const preset of ANIMATION_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'animate-preset-btn';
    btn.innerHTML = `<strong>${preset.label}</strong><br><small>${preset.desc}</small>`;
    btn.onclick = () => generateAnimation(preset.id);
    presetsContainer.appendChild(btn);
  }

  // 重置状态
  $('animate-progress').style.display = 'none';
  $('animate-video').style.display = 'none';
  $('animate-actions').style.display = 'none';
  _currentVideoBlob = null;

  openResultToolsModal('animate');
}

function closeAnimateModal() {
  closeModal('result-tools-modal');
  _currentVideoBlob = null;
}

async function generateAnimation(effect) {
  const current = state.posterResults[state.currentPosterIndex];
  if (!current || !current.dataUrl) return;

  $('animate-presets').style.display = 'none';
  $('animate-progress').style.display = 'block';
  $('animate-progress-bar').style.width = '0%';
  $('animate-progress-text').textContent = '生成中...';

  try {
    const blob = await animatePoster({
      dataUrl: current.dataUrl,
      effect,
      duration: 5000,
      onProgress: (p) => {
        $('animate-progress-bar').style.width = `${p * 100}%`;
        $('animate-progress-text').textContent = `生成中... ${Math.round(p * 100)}%`;
      },
    });

    _currentVideoBlob = blob;
    const videoUrl = URL.createObjectURL(blob);
    const video = $('animate-video');
    video.src = videoUrl;
    video.style.display = 'block';
    $('animate-progress').style.display = 'none';
    $('animate-actions').style.display = 'flex';
    toast('动效生成完成');
  } catch (err) {
    logger.error('动效生成失败:', err);
    $('animate-progress-text').textContent = `生成失败: ${err.message}`;
    $('animate-presets').style.display = 'flex';
  }
}

function downloadAnimationVideo() {
  if (!_currentVideoBlob) {
    toast('视频未就绪');
    return;
  }
  const current = state.posterResults[state.currentPosterIndex];
  downloadVideoBlob(_currentVideoBlob, `造境_${current.title || '动效海报'}`);
  toast('视频已开始下载');
}

// ========== 导出 ==========
export {
  showResultPage,
  renderMovieInfo,
  renderReview,
  renderDirectorNotes,
  renderSeriesGrid,
  initTitleSelector,
  initFormatSelector,
  regenerateCurrentPoster,
  regenerateAllPosters,
  regenerate,
  downloadPoster,
  sharePoster,
  closeShareModal,
  copyShareLink,
  downloadQRCode,
  handlePlatformShare,
  savePosterImage,
  fallbackCopy,
  saveToHistory,
  saveToWall,
  loadWall,
  deleteWallItem,
  clearWall,
  loadHistory,
  refreshQuote,
  initWallPage,
  renderWallGrid,
  loadPlatformCopy,
  renderPlatformCopy,
  openAnimateModal,
  closeAnimateModal,
  downloadAnimationVideo,
};
