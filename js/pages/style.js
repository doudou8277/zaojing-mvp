/**
 * 造境 ZaoJing — 风格页模块
 * 从 app.js 提取：风格来源切换 / 自定义风格创建 / 电影风格分析 / 风格混搭
 */

import { $, state, toast, escapeHtml, sanitizeColor, openModal, closeModal } from '../shared.js';
import { logger } from '../utils/logger.js';
import { createModuleBoundary } from '../utils/error-boundary.js';
import * as AIClient from '../ai-client';
import { DIRECTORS, blendHexColors } from '../data.js';

// showToast 别名（兼容风格创建等新功能中的调用）
const showToast = toast;

// 模块级错误边界：包装风格相关异步操作，捕获错误后降级处理
const styleBoundary = createModuleBoundary('StyleManager');

// ========== 依赖注入 ==========
// drawDNARadar 和 initDirectorsPage 原本定义在 app.js 模块作用域内，
// 此处通过 setupStylePage 由 app.js 注入，避免循环依赖。
let _drawDNARadar = null;
let _initDirectorsPage = null;

/**
 * 初始化风格页模块，注入 app.js 中的依赖
 * @param {Object} deps
 * @param {Function} deps.drawDNARadar      - DNA 雷达图绘制函数
 * @param {Function} deps.initDirectorsPage  - 导演选择页初始化函数
 */
export function setupStylePage({ drawDNARadar, initDirectorsPage }) {
  // 风格编辑器 Tab 切换
  document.querySelectorAll('.style-editor-tab').forEach((btn) => {
    btn.onclick = () => switchStyleTab(btn.dataset.styleTab);
  });
  // zj:close 事件清理
  const styleEditorEl = document.querySelector('zj-modal[modal-id="style-editor-modal"]');
  if (styleEditorEl) {
    styleEditorEl.addEventListener('zj:close', () => {
      // 清理预览状态
      $('style-preview').style.display = 'none';
      $('movie-preview').style.display = 'none';
      $('blend-preview').style.display = 'none';
    });
  }

  _drawDNARadar = drawDNARadar;
  _initDirectorsPage = initDirectorsPage;
}

// ========== 风格来源切换 ==========
function initStyleSourceTabs() {
  document.querySelectorAll('.source-tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('.source-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.styleSource = tab.dataset.source;
      // 切换面板显示
      $('custom-style-panel').style.display = state.styleSource === 'custom' ? 'block' : 'none';
      $('movie-style-panel').style.display = state.styleSource === 'movie' ? 'block' : 'none';
      $('blend-style-panel').style.display = state.styleSource === 'blend' ? 'block' : 'none';
      $('director-grid').style.display = state.styleSource === 'preset' ? 'grid' : 'none';
    };
  });
}

// ========== 导演搜索 ==========
function initDirectorSearch() {
  const searchInput = $('director-search-input');
  if (!searchInput) return;
  // 防抖：避免快速输入时频繁遍历 DOM
  let debounceTimer = null;
  searchInput.oninput = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = searchInput.value.trim().toLowerCase();
      document.querySelectorAll('.director-card').forEach((card) => {
        const name = card.querySelector('.name')?.textContent.toLowerCase() || '';
        const tagline = card.querySelector('.tagline')?.textContent.toLowerCase() || '';
        card.style.display = !query || name.includes(query) || tagline.includes(query) ? '' : 'none';
      });
    }, 200);
  };
}

// ========== 自定义风格面板初始化 ==========
function initCustomStylePanel() {
  // 预设风格芯片点击（用 onclick 避免重复绑定）
  document.querySelectorAll('.style-preset-chip').forEach((chip) => {
    chip.onclick = () => {
      const input = $('custom-style-input');
      if (input) input.value = chip.dataset.preset;
    };
  });

  // 内联"AI 解析风格"按钮
  const btnParseInline = $('btn-parse-style-inline');
  if (btnParseInline) {
    btnParseInline.onclick = async () => {
      const input = $('custom-style-input');
      if (!input || !input.value.trim()) {
        toast('请输入风格描述');
        return;
      }
      openStyleCreateModal();
      $('style-description-input').value = input.value;
      await parseCustomStyle();
    };
  }
}

// ========== 电影风格面板初始化 ==========
function initMovieStylePanel() {
  // 内联面板的按钮事件（使用 -inline 后缀的 ID，用 onclick 避免重复绑定）
  const btnAnalyze = $('btn-analyze-movie-inline');
  if (btnAnalyze) {
    btnAnalyze.onclick = async () => {
      const input = $('movie-name-input-inline');
      if (!input || !input.value.trim()) {
        toast('请输入电影名称');
        return;
      }
      openMovieStyleModal();
      $('movie-name-input').value = input.value;
      await analyzeMovieStyle();
    };
  }
}

