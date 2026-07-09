// pages/directors.js — 导演页模块
// 从 app.js 提取的导演页相关函数：DNA 雷达图、导演多选、情绪光谱可视化与交互。
import { $, state, toast, escapeHtml } from '../shared.js';
import {
  DIRECTORS,
  EMOTION_SPECTRUM,
  EMOTION_KEYWORDS,
  getEmotionFromMood,
  getStyleDNAValues,
} from '../data.js';

// ========== DNA 雷达图 ==========

// 绘制DNA雷达图到 canvas（新版，8维度雷达图）
export function drawDNARadar(canvas, styleDNA, label) {
  if (!canvas || !styleDNA) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const showLabels = w >= 100;
  const radius = Math.min(w, h) / 2 - (showLabels ? 20 : 8);

  ctx.clearRect(0, 0, w, h);

  // 8个维度
  const dimensions = ['色温', '饱和', '对比', '构图', '光影', '尺度', '节奏', '质感'];
  const values = getStyleDNAValues(styleDNA);
  const n = dimensions.length;

  // 绘制网格（3层）
  for (let layer = 1; layer <= 3; layer++) {
    const r = radius * layer / 3;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(245,240,232,${0.05 + layer * 0.03})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 绘制轴线
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.strokeStyle = 'rgba(245,240,232,0.08)';
    ctx.stroke();
  }

  // 绘制数据多边形
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const r = radius * values[i];
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(127,196,171,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(127,196,171,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 绘制顶点
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const r = radius * values[i];
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(127,196,171,0.9)';
    ctx.fill();
  }

  // 绘制轴标签（仅大画布显示）
  if (showLabels) {
    ctx.font = '9px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(245,240,232,0.5)';
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
      const labelR = radius + 12;
      const x = cx + Math.cos(angle) * labelR;
      const y = cy + Math.sin(angle) * labelR;
      ctx.fillText(dimensions[i], x, y);
    }
  }
}

// ========== 导演页初始化 ==========

/**
 * 初始化导演页
 * @param {Object} callbacks - 跨页面/留在 app.js 中的函数回调
 * @param {Function} [callbacks.renderStyleRecommendations] - 渲染情绪→风格推荐列表
 * @param {Function} [callbacks.initStyleSourceTabs] - 初始化风格来源切换
 * @param {Function} [callbacks.initDirectorSearch] - 初始化搜索框
 * @param {Function} [callbacks.initCustomStylePanel] - 初始化自定义风格面板
 * @param {Function} [callbacks.initMovieStylePanel] - 初始化电影分析面板
 * @param {Function} [callbacks.initBlendStylePanel] - 初始化风格混搭面板
 * @param {Function} [callbacks.loadCustomStyles] - 加载已保存的自定义风格
 * @param {Function} [callbacks.renderSavedStyles] - 渲染已保存的自定义风格
 */