// ========== 风格混搭面板初始化 ==========
function initBlendStylePanel() {
  // 填充内联面板的下拉框
  const inlineA = $('blend-director-a-inline');
  const inlineB = $('blend-director-b-inline');
  if (inlineA && inlineA.children.length <= 1) {
    DIRECTORS.forEach((d) => {
      const optA = document.createElement('option');
      optA.value = d.id;
      optA.textContent = d.name;
      inlineA.appendChild(optA);
      const optB = optA.cloneNode(true);
      inlineB.appendChild(optB);
    });
    if (DIRECTORS.length > 1) inlineB.selectedIndex = 1;
  }

  // 内联面板的按钮事件（使用 -inline 后缀的 ID，用 onclick 避免重复绑定）
  const btnBlend = $('btn-blend-style-inline');
  if (btnBlend) {
    btnBlend.onclick = async () => {
      openBlendModal();
      // 同步内联面板的选择到弹窗
      const modalA = $('blend-director-a');
      const modalB = $('blend-director-b');
      if (inlineA && inlineA.value && modalA) modalA.value = inlineA.value;
      if (inlineB && inlineB.value && modalB) modalB.value = inlineB.value;
    };
  }
}

// ========== 加载已保存的自定义风格 ==========
function loadCustomStyles() {
  try {
    const saved = localStorage.getItem('zaojing_custom_styles');
    if (saved) {
      state.customStyles = JSON.parse(saved);
    }
  } catch (e) {
    logger.warn('加载自定义风格失败:', e);
  }
}

// ========== 渲染已保存的风格列表 ==========
function renderSavedStyles() {
  const listEl = $('saved-styles-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (state.customStyles.length === 0) {
    listEl.innerHTML = '<p style="font-size:.8rem;color:var(--ink-faint);padding:8px 0">暂无保存的风格</p>';
    return;
  }
  state.customStyles.forEach((s) => {
    const el = document.createElement('div');
    el.className = 'saved-style-item';
    el.innerHTML = `
      <div class="saved-style-avatar">${escapeHtml(s.avatar || '🎨')}</div>
      <div class="saved-style-info">
        <div class="saved-style-name">${escapeHtml(s.name)}</div>
        <div class="saved-style-desc">${escapeHtml(s.styleDesc || '')}</div>
      </div>
      <button class="saved-style-delete" data-id="${escapeHtml(s.id)}" title="删除">×</button>
    `;
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('saved-style-delete')) return;
      state.selectedDirectorIds = [s.id];
      toast(`已选择风格「${s.name}」`);
      _initDirectorsPage();
    });
    el.querySelector('.saved-style-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      state.customStyles = state.customStyles.filter((cs) => cs.id !== s.id);
      try {
        localStorage.setItem('zaojing_custom_styles', JSON.stringify(state.customStyles));
      } catch (err) {
        logger.warn('删除风格后保存失败:', err);
      }
      renderSavedStyles();
      toast('已删除风格');
    });
    listEl.appendChild(el);
  });
}

// ========== 渲染情绪→风格推荐列表 ==========
function renderStyleRecommendations() {
  const wrap = $('style-recommendations-wrap');
  if (!wrap) return;
  if (!state.emotionAnalysis || !state.emotionAnalysis.recommendedDirectors) {
    wrap.style.display = 'none';
    return;
  }
  const container = $('style-recommendations');
  if (!container) return;
  container.innerHTML = '';
  state.emotionAnalysis.recommendedDirectors.forEach((rec) => {
    const director = DIRECTORS.find((d) => d.id === rec.directorId);
    if (!director) return;
    const el = document.createElement('div');
    el.className = 'recommendation-item';
    el.innerHTML = `
      <div class="rec-avatar">${director.avatar}</div>
      <div class="rec-info">
        <div class="rec-name">${director.name}</div>
        <div class="rec-tag">${director.tagline}</div>
      </div>
      <div class="rec-score">${escapeHtml(String(rec.matchScore || 0))}%</div>
    `;
    el.addEventListener('click', () => {
      if (!state.selectedDirectorIds.includes(director.id)) {
        state.selectedDirectorIds.push(director.id);
      }
      _initDirectorsPage();
    });
    container.appendChild(el);
  });
  wrap.style.display = 'block';
}