export function initDirectorsPage(callbacks = {}) {
  const {
    renderStyleRecommendations,
    initStyleSourceTabs,
    initDirectorSearch,
    initCustomStylePanel,
    initMovieStylePanel,
    initBlendStylePanel,
    loadCustomStyles,
    renderSavedStyles,
  } = callbacks;

  const grid = $('director-grid');
  grid.innerHTML = '';

  // 渲染情绪光谱可视化
  renderEmotionSpectrum();
  // 初始化情绪光谱交互（滑块拖动、情绪切换）
  initSpectrumInteraction();

  // 如果有 AI 分析结果，自动选中推荐导演
  if (state.emotionAnalysis && state.emotionAnalysis.recommendedDirectors && state.selectedDirectorIds.length === 0) {
    state.selectedDirectorIds = state.emotionAnalysis.recommendedDirectors.slice(0, 2).map(d => d.directorId);
  }

  // 显示 AI 情绪分析结果
  const heroSub = document.querySelector('#page-directors .director-hero p');
  if (heroSub && state.emotionAnalysis) {
    const ea = state.emotionAnalysis;
    heroSub.innerHTML = `AI 识别情绪：<strong style="color:var(--accent)">${escapeHtml(ea.primaryEmotion)}</strong> · 推荐导演已标记 <span class="ai-badge">AI</span>`;
  }

  DIRECTORS.forEach(director => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'director-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', state.selectedDirectorIds.includes(director.id) ? 'true' : 'false');
    card.setAttribute('aria-label', `选择导演 ${director.name}`);
    card.dataset.id = director.id;
    if (state.selectedDirectorIds.includes(director.id)) card.classList.add('selected');
    card.style.setProperty('--dir-color', director.colors.primary);

    // 查找 AI 推荐信息
    const aiRec = state.emotionAnalysis && state.emotionAnalysis.recommendedDirectors
      ? state.emotionAnalysis.recommendedDirectors.find(r => r.directorId === director.id)
      : null;

    const aiBadge = aiRec
      ? `<div class="ai-rec-badge" title="${escapeHtml(aiRec.reason || '')}">AI推荐 ${escapeHtml(String(aiRec.matchScore || 0))}%</div>`
      : '';

    card.innerHTML = `
      <div class="check-mark">✓</div>
      ${aiBadge}
      <div class="avatar">${director.avatar}</div>
      <div class="name">${director.name}</div>
      <div class="en-name">${director.enName}</div>
      <div class="tagline">${director.tagline}</div>
      ${aiRec ? `<div class="ai-rec-reason">${escapeHtml(aiRec.reason || '')}</div>` : ''}
      <canvas class="dna-radar" width="80" height="80" style="display:none"></canvas>
    `;

    card.addEventListener('click', () => {
      toggleDirector(director.id);
    });

    grid.appendChild(card);
  });

  // 为每张导演卡片绘制 DNA 雷达图
  document.querySelectorAll('.director-card').forEach(card => {
    const directorId = card.dataset.id;
    const director = DIRECTORS.find(d => d.id === directorId);
    if (director && director.styleDNA) {
      const canvas = card.querySelector('canvas.dna-radar');
      if (canvas) {
        drawDNARadar(canvas, director.styleDNA);
        canvas.style.display = 'block';
      }
    }
  });

  updateSelectCount();

  // 默认选宫崎骏（如果未选任何导演且没有 AI 推荐）
  if (state.selectedDirectorIds.length === 0) {
    toggleDirector('miyazaki');
  }

  // 渲染情绪→风格推荐列表
  if (typeof renderStyleRecommendations === 'function') renderStyleRecommendations();

  // 初始化风格来源切换
  if (typeof initStyleSourceTabs === 'function') initStyleSourceTabs();

  // 初始化搜索框
  if (typeof initDirectorSearch === 'function') initDirectorSearch();

  // 初始化自定义风格面板
  if (typeof initCustomStylePanel === 'function') initCustomStylePanel();

  // 初始化电影分析面板
  if (typeof initMovieStylePanel === 'function') initMovieStylePanel();

  // 初始化风格混搭面板
  if (typeof initBlendStylePanel === 'function') initBlendStylePanel();

  // 加载已保存的自定义风格
  if (typeof loadCustomStyles === 'function') loadCustomStyles();
  if (typeof renderSavedStyles === 'function') renderSavedStyles();
}

// ========== 导演多选 ==========

export function toggleDirector(id) {
  const idx = state.selectedDirectorIds.indexOf(id);
  if (idx > -1) {
    // 如果只有一个了，不允许取消
    if (state.selectedDirectorIds.length <= 1) {
      toast('至少选择一位导演');
      return;
    }
    state.selectedDirectorIds.splice(idx, 1);
  } else {
    state.selectedDirectorIds.push(id);
  }

  // 更新卡片视觉
  document.querySelectorAll('.director-card').forEach(card => {
    const id = card.dataset.id;
    const isSelected = state.selectedDirectorIds.includes(id);
    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });

  updateSelectCount();
}

// ========== 更新选择计数 ==========

export function updateSelectCount() {
  const count = state.selectedDirectorIds.length;
  const countEl = $('select-count');
  countEl.textContent = `已选 ${count} 位`;
  countEl.classList.toggle('has-selection', count > 0);
  $('btn-generate').disabled = count === 0;

  // 更新生成按钮文案
  const genBtn = $('btn-generate');
  if (count === 0) {
    genBtn.textContent = '请选择导演';
  } else if (count === 1) {
    genBtn.textContent = '让 AI 拍摄你的电影 →';
  } else {
    genBtn.textContent = `拍摄 ${count} 张系列海报 →`;
  }
}

// ========== 情绪光谱可视化 ==========

export function renderEmotionSpectrum() {
  const spectrum = $('emotion-spectrum');
  if (!spectrum) return;

  let emotion, intensity, keywords;

  if (state.emotionAnalysis && state.emotionAnalysis.primaryEmotion) {
    // 有 AI 分析结果时，使用 AI 识别的情绪
    emotion = state.emotionAnalysis.primaryEmotion;
    intensity = state.emotionAnalysis.emotionIntensity || (Math.floor(Math.random() * 4) + 6);
    keywords = (state.emotionAnalysis.keywords && state.emotionAnalysis.keywords.length > 0)
      ? state.emotionAnalysis.keywords
      : null;
  } else if (state.moodTagId) {
    // 没有 AI 分析结果时，根据心情标签显示默认情绪
    emotion = getEmotionFromMood(state.moodTagId) || '治愈';
    intensity = Math.floor(Math.random() * 4) + 6; // 6-9 随机
    keywords = EMOTION_KEYWORDS[state.moodTagId] || null;
  } else {
    // 都没有时，显示默认情绪
    emotion = '治愈';
    intensity = 7;
    keywords = null;
  }

  const config = EMOTION_SPECTRUM[emotion] || EMOTION_SPECTRUM['治愈'];

  // 更新强度标签
  $('spectrum-intensity').textContent = `${emotion} · 强度 ${intensity}/10`;

  // 更新渐变色条
  const bar = $('spectrum-bar');
  bar.style.background = config.gradient;
  bar.style.width = (intensity * 10) + '%';

  // 更新滑块位置
  const slider = $('spectrum-slider');
  if (slider) {
    slider.style.left = (intensity * 10) + '%';
  }

  // 渲染情绪类型快捷选择按钮（取前8个常用情绪）
  const emotionsEl = $('spectrum-emotions');
  if (emotionsEl) {
    emotionsEl.innerHTML = '';
    const emotionKeys = Object.keys(EMOTION_SPECTRUM).slice(0, 8);
    emotionKeys.forEach(emo => {
      const chip = document.createElement('span');
      chip.className = 'spectrum-emotion-chip';
      chip.textContent = emo;
      chip.dataset.emotion = emo;
      if (emo === emotion) chip.classList.add('active');
      emotionsEl.appendChild(chip);
    });
  }

  // 更新关键词标签
  const keywordsEl = $('spectrum-keywords');
  keywordsEl.innerHTML = '';
  const keywordList = keywords && keywords.length > 0 ? keywords : config.keywords;
  keywordList.forEach(kw => {
    const tag = document.createElement('span');
    tag.className = 'spectrum-keyword';
    tag.textContent = kw;
    keywordsEl.appendChild(tag);
  });

  spectrum.style.display = 'block';
}

// ========== 情绪光谱交互 ==========
// 模块级变量，避免重复绑定
let _spectrumDragState = { isDragging: false, track: null, slider: null };
let _spectrumHandlersBound = false;
let _globalKeyHandler = null;