// ========== 风格编辑器：打开 + Tab 切换 ==========
function openStyleEditor(tab) {
  openModal('style-editor-modal');
  switchStyleTab(tab);
}

function switchStyleTab(tab) {
  document.querySelectorAll('.style-editor-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.styleTab === tab);
  });
  document.querySelectorAll('.style-editor-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.stylePanel === tab);
  });
}

// ========== 自定义风格创建 ==========

// 打开风格创建弹窗
function openStyleCreateModal() {
  openStyleEditor('custom');
  $('style-description-input').value = '';
  $('style-preview').style.display = 'none';
  $('style-loading').style.display = 'none';
}

// 解析自定义风格
async function parseCustomStyle() {
  const desc = $('style-description-input').value.trim();
  if (!desc) {
    showToast('请输入风格描述');
    return;
  }

  $('style-loading').style.display = 'block';
  $('style-preview').style.display = 'none';

  try {
    // 错误边界包装：AI 解析失败时降级为本地风格生成
    const result = await styleBoundary.run(
      () => AIClient.parseCustomStyle(desc),
      () => {
        showToast('AI 服务不可用，已使用本地解析');
        return localParseStyle(desc);
      }
    );
    state.currentCustomStyle = result;
    showStylePreview(
      result,
      'style-preview',
      'preview-name',
      'preview-desc',
      'preview-keywords',
      'preview-colors',
      'preview-dna-radar'
    );
  } finally {
    $('style-loading').style.display = 'none';
  }
}

// 本地风格解析（降级方案）
function localParseStyle(desc) {
  const lower = desc.toLowerCase();
  let colors, keywords, styleDNA, name, styleDesc;

  if (lower.includes('赛博') || lower.includes('neon') || lower.includes('霓虹')) {
    colors = {
      primary: '#e91e63',
      secondary: '#00e5ff',
      accent: '#e040fb',
      bg: '#0a0a1a',
      text: '#e6e6fa',
      textLight: '#9e9eae',
    };
    keywords = ['霓虹', '雨夜', '未来'];
    styleDNA = {
      colorTemperature: 'cool',
      saturation: 'high',
      contrast: 'high',
      compositionType: 'asymmetric',
      lightingType: 'dramatic',
      scale: 'monumental',
      pace: 'dynamic',
      texture: 'grainy',
    };
    name = '赛博朋克';
    styleDesc = '霓虹灯与雨夜的未来都市美学';
  } else if (lower.includes('复古') || lower.includes('retro') || lower.includes('怀旧')) {
    colors = {
      primary: '#d4a843',
      secondary: '#8b6914',
      accent: '#c0392b',
      bg: '#2d1f0f',
      text: '#f0e0c0',
      textLight: '#c9a96e',
    };
    keywords = ['复古', '暖黄', '胶片'];
    styleDNA = {
      colorTemperature: 'warm',
      saturation: 'medium',
      contrast: 'medium',
      compositionType: 'centered',
      lightingType: 'natural',
      scale: 'intimate',
      pace: 'static',
      texture: 'grainy',
    };
    name = '复古胶片';
    styleDesc = '温暖胶片质感的怀旧美学';
  } else if (lower.includes('极简') || lower.includes('minimal') || lower.includes('简约')) {
    colors = {
      primary: '#ffffff',
      secondary: '#e0e0e0',
      accent: '#333333',
      bg: '#f5f5f5',
      text: '#212121',
      textLight: '#757575',
    };
    keywords = ['极简', '留白', '纯粹'];
    styleDNA = {
      colorTemperature: 'neutral',
      saturation: 'low',
      contrast: 'medium',
      compositionType: 'symmetric',
      lightingType: 'natural',
      scale: 'medium',
      pace: 'static',
      texture: 'smooth',
    };
    name = '极简主义';
    styleDesc = '少即是多的克制美学';
  } else if (lower.includes('水彩') || lower.includes('watercolor') || lower.includes('水墨')) {
    colors = {
      primary: '#7fc4ab',
      secondary: '#a8c8b5',
      accent: '#e8c5c5',
      bg: '#f5f0e8',
      text: '#3d4e37',
      textLight: '#6d7a5a',
    };
    keywords = ['水彩', '晕染', '意境'];
    styleDNA = {
      colorTemperature: 'warm',
      saturation: 'medium',
      contrast: 'low',
      compositionType: 'asymmetric',
      lightingType: 'natural',
      scale: 'medium',
      pace: 'static',
      texture: 'smooth',
    };
    name = '水彩意境';
    styleDesc = '水墨晕染的东方写意美学';
  } else {
    // 通用风格
    colors = {
      primary: '#6a8caf',
      secondary: '#9db4c0',
      accent: '#c9b458',
      bg: '#1a2332',
      text: '#e8e0c8',
      textLight: '#b8a878',
    };
    keywords = desc
      .slice(0, 10)
      .split(/[，,、\s]+/)
      .filter((k) => k)
      .slice(0, 5);
    styleDNA = {
      colorTemperature: 'cool',
      saturation: 'medium',
      contrast: 'medium',
      compositionType: 'asymmetric',
      lightingType: 'natural',
      scale: 'medium',
      pace: 'dynamic',
      texture: 'smooth',
    };
    name = '自定义风格';
    styleDesc = desc.slice(0, 30);
  }

  return {
    name,
    styleDesc,
    colors,
    keywords,
    styleDNA,
    promptCore: `${desc}, cinematic style, high quality`,
    negativePrompt: 'low quality, blurry, distorted',
    emotions: [],
    quotes: ['风格即态度，每一帧都是表达。'],
  };
}