export function _spectrumMouseMove(e) {
  if (!_spectrumDragState.isDragging) return;
  _updateIntensityFromPosition(e.clientX);
}
export function _spectrumMouseUp() {
  if (_spectrumDragState.isDragging) {
    _spectrumDragState.isDragging = false;
    if (_spectrumDragState.slider) _spectrumDragState.slider.classList.remove('dragging');
  }
}
export function _spectrumTouchMove(e) {
  if (!_spectrumDragState.isDragging) return;
  if (e.touches.length > 0) {
    _updateIntensityFromPosition(e.touches[0].clientX);
  }
}
export function _spectrumTouchEnd() {
  if (_spectrumDragState.isDragging) {
    _spectrumDragState.isDragging = false;
    if (_spectrumDragState.slider) _spectrumDragState.slider.classList.remove('dragging');
  }
}

export function _updateIntensityFromPosition(clientX) {
  const track = _spectrumDragState.track;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  let percent = (clientX - rect.left) / rect.width;
  percent = Math.max(0, Math.min(1, percent));
  const intensity = Math.max(1, Math.min(10, Math.round(percent * 10)));

  if (!state.emotionAnalysis) state.emotionAnalysis = {};
  state.emotionAnalysis.emotionIntensity = intensity;

  const slider = _spectrumDragState.slider;
  if (slider) slider.style.left = (intensity * 10) + '%';
  const bar = $('spectrum-bar');
  if (bar) bar.style.width = (intensity * 10) + '%';

  const emotion = state.emotionAnalysis.primaryEmotion || '治愈';
  $('spectrum-intensity').textContent = `${emotion} · 强度 ${intensity}/10`;
}

export function initSpectrumInteraction() {
  const track = $('spectrum-track');
  const slider = $('spectrum-slider');
  if (!track || !slider) return;

  _spectrumDragState.track = track;
  _spectrumDragState.slider = slider;

  // 只绑定一次 document 级监听器
  if (!_spectrumHandlersBound) {
    document.addEventListener('mousemove', _spectrumMouseMove);
    document.addEventListener('mouseup', _spectrumMouseUp);
    document.addEventListener('touchmove', _spectrumTouchMove, { passive: false });
    document.addEventListener('touchend', _spectrumTouchEnd);
    _spectrumHandlersBound = true;
  }

  // slider 上的事件用 onclick 属性赋值避免重复绑定
  slider.onmousedown = (e) => {
    _spectrumDragState.isDragging = true;
    slider.classList.add('dragging');
    e.preventDefault();
  };
  slider.ontouchstart = (e) => {
    _spectrumDragState.isDragging = true;
    slider.classList.add('dragging');
    e.preventDefault();
  };

  track.onclick = (e) => {
    if (e.target === slider) return;
    _updateIntensityFromPosition(e.clientX);
  };

  const emotionsEl = $('spectrum-emotions');
  if (emotionsEl) {
    emotionsEl.onclick = (e) => {
      const chip = e.target.closest('.spectrum-emotion-chip');
      if (!chip) return;
      const emotion = chip.dataset.emotion;
      const config = EMOTION_SPECTRUM[emotion];
      if (!config) return;

      emotionsEl.querySelectorAll('.spectrum-emotion-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      if (!state.emotionAnalysis) state.emotionAnalysis = {};
      state.emotionAnalysis.primaryEmotion = emotion;

      const bar = $('spectrum-bar');
      if (bar) bar.style.background = config.gradient;

      const keywordsEl = $('spectrum-keywords');
      if (keywordsEl) {
        keywordsEl.innerHTML = '';
        config.keywords.forEach(kw => {
          const tag = document.createElement('span');
          tag.className = 'spectrum-keyword';
          tag.textContent = kw;
          keywordsEl.appendChild(tag);
        });
      }

      const intensity = state.emotionAnalysis.emotionIntensity || 7;
      $('spectrum-intensity').textContent = `${emotion} · 强度 ${intensity}/10`;
    };
  }
}

export default initDirectorsPage;