// 显示风格预览（通用函数，供创建/电影/混搭弹窗复用）
function showStylePreview(style, previewId, nameId, descId, keywordsId, colorsId, dnaCanvasId) {
  const preview = $(previewId);
  $(nameId).textContent = style.name || '自定义风格';
  $(descId).textContent = style.styleDesc || '';

  // 渲染关键词标签
  const keywordsEl = $(keywordsId);
  if (keywordsEl) {
    keywordsEl.innerHTML = '';
    (style.keywords || []).forEach((kw) => {
      const tag = document.createElement('span');
      tag.className = 'preview-keyword';
      tag.textContent = kw;
      keywordsEl.appendChild(tag);
    });
  }

  // 色彩预览
  const colorsEl = $(colorsId);
  if (colorsEl) {
    colorsEl.innerHTML = '';
    const colors = style.colors || {};
    ['primary', 'secondary', 'accent', 'bg', 'text', 'textLight'].forEach((key) => {
      if (colors[key]) {
        const swatch = document.createElement('div');
        swatch.className = 'preview-color-swatch';
        swatch.style.background = sanitizeColor(String(colors[key]), '#1a1a1a');
        colorsEl.appendChild(swatch);
      }
    });
  }

  // DNA雷达图
  if (style.styleDNA) {
    const dnaCanvas = $(dnaCanvasId);
    if (dnaCanvas && _drawDNARadar) _drawDNARadar(dnaCanvas, style.styleDNA);
  }

  preview.style.display = 'block';
}

// 保存并使用自定义风格
function saveAndUseCustomStyle() {
  if (!state.currentCustomStyle) {
    showToast('请先解析或生成风格');
    return;
  }

  const style = { ...state.currentCustomStyle }; // 浅拷贝避免引用问题
  style.id = 'custom_' + Date.now();
  style.avatar = style.avatar || '🎨';
  style.source = 'custom';
  style.available = true;
  style.fontFamily = style.fontFamily || '"Noto Serif SC", serif';
  style.titleWeight = style.titleWeight || 700;
  // 确保 quotes 字段存在，避免海报生成时崩溃
  if (!style.quotes || !style.quotes.length) {
    style.quotes = ['风格即态度，每一帧都是表达。'];
  }

  // 保存到 localStorage
  state.customStyles.push(style);
  try {
    localStorage.setItem('zaojing_custom_styles', JSON.stringify(state.customStyles));
  } catch (e) {
    logger.warn('自定义风格保存失败:', e);
    toast('存储空间不足，无法保存风格');
  }

  // 添加到导演列表
  DIRECTORS.push(style);

  // 关闭弹窗
  closeModal('style-editor-modal');

  // 选中这个风格
  state.selectedDirectorIds = [style.id];
  state.currentCustomStyle = null; // 清空当前状态
  showToast(`已创建风格「${style.name}」`);
  _initDirectorsPage();
}

// ========== 电影风格分析 ==========

// 打开电影分析弹窗
function openMovieStyleModal() {
  openStyleEditor('movie');
  $('movie-name-input').value = '';
  $('movie-preview').style.display = 'none';
  $('movie-style-loading').style.display = 'none';
}

// 分析电影风格
async function analyzeMovieStyle() {
  const movieName = $('movie-name-input').value.trim();
  if (!movieName) {
    showToast('请输入电影名称');
    return;
  }

  $('movie-style-loading').style.display = 'block';
  $('movie-preview').style.display = 'none';

  try {
    // 错误边界包装：AI 电影分析失败时降级为本地风格生成
    const result = await styleBoundary.run(
      () => AIClient.analyzeMovieStyle(movieName),
      () => {
        showToast('AI 服务不可用，已使用本地分析');
        return localAnalyzeMovie(movieName);
      }
    );
    result.sourceMovie = movieName;
    state.currentCustomStyle = result;

    $('preview-movie-name').textContent = `基于电影《${movieName}》`;
    showStylePreview(
      result,
      'movie-preview',
      'movie-preview-name',
      'movie-preview-desc',
      'movie-preview-keywords',
      'movie-preview-colors',
      'movie-preview-dna-radar'
    );
  } finally {
    $('movie-style-loading').style.display = 'none';
  }
}

// 本地电影风格分析（降级方案）
function localAnalyzeMovie(movieName) {
  const name = movieName.toLowerCase();
  let colors, keywords, styleDNA, styleDesc;

  if (name.includes('银翼') || name.includes('blade')) {
    colors = {
      primary: '#ff6a00',
      secondary: '#0097a7',
      accent: '#ff9100',
      bg: '#1a0a00',
      text: '#ffe0b2',
      textLight: '#ffab40',
    };
    keywords = ['橙黄雾气', '赛博都市', '全息投影'];
    styleDNA = {
      colorTemperature: 'warm',
      saturation: 'medium',
      contrast: 'high',
      compositionType: 'symmetric',
      lightingType: 'dramatic',
      scale: 'monumental',
      pace: 'static',
      texture: 'smooth',
    };
    styleDesc = '橙黄雾气中的赛博废墟美学';
  } else if (name.includes('花样') || name.includes('2046')) {
    colors = {
      primary: '#3d7a5a',
      secondary: '#c9a36b',
      accent: '#ff6b6b',
      bg: '#1a2e1f',
      text: '#e8d5b7',
      textLight: '#c9a36b',
    };
    keywords = ['旗袍', '霓虹绿', '暧昧'];
    styleDNA = {
      colorTemperature: 'cool',
      saturation: 'medium',
      contrast: 'high',
      compositionType: 'asymmetric',
      lightingType: 'low-key',
      scale: 'intimate',
      pace: 'static',
      texture: 'grainy',
    };
    styleDesc = '暧昧霓虹光影下的都市孤独';
  } else if (name.includes('寄生') || name.includes('parasite')) {
    colors = {
      primary: '#5d4037',
      secondary: '#8d6e63',
      accent: '#ffab00',
      bg: '#262019',
      text: '#efebe9',
      textLight: '#bcaaa4',
    };
    keywords = ['阶级', '半地下', '暴雨'];
    styleDNA = {
      colorTemperature: 'warm',
      saturation: 'low',
      contrast: 'high',
      compositionType: 'asymmetric',
      lightingType: 'natural',
      scale: 'medium',
      pace: 'dynamic',
      texture: 'grainy',
    };
    styleDesc = '阶级寓言中的暗黑社会美学';
  } else if (name.includes('盗梦') || name.includes('inception')) {
    colors = {
      primary: '#0a1929',
      secondary: '#c0c0c0',
      accent: '#4fc3f7',
      bg: '#0d1b2a',
      text: '#e0e0e0',
      textLight: '#b0bec5',
    };
    keywords = ['梦境', '折叠', '冷蓝'];
    styleDNA = {
      colorTemperature: 'cool',
      saturation: 'low',
      contrast: 'high',
      compositionType: 'symmetric',
      lightingType: 'dramatic',
      scale: 'monumental',
      pace: 'dynamic',
      texture: 'smooth',
    };
    styleDesc = '冷色调巨物感的梦境哲学';
  } else {
    colors = {
      primary: '#455a64',
      secondary: '#78909c',
      accent: '#ffd54f',
      bg: '#1a1a2e',
      text: '#eceff1',
      textLight: '#b0bec5',
    };
    keywords = ['电影感', '叙事', '氛围'];
    styleDNA = {
      colorTemperature: 'cool',
      saturation: 'medium',
      contrast: 'medium',
      compositionType: 'asymmetric',
      lightingType: 'dramatic',
      scale: 'medium',
      pace: 'dynamic',
      texture: 'grainy',
    };
    styleDesc = `${movieName}的视觉风格`;
  }

  return {
    name: `${movieName}风格`,
    styleDesc,
    colors,
    keywords,
    styleDNA,
    promptCore: `inspired by movie ${movieName}, cinematic style`,
    negativePrompt: 'low quality, off-topic',
    emotions: [],
    quotes: ['每一帧画面，都是导演留给观众的密码。'],
    sourceMovie: movieName,
  };
}

// ========== 风格混搭 ==========

// 打开混搭弹窗
function openBlendModal() {
  openStyleEditor('blend');
  $('blend-preview').style.display = 'none';
  $('blend-loading').style.display = 'none';

  // 填充弹窗导演选择下拉
  const selectA = $('blend-director-a');
  const selectB = $('blend-director-b');
  selectA.innerHTML = '';
  selectB.innerHTML = '';
  DIRECTORS.forEach((d) => {
    const optA = document.createElement('option');
    optA.value = d.id;
    optA.textContent = d.name;
    selectA.appendChild(optA);
    const optB = optA.cloneNode(true);
    selectB.appendChild(optB);
  });
  if (DIRECTORS.length > 1) selectB.selectedIndex = 1;

  // 同时填充内联面板的下拉框
  const inlineA = $('blend-director-a-inline');
  const inlineB = $('blend-director-b-inline');
  if (inlineA && inlineA.children.length <= 1) {
    DIRECTORS.forEach((d) => {
      const optA = document.createElement('option');
      optA.value = d.id;
      optA.textContent = d.name;
      inlineA.appendChild(optA);
      const optB = optA.cloneNode(true);
      inlineB.appendChild(optB);
    });
    if (DIRECTORS.length > 1) inlineB.selectedIndex = 1;
  }
}

// 执行混搭
async function doBlend() {
  const idA = $('blend-director-a').value;
  const idB = $('blend-director-b').value;
  const ratio = $('blend-ratio-slider').value / 100;

  if (idA === idB) {
    showToast('请选择两位不同的导演');
    return;
  }

  const styleA = DIRECTORS.find((d) => d.id === idA);
  const styleB = DIRECTORS.find((d) => d.id === idB);
  if (!styleA || !styleB) return;

  $('blend-loading').style.display = 'block';
  $('blend-preview').style.display = 'none';

  try {
    // 错误边界包装：AI 混搭失败时降级为本地色彩混合
    const result = await styleBoundary.run(
      () => AIClient.blendStyles(styleA, styleB, ratio),
      () => {
        // 本地降级：混合色彩和DNA
        const blended = {
          name: `${styleA.name}×${styleB.name}`,
          styleDesc: `${styleA.name}(${Math.round(ratio * 100)}%)与${styleB.name}(${Math.round((1 - ratio) * 100)}%)的混搭风格`,
          colors: {},
          keywords: [...new Set([...(styleA.keywords || []), ...(styleB.keywords || [])])].slice(0, 5),
          styleDNA: styleA.styleDNA,
          promptCore: `${styleA.promptCore} blended with ${styleB.promptCore}`,
          negativePrompt: styleB.negativePrompt,
          emotions: [...new Set([...(styleA.emotions || []), ...(styleB.emotions || [])])].slice(0, 4),
          quotes: [
            (styleA.quotes && styleA.quotes[0]) || '风格即态度。',
            (styleB.quotes && styleB.quotes[0]) || '每一帧都是表达。',
          ],
        };
        ['primary', 'secondary', 'accent', 'bg', 'text', 'textLight'].forEach((k) => {
          blended.colors[k] = blendHexColors(styleA.colors[k], styleB.colors[k], ratio);
        });
        showToast('AI 混搭不可用，已使用本地混搭');
        return blended;
      }
    );
    state.currentCustomStyle = result;
    showStylePreview(
      result,
      'blend-preview',
      'blend-preview-name',
      'blend-preview-desc',
      'blend-preview-keywords',
      'blend-preview-colors',
      'blend-preview-dna-radar'
    );
  } finally {
    $('blend-loading').style.display = 'none';
  }
}

// ========== 导出 ==========
export {
  initStyleSourceTabs,
  initDirectorSearch,
  initCustomStylePanel,
  initMovieStylePanel,
  initBlendStylePanel,
  loadCustomStyles,
  renderSavedStyles,
  renderStyleRecommendations,
  openStyleCreateModal,
  parseCustomStyle,
  localParseStyle,
  showStylePreview,
  saveAndUseCustomStyle,
  openMovieStyleModal,
  analyzeMovieStyle,
  localAnalyzeMovie,
  openBlendModal,
  doBlend,
};
