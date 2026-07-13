/**
 * 造境 ZaoJing — MVP 应用入口 v2.0
 * 瘦入口：路由 / 事件绑定 / 懒加载 / 初始化
 * 页面逻辑已拆分到 js/pages/*.js，共享工具在 js/shared.js
 */

// CSS 通过 Vite 构建管道引入：构建时提取为独立文件并添加内容 hash，开发模式下经 JS 注入
import '../css/app.css';
import { logger } from './utils/logger.js';
import { lazyLoadAll, disconnectLazyLoad } from './utils/lazy-load.js';
import {
  $,
  state,
  toast,
  navigate,
  pages,
  openModal,
  closeModal,
  closeAllModals,
  switchResultToolsTab,
  ALL_MODAL_IDS,
  escapeHtml,
  confirmDialog,
  promptDialog,
} from './shared.js';
import { DIRECTORS } from './data';
import * as AIClient from './ai-client';
import { createModuleBoundary } from './utils/error-boundary.js';
import { initErrorTracking, captureException } from './utils/sentry.js';
import './components';

// 页面模块（首屏同步导入：input + directors）
import { initInputPage } from './pages/input.js';
import { initDirectorsPage, drawDNARadar, toggleDirector, updateSelectCount } from './pages/directors.js';
// 非首屏页面模块（result/style/cocreate/trailer/generating/batch/templates/brand/
// hot-topics/typography/accounts）改为路由级动态 import，见下方 loadPageModule。

// ========== 模块级错误边界 ==========
const movieBoundary = createModuleBoundary('MovieModule');

// ========== 懒加载大模块 ==========
// movie-module.js 与 poster-engine.js 体积较大，改为动态 import：
// 用户停留在输入页时不会下载这些代码，仅在生成海报或进入电影模块时按需加载。
let _MovieModule = null;
async function getMovieModule() {
  if (!_MovieModule) {
    _MovieModule = await import('./movie-module.js');
  }
  return _MovieModule;
}

// 电影模块是否已完成初始化（绑定事件 + 拉取电影数据）
let _movieModuleInited = false;
async function ensureMovieModuleInited() {
  const m = await getMovieModule();
  if (!_movieModuleInited) {
    _movieModuleInited = true;
    await movieBoundary.run(
      () => m.init(),
      () => toast('电影模块加载失败，请稍后重试')
    );
  }
  return m;
}

let _PosterEngine = null;
async function getPosterEngine() {
  if (!_PosterEngine) {
    _PosterEngine = await import('./poster-engine');
  }
  return _PosterEngine;
}

// ========== 页面模块懒加载 ==========
// 非首屏页面模块在首次导航到该页面时才动态 import，避免首屏下载全部 13 个页面。
const lazyModules = {};
const pageInitialized = {};

async function loadPageModule(name) {
  if (lazyModules[name]) return lazyModules[name];
  switch (name) {
    case 'result':
      lazyModules.result = await import('./pages/result.js');
      return lazyModules.result;
    case 'style':
      lazyModules.style = await import('./pages/style.js');
      return lazyModules.style;
    case 'ticket':
      lazyModules.ticket = await import('./pages/ticket.js');
      return lazyModules.ticket;
    case 'cocreate':
      lazyModules.cocreate = await import('./pages/cocreate.js');
      return lazyModules.cocreate;
    case 'trailer':
      lazyModules.trailer = await import('./pages/trailer.js');
      return lazyModules.trailer;
    case 'generating':
      lazyModules.generating = await import('./pages/generating.js');
      return lazyModules.generating;
    case 'batch':
      lazyModules.batch = await import('./pages/batch.js');
      return lazyModules.batch;
    case 'templates':
      lazyModules.templates = await import('./pages/templates.js');
      return lazyModules.templates;
    case 'brand':
      lazyModules.brand = await import('./pages/brand.js');
      return lazyModules.brand;
    case 'hot-topics':
      lazyModules.hotTopics = await import('./pages/hot-topics.js');
      return lazyModules.hotTopics;
    case 'typography':
      lazyModules.typography = await import('./pages/typography.js');
      return lazyModules.typography;
    case 'accounts':
      lazyModules.accounts = await import('./pages/accounts.js');
      return lazyModules.accounts;
    default:
      throw new Error(`Unknown page module: ${name}`);
  }
}

// result 页函数的懒加载包装：供 generating 页的 setupGeneratingPage 注入
async function lazyShowResultPage() {
  await ensurePageInit('result');
  lazyModules.result.showResultPage();
}
async function lazySaveToHistory(result) {
  await ensurePageInit('result');
  return lazyModules.result.saveToHistory(result);
}

// 首次导航到某页面时加载模块并执行 setup*Page（依赖注入）
async function ensurePageInit(pageName) {
  const mod = await loadPageModule(pageName);
  if (pageInitialized[pageName]) return mod;
  pageInitialized[pageName] = true;
  switch (pageName) {
    case 'result':
      mod.setupResultPage({ getPosterEngine, getMovieModule: () => _MovieModule });
      // 从 localStorage 恢复历史记录与电影墙数据（原在 init 中同步调用）
      mod.loadHistory();
      mod.loadWall();
      break;
    case 'style':
      mod.setupStylePage({ drawDNARadar, initDirectorsPage: initDirectorsPageWithCallbacks });
      break;
    case 'ticket':
      mod.setupTicketPage();
      break;
    case 'cocreate':
      mod.setupCocreatePage({ initDirectorsPage: initDirectorsPageWithCallbacks });
      break;
    case 'generating':
      mod.setupGeneratingPage({
        getPosterEngine,
        getMovieModule: () => _MovieModule,
        showResultPage: lazyShowResultPage,
        saveToHistory: lazySaveToHistory,
      });
      break;
    case 'batch':
      mod.setupBatchPage({ getPosterEngine });
      break;
    case 'templates':
      mod.setupTemplatesPage({ onApply: () => navigateTo('directors') });
      break;
    case 'brand':
      mod.setupBrandPage();
      mod.initBrandEventBindings();
      break;
    case 'hot-topics':
      mod.setupHotTopicsPage();
      break;
    case 'typography':
      mod.setupTypographyPage();
      break;
    case 'accounts':
      mod.setupAccountsPage({ getPosterData: () => state.posterResults[state.currentPosterIndex] });
      mod.initAccountsEventBindings();
      break;
  }
  return mod;
}

// 包装 navigate：切换页面前断开懒加载观察器并清理 Worker，切换后重新扫描图片
// 确保旧页面的 IntersectionObserver 与 Worker 不会泄漏到新页面
function navigateTo(pageId) {
  disconnectLazyLoad();
  // 生成过程中不终止 Worker，避免中断渲染
  if (!state.isGenerating && _PosterEngine && _PosterEngine.cleanupWorker) {
    _PosterEngine.cleanupWorker();
  }
  navigate(pageId);
  lazyLoadAll();

  if (pageId === 'directors') {
    import('./pages/directors.js')
      .then(({ updateMovieStyleBadge }) => {
        updateMovieStyleBadge();
      })
      .catch(() => {});
  }
}

// ========== 依赖注入 ==========
// initDirectorsPage 需要风格相关回调（来自 style.js）。
// style.js 现为懒加载模块：若已加载则传入完整回调，否则先渲染导演页
// （directors.js 使用 typeof 守卫跳过缺失回调），再异步加载 style.js 补充风格初始化。
function initDirectorsPageWithCallbacks() {
  const styleMod = lazyModules.style;
  if (styleMod) {
    initDirectorsPage({
      renderStyleRecommendations: styleMod.renderStyleRecommendations,
      initStyleSourceTabs: styleMod.initStyleSourceTabs,
      initDirectorSearch: styleMod.initDirectorSearch,
      initCustomStylePanel: styleMod.initCustomStylePanel,
      initMovieStylePanel: styleMod.initMovieStylePanel,
      initBlendStylePanel: styleMod.initBlendStylePanel,
      loadCustomStyles: styleMod.loadCustomStyles,
      renderSavedStyles: styleMod.renderSavedStyles,
    });
  } else {
    // style.js 尚未加载：先无回调渲染导演页，再异步加载 style 并补充风格功能
    initDirectorsPage({});
    ensurePageInit('style')
      .then((mod) => {
        mod.initStyleSourceTabs();
        mod.initDirectorSearch();
        mod.initCustomStylePanel();
        mod.initMovieStylePanel();
        mod.initBlendStylePanel();
        mod.loadCustomStyles();
        mod.renderSavedStyles();
        mod.renderStyleRecommendations();
      })
      .catch((e) => logger.warn('异步加载风格模块失败:', e));
  }
}

// 各页面模块的 setup*Page 调用已移至 ensurePageInit，在首次导航到该页面时执行。

// 向后兼容：movie-module.js 通过 typeof toast === 'function' 跨模块调用
window.toast = toast;

// ========== 导航辅助函数 ==========

/** 重置到首页（清空状态） */
function resetToHome() {
  state.inputText = '';
  state.moodTagId = null;
  state.uploadedImage = null;
  state.selectedDirectorIds = [];
  state.posterResults = [];
  state.currentPosterIndex = 0;
  state.posterFormat = 'vertical';
  state.showQuote = true;
  state.currentTitle = '';
  state.altTitles = [];
  state.currentQuote = '';
  state.imageEmotionAnalysis = null;
  // 恢复引擎默认为 seedream
  state.useAI = true;
  state.aiEngine = 'seedream';
  const seedreamBtn = document.querySelector('.engine-option[data-engine="seedream"]');
  const canvasBtn = document.querySelector('.engine-option[data-engine="canvas"]');
  if (seedreamBtn && canvasBtn) {
    seedreamBtn.classList.add('active');
    seedreamBtn.setAttribute('aria-checked', 'true');
    canvasBtn.classList.remove('active');
    canvasBtn.setAttribute('aria-checked', 'false');
  }
  const analysisEl = $('upload-analysis');
  if (analysisEl) analysisEl.style.display = 'none';
  // 重置上传按钮状态
  const uploadBtn = $('btn-upload-image');
  const uploadLabel = $('upload-label');
  const uploadPreview = $('upload-preview');
  if (uploadBtn) uploadBtn.classList.remove('has-image');
  if (uploadLabel) uploadLabel.textContent = '上传参考图';
  if (uploadPreview) {
    uploadPreview.src = '';
    uploadPreview.style.display = 'none';
  }
  initInputPage({ initDirectorsPage: initDirectorsPageWithCallbacks });
  navigateTo('input');
}

/** 处理侧边栏/底部Tab的section导航 */
function handleSectionNav(section, page) {
  // 先关闭所有弹窗
  closeAllModals();

  if (section === 'create') {
    // 创作：回到输入页
    navigateTo('input');
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (section === 'lab') {
    // 实验室：如果不在输入页则先回到输入页，然后滚动到实验室区域
    const activePage = document.querySelector('.page.active');
    const isInputPage = activePage && activePage.id === 'page-input';
    if (!isInputPage) {
      navigateTo('input');
      // 等待页面切换后滚动
      setTimeout(() => {
        const labSection = document.getElementById('lab-section');
        if (labSection) labSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    } else {
      const labSection = document.getElementById('lab-section');
      if (labSection) labSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else if (section === 'my') {
    // 我的：导航到电影墙
    ensurePageInit('result').then(() => {
      lazyModules.result.initWallPage();
    });
  } else if (section === 'settings') {
    // 返回展示页
    window.location.href = 'showcase.html';
  }
}

/** 处理topbar返回按钮 */
function handleBackNavigation() {
  // 先关闭弹窗
  if (closeAllModals()) return;

  // 根据当前页面返回
  const activePage = document.querySelector('.page.active');
  if (!activePage) {
    navigateTo('input');
    return;
  }
  const pageId = activePage.id.replace('page-', '');

  // 核心流程返回逻辑
  if (pageId === 'result') {
    navigateTo('directors');
  } else if (pageId === 'generating') {
    navigateTo('directors');
  } else if (pageId === 'directors') {
    navigateTo('input');
  } else if (pageId === 'wall') {
    navigateTo('input');
  } else if (
    pageId === 'ticket' ||
    pageId === 'cocreate' ||
    pageId === 'movies' ||
    pageId === 'batch' ||
    pageId === 'hot-topics' ||
    pageId === 'template'
  ) {
    navigateTo('input');
  } else {
    navigateTo('input');
  }
}

// ========== 事件绑定 ==========
function bindEvents() {
  // 安全事件绑定辅助函数：元素不存在时静默跳过
  const on = (id, event, handler) => {
    const el = typeof id === 'string' ? $(id) : id;
    if (el) el.addEventListener(event, handler);
  };
  const onClick = (id, handler) => on(id, 'click', handler);

  // 示例输入：点击填入输入框
  document.querySelectorAll('.example-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const text = chip.dataset.text;
      const textarea = $('input-text');
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input'));
        textarea.focus();
      }
    });
  });

  // 语音输入按钮：点击开始/停止录音
  onClick('btn-voice-input', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast('当前浏览器不支持语音识别');
      return;
    }

    if (state.isListening) {
      if (state.voiceRecognition) {
        state.voiceRecognition.stop();
      }
      state.isListening = false;
      const vs = $('voice-status');
      if (vs) vs.style.display = 'none';
    } else {
      if (state.voiceRecognition) {
        try {
          state.voiceRecognition.start();
          state.isListening = true;
          const vs = $('voice-status');
          if (vs) vs.style.display = 'flex';
        } catch (e) {
          logger.warn('启动语音识别失败:', e);
          toast('启动语音识别失败，请重试');
        }
      }
    }
  });

  // 选导演页返回按钮（新ID）
  onClick('btn-back-to-input', () => navigateTo('input'));
  onClick('btn-back-input', () => navigateTo('input')); // 导演页内的"重新输入"按钮
  onClick('btn-generate', async () => {
    if (state.selectedDirectorIds.length === 0) {
      toast('请至少选择一位导演');
      return;
    }
    await ensurePageInit('generating');
    lazyModules.generating.startGeneration();
  });

  // 全选/清除
  onClick('btn-select-all', () => {
    state.selectedDirectorIds = DIRECTORS.map((d) => d.id);
    document.querySelectorAll('.director-card').forEach((card) => {
      card.classList.add('selected');
    });
    updateSelectCount();
    toast(`已全选 ${DIRECTORS.length} 位导演`);
  });

  onClick('btn-clear-all', () => {
    state.selectedDirectorIds = ['miyazaki'];
    document.querySelectorAll('.director-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.id === 'miyazaki');
    });
    updateSelectCount();
    toast('已重置为默认选择');
  });

  // 结果页（懒加载 result 模块）
  onClick('btn-download', async () => {
    await ensurePageInit('result');
    lazyModules.result.downloadPoster();
  });
  onClick('btn-share', async () => {
    await ensurePageInit('result');
    lazyModules.result.sharePoster();
  });
  onClick('btn-regenerate', async () => {
    await ensurePageInit('result');
    lazyModules.result.regenerate();
  });
  onClick('btn-refresh-quote', async () => {
    await ensurePageInit('result');
    lazyModules.result.refreshQuote();
  });

  // 刷新 AI 影评
  onClick('btn-refresh-review', async () => {
    await ensurePageInit('result');
    lazyModules.result.renderReview();
    toast('已换一段影评');
  });

  // 刷新导演手记
  onClick('btn-refresh-notes', async () => {
    await ensurePageInit('result');
    lazyModules.result.renderDirectorNotes();
    toast('已刷新导演手记');
  });

  // 首页/重置按钮（底部FAB和首页重置）
  onClick('btn-home', resetToHome);
  onClick('fab-create', () => {
    closeAllModals();
    resetToHome();
  });

  // 引擎选择开关（AI 生图 / Canvas）
  document.querySelectorAll('.engine-option[data-engine]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const engine = btn.dataset.engine;
      document.querySelectorAll('.engine-option[data-engine]').forEach((b) => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      });
      if (engine === 'canvas') {
        state.useAI = false;
        state.aiEngine = 'canvas';
        toast('已切换为 Canvas 模式');
      } else {
        state.useAI = true;
        state.aiEngine = 'seedream';
        toast('已切换为 AI 生图模式');
      }
    });
  });

  // 侧边栏导航
  document.querySelectorAll('.sidebar-nav-item[data-section]').forEach((item) => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      handleSectionNav(section, item.dataset.page);
    });
  });

  // 底部Tab导航
  document.querySelectorAll('.bottom-tab-item[data-section]').forEach((item) => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      handleSectionNav(section, item.dataset.page);
    });
  });

  // 返回按钮（topbar中的返回按钮）
  onClick('btn-back', handleBackNavigation);

  // 热门电影按钮（topbar）- 懒加载movie模块
  onClick('btn-hot-movies', async () => {
    const m = await ensureMovieModuleInited();
    m.navigateToMovies();
  });

  // 实验室弹窗中的功能按钮
  onClick('btn-to-ticket', async () => {
    closeAllModals();
    await ensurePageInit('ticket');
    navigateTo('ticket');
    lazyModules.ticket.initTicketPage();
  });
  onClick('btn-to-cocreate', async () => {
    closeAllModals();
    await ensurePageInit('cocreate');
    lazyModules.cocreate.initCocreatePage();
  });
  onClick('btn-to-batch', async () => {
    await ensurePageInit('batch');
    lazyModules.batch.openBatchModal();
  });
  onClick('btn-to-templates', async () => {
    await ensurePageInit('templates');
    lazyModules.templates.openTemplateModal();
  });
  onClick('btn-to-hot-topics', async () => {
    await ensurePageInit('hot-topics');
    lazyModules.hotTopics.openHotTopicsModal();
  });

  // 导演说开关
  const toggleQuote = $('toggle-quote');
  if (toggleQuote) {
    async function toggleQuoteHandler() {
      state.showQuote = !state.showQuote;
      toggleQuote.classList.toggle('on', state.showQuote);
      toggleQuote.setAttribute('aria-checked', state.showQuote);
      if (state.posterResults.length > 0) {
        await ensurePageInit('result');
        await lazyModules.result.regenerateAllPosters();
        const current = state.posterResults[state.currentPosterIndex];
        const qt = $('quote-text');
        const qd = $('quote-display');
        if (qt) qt.textContent = state.showQuote && current.quote ? `「${current.quote}」` : '';
        if (qd) qd.style.opacity = state.showQuote ? '1' : '0.4';
      }
    }
    toggleQuote.addEventListener('click', toggleQuoteHandler);
    toggleQuote.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleQuoteHandler();
      }
    });
  }

  // 电影墙
  onClick('btn-to-wall', async () => {
    await ensurePageInit('result');
    lazyModules.result.initWallPage();
  });
  onClick('btn-wall-to-input', () => navigateTo('input'));
  onClick('btn-wall-back', () => navigateTo('input'));
  onClick('btn-wall-clear', async () => {
    if (state.wallItems.length === 0) return;
    const ok = await confirmDialog('确定要清空所有作品吗？此操作不可撤销。', {
      title: '清空电影墙',
      okText: '清空',
      danger: true,
    });
    if (ok) {
      await ensurePageInit('result');
      lazyModules.result.clearWall();
      toast('电影墙已清空');
    }
  });

  // 分享（action 按钮保留，close/overlay 由 zj-modal 统一处理）
  onClick('btn-copy-link', async () => {
    await ensurePageInit('result');
    lazyModules.result.copyShareLink();
  });
  onClick('btn-download-qr', async () => {
    await ensurePageInit('result');
    lazyModules.result.downloadQRCode();
  });

  // 多平台分享按钮
  document.querySelectorAll('.share-platform-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await ensurePageInit('result');
      lazyModules.result.handlePlatformShare(btn.dataset.platform);
    });
  });

  // 保存图片按钮
  onClick('btn-download-image', async () => {
    await ensurePageInit('result');
    lazyModules.result.savePosterImage();
  });

  // AI 引擎选择器
  document.querySelectorAll('.ai-engine-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.ai-engine-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const engine = chip.dataset.engine;
      if (engine === 'canvas') {
        state.useAI = false;
      } else {
        state.useAI = true;
        state.aiEngine = engine;
      }
      logger.info('[AI] 引擎切换为:', engine);
    });
  });

  // 多人共创（懒加载 cocreate 模块）
  onClick('btn-add-contributor', async () => {
    await ensurePageInit('cocreate');
    const inputs = $('cocreate-inputs');
    const count = inputs ? inputs.querySelectorAll('.cocreate-input-item').length : 0;
    lazyModules.cocreate.addCocreateInput(`创作者${count + 1}`, '');
  });
  onClick('btn-cocreate-back', () => navigateTo('input'));
  onClick('btn-cocreate-analyze', async () => {
    await ensurePageInit('cocreate');
    lazyModules.cocreate.analyzeCocreate();
  });
  onClick('btn-cocreate-generate', async () => {
    await ensurePageInit('cocreate');
    lazyModules.cocreate.generateCocreatePoster();
  });

  // 电影预告片（懒加载 trailer 模块；close/overlay 由 zj-modal 统一处理）
  onClick('btn-trailer', async () => {
    await ensurePageInit('trailer');
    lazyModules.trailer.playTrailer();
  });
  onClick('btn-trailer-replay', async () => {
    await ensurePageInit('trailer');
    lazyModules.trailer.playTrailer();
  });
  onClick('btn-trailer-skip', async () => {
    await ensurePageInit('trailer');
    lazyModules.trailer.skipTrailer();
  });

  // 海报动效化（result 模块的动画功能；close/overlay 由 zj-modal 统一处理）
  onClick('btn-animate', async () => {
    await ensurePageInit('result');
    lazyModules.result.openAnimateModal();
  });
  onClick('btn-download-video', async () => {
    await ensurePageInit('result');
    lazyModules.result.downloadAnimationVideo();
  });

  // 批量生成（懒加载 batch 模块）
  onClick('btn-batch-back', () => navigateTo('input'));
  onClick('btn-batch-start', async () => {
    await ensurePageInit('batch');
    lazyModules.batch.startBatchGeneration();
  });
  onClick('btn-batch-abort', async () => {
    await ensurePageInit('batch');
    lazyModules.batch.abortBatchGeneration();
  });
  onClick('btn-batch-finish', async () => {
    await ensurePageInit('batch');
    lazyModules.batch.finishBatch();
  });
  onClick('btn-batch-download-all', async () => {
    await ensurePageInit('batch');
    lazyModules.batch.downloadAllBatchPosters();
  });
  on('batch-csv-input', 'change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      await ensurePageInit('batch');
      lazyModules.batch.handleBatchCSVUpload(file);
    }
    e.target.value = '';
  });
  on('batch-text-input', 'input', () => {
    const textarea = $('batch-text-input');
    const countEl = $('batch-input-count');
    if (!textarea || !countEl) return;
    const lines = textarea.value.split(/\r?\n/).filter((l) => l.trim());
    countEl.textContent = `${lines.length} 条`;
    countEl.classList.toggle('has-items', lines.length > 0);
  });

  // 模板库（懒加载 templates 模块）
  onClick('btn-template-back', () => navigateTo('input'));
  onClick('btn-save-template', async () => {
    await ensurePageInit('templates');
    lazyModules.templates.saveCurrentAsTemplate();
  });

  // 品牌工具包（懒加载 brand 模块；close/overlay 由 zj-modal 统一处理）
  onClick('btn-brand', async () => {
    await ensurePageInit('brand');
    lazyModules.brand.openBrandModal();
  });
  onClick('btn-brand-apply', async () => {
    await ensurePageInit('brand');
    lazyModules.brand.closeBrandModal();
  });

  // 热点话题（懒加载 hot-topics 模块）
  onClick('btn-hot-topics-back', () => navigateTo('input'));
  onClick('btn-hot-topics-refresh', async () => {
    await ensurePageInit('hot-topics');
    lazyModules.hotTopics.refreshHotTopics();
  });

  // 字体排版（懒加载 typography 模块；close/overlay 由 zj-modal 统一处理）
  onClick('btn-typography', async () => {
    await ensurePageInit('typography');
    lazyModules.typography.openTypographyModal();
  });
  onClick('btn-typography-apply', async () => {
    await ensurePageInit('typography');
    lazyModules.typography.closeTypographyModal();
  });

  // 账号矩阵（懒加载 accounts 模块；close/overlay 由 zj-modal 统一处理）
  onClick('btn-accounts', async () => {
    await ensurePageInit('accounts');
    lazyModules.accounts.openAccountsModal();
  });
  onClick('btn-accounts-close', async () => {
    await ensurePageInit('accounts');
    lazyModules.accounts.closeAccountsModal();
  });

  // ========== 结果工具弹窗 Tab 切换 + zj:close 清理 ==========
  document.querySelectorAll('.result-tools-tab').forEach((btn) => {
    btn.onclick = () => switchResultToolsTab(btn.dataset.resultTab);
  });
  const resultToolsModalEl = document.querySelector('zj-modal[modal-id="result-tools-modal"]');
  if (resultToolsModalEl) {
    resultToolsModalEl.addEventListener('zj:close', () => {
      const activeTab = document.querySelector('.result-tools-tab.active');
      if (!activeTab) return;
      // 预告片关闭时清理定时器，避免场景继续渲染
      if (activeTab.dataset.resultTab === 'trailer' && state.trailerTimer) {
        clearTimeout(state.trailerTimer);
        state.trailerTimer = null;
      }
    });
  }

  // 键盘快捷键系统
  document.addEventListener('keydown', (e) => {
    // ESC: 优先关闭弹窗，其次返回上一页
    if (e.key === 'Escape') {
      if (closeAllModals()) return;
      if (pages.result && pages.result.classList.contains('active')) navigateTo('directors');
      else if (pages.directors && pages.directors.classList.contains('active')) navigateTo('input');
      return;
    }

    // 以下快捷键在输入框/文本域中不触发
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    // Ctrl/Cmd + Enter: 在选导演页触发生成
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (pages.directors && pages.directors.classList.contains('active')) {
        e.preventDefault();
        if (state.selectedDirectorIds.length > 0) {
          ensurePageInit('generating').then(() => lazyModules.generating.startGeneration());
        } else {
          toast('请至少选择一位导演');
        }
      }
      return;
    }

    // 单键快捷键
    switch (e.key) {
      case '1':
        navigateTo('input');
        break;
      case '2':
        navigateTo('directors');
        break;
      case 'g':
        // G = Generate（选导演页）
        if (pages.directors && pages.directors.classList.contains('active')) {
          if (state.selectedDirectorIds.length > 0) {
            ensurePageInit('generating').then(() => lazyModules.generating.startGeneration());
          } else {
            toast('请至少选择一位导演');
          }
        }
        break;
      case 'r':
        // R = Regenerate（结果页）
        if (pages.result && pages.result.classList.contains('active')) {
          ensurePageInit('result').then(() => lazyModules.result.regenerate());
        }
        break;
      case 'd':
        // D = Download（结果页）
        if (pages.result && pages.result.classList.contains('active')) {
          ensurePageInit('result').then(() => lazyModules.result.downloadPoster());
        }
        break;
      case '?':
        // ? = 显示快捷键帮助
        toast('快捷键：1/2 切页 · G 生成 · R 重生成 · D 下载 · Esc 返回', 4000);
        break;
    }
  });

  // ========== 风格工具栏按钮（懒加载 style 模块）==========
  onClick('btn-create-style', async () => {
    await ensurePageInit('style');
    lazyModules.style.openStyleCreateModal();
  });
  onClick('btn-movie-style', async () => {
    await ensurePageInit('style');
    lazyModules.style.openMovieStyleModal();
  });
  onClick('btn-blend-style', async () => {
    await ensurePageInit('style');
    lazyModules.style.openBlendModal();
  });

  // ========== 自定义风格创建 ==========
  onClick('btn-parse-style', async () => {
    await ensurePageInit('style');
    lazyModules.style.parseCustomStyle();
  });
  onClick('btn-save-style', async () => {
    await ensurePageInit('style');
    lazyModules.style.saveAndUseCustomStyle();
  });

  // ========== 电影风格分析 ==========
  onClick('btn-analyze-movie', async () => {
    await ensurePageInit('style');
    lazyModules.style.analyzeMovieStyle();
  });
  onClick('btn-save-movie-style', async () => {
    await ensurePageInit('style');
    lazyModules.style.saveAndUseCustomStyle();
  });

  // ========== 风格混搭 ==========
  onClick('btn-do-blend', async () => {
    await ensurePageInit('style');
    lazyModules.style.doBlend();
  });
  onClick('btn-save-blend-style', async () => {
    await ensurePageInit('style');
    lazyModules.style.saveAndUseCustomStyle();
  });
  on('blend-ratio-slider', 'input', (e) => {
    const v = e.target.value;
    const valEl = $('blend-ratio-value');
    if (valEl) valEl.textContent = `${v} : ${100 - v}`;
  });
}

// ========== 初始化 ==========
async function init() {
  initErrorTracking();

  // iOS 软键盘弹出时修复视口：动态调整 --app-height 为 visualViewport 高度
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    const setAppHeight = () => {
      const vv = window.visualViewport;
      if (vv) {
        document.documentElement.style.setProperty('--app-height', `${vv.height}px`);
      }
    };
    // 初始设置
    setAppHeight();
    window.visualViewport?.addEventListener('resize', setAppHeight);
    window.visualViewport?.addEventListener('scroll', setAppHeight);
    // 页面可见性变化时重新计算（从后台切回）
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setAppHeight();
    });
  } else if (window.visualViewport) {
    // 非 iOS 设备也监听，兼容 Android Chrome 软键盘
    const setAppHeight = () => {
      const vv = window.visualViewport;
      if (vv) {
        document.documentElement.style.setProperty('--app-height', `${vv.height}px`);
      }
    };
    setAppHeight();
    window.visualViewport.addEventListener('resize', setAppHeight);
  }

  // loadHistory / loadWall 已移至 ensurePageInit('result')，避免首屏加载 result 模块
  bindEvents();

  // 监听跨模块导航事件（替代直接引用 App.navigate）
  document.addEventListener('zaojing:navigate', (e) => {
    if (e.detail && e.detail.page) {
      // navigateTo 已包含 disconnectLazyLoad + lazyLoadAll
      navigateTo(e.detail.page);
    }
  });

  // 热门电影按钮已在 bindEvents 中绑定（btn-hot-movies）

  initInputPage({ initDirectorsPage: initDirectorsPageWithCallbacks });

  // 根据初始 hash 路由（支持直接URL访问，如 #ticket、#wall、#cocreate?room=XXX 等）
  const initialHashRaw = window.location.hash.replace('#', '');
  const validPages = ['input', 'directors', 'result', 'wall', 'ticket', 'cocreate', 'movies', 'batch', 'hot-topics'];
  const initialPageId = initialHashRaw.split('?')[0];
  const startPage = initialPageId && validPages.includes(initialPageId) ? initialPageId : 'input';

  // 如果是直接访问ticket/wall等页面，需要先确保input页初始化（它是入口），但显示目标页面
  if (startPage !== 'input' && startPage !== 'directors' && startPage !== 'generating' && startPage !== 'result') {
    // 对于非核心流程页面（ticket等），先确保模块加载再导航
    // 注意：navigateTo 会调用 navigate() 并 replaceState 去掉 query string，
    // 所以需要在此之前解析 invite 参数传给 init 函数
    const savedHash = window.location.hash;
    navigateTo(startPage);
    if (startPage === 'ticket') {
      ensurePageInit('ticket').then((mod) => mod.initTicketPage());
    }
    if (startPage === 'cocreate') {
      const params = new URLSearchParams(savedHash.split('?')[1] || '');
      const inviteRoomId = params.get('room');
      ensurePageInit('cocreate').then((mod) => mod.initCocreatePage({ inviteRoomId }));
    }
  } else {
    // navigateTo 内部已调用 lazyLoadAll 扫描待懒加载的图片
    navigateTo(startPage === 'ticket' ? 'input' : startPage);
  }

  // 监听浏览器前进/后退
  window.addEventListener('popstate', () => {
    const hashRaw = window.location.hash.replace('#', '');
    const pageId = hashRaw.split('?')[0];
    if (pageId && validPages.includes(pageId) && pageId !== 'generating') {
      const popParams = new URLSearchParams(hashRaw.split('?')[1] || '');
      navigateTo(pageId);
      if (pageId === 'ticket') {
        ensurePageInit('ticket').then((mod) => mod.initTicketPage());
      }
      if (pageId === 'cocreate') {
        ensurePageInit('cocreate').then((mod) => mod.initCocreatePage({ inviteRoomId: popParams.get('room') }));
      }
    }
  });

  // 加载自定义风格（从 localStorage 恢复并添加到导演列表）
  try {
    const saved = localStorage.getItem('zaojing_custom_styles');
    if (saved) {
      state.customStyles = JSON.parse(saved);
      state.customStyles.forEach((s) => {
        if (!DIRECTORS.find((d) => d.id === s.id)) {
          DIRECTORS.push(s);
        }
      });
    }
  } catch (e) {
    logger.warn('加载自定义风格失败:', e);
  }

  // 首屏渲染已完成。将非关键初始化延迟到 idle 时执行，避免与首屏资源竞争网络与主线程。
  // 延迟可访问性增强（仅补全非首屏 DOM 的 aria 属性，不影响首屏交互）
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => enhanceA11y());
  } else {
    setTimeout(enhanceA11y, 200);
  }

  // 延迟健康检查，避免与首屏资源竞争网络
  const checkBackendHealth = async () => {
    try {
      const health = await AIClient.checkHealth();
      if (health && health.status === 'ok') {
        state.aiHealthStatus = health;
        state.useAI = true;
        if (health.engines) {
          if (health.engines.seedream) {
            state.aiEngine = 'seedream';
          } else {
            state.useAI = false;
          }
        }
        logger.info('[AI] 后端已连接', health);
        showAIStatus(health);
      } else {
        state.aiHealthStatus = null;
        state.useAI = false;
        logger.info('[AI] 后端未启动，使用 Canvas 模式');
      }
    } catch (e) {
      state.aiHealthStatus = null;
      state.useAI = false;
      logger.info('[AI] 后端连接失败，使用 Canvas 模式');
    }
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(
      () => {
        void checkBackendHealth();
      },
      { timeout: 3000 }
    );
    // 首屏渲染后，在空闲时预加载高频使用的页面模块，让用户点击时几乎瞬间加载
    requestIdleCallback(
      () => {
        // 预加载电影模块（用户点击"热门电影"时使用）
        import('./movie-module').catch((err) => logger.warn('模块预加载失败 (movie-module):', err));
        // 预加载结果页（生成完成后立即跳转）
        import('./pages/generating').catch((err) => logger.warn('模块预加载失败 (generating):', err));
      },
      { timeout: 5000 }
    );
  } else {
    setTimeout(checkBackendHealth, 500);
  }
}

function showAIStatus(health) {
  const hasEngine = !!(health && health.engines && health.engines.seedream);

  const hero = document.querySelector('#page-input .input-hero');
  if (hero) {
    const badge = document.createElement('div');
    badge.className = 'ai-status-badge';
    if (hasEngine) {
      const dot = document.createElement('span');
      dot.className = 'ai-status-dot';
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode('AI 引擎已就绪'));
      const tag = document.createElement('span');
      tag.className = 'engine-tag';
      tag.textContent = 'Seedream';
      badge.appendChild(tag);
    } else {
      const dot = document.createElement('span');
      dot.className = 'ai-status-dot';
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = '0 0 8px #f59e0b';
      badge.appendChild(dot);
      badge.appendChild(document.createTextNode('Canvas 模式（配置 API Key 启用 AI 生图）'));
    }
    hero.appendChild(badge);
  }

  const selector = $('ai-engine-selector');
  if (selector && hasEngine) {
    selector.style.display = 'flex';
    const chips = selector.querySelectorAll('.ai-engine-chip');
    chips.forEach((chip) => {
      const engine = chip.dataset.engine;
      if (engine === 'seedream' && !health.engines.seedream) {
        chip.style.display = 'none';
      }
    });
  }
}

// ========== 可访问性（A11y）工具 ==========

// 焦点陷阱已统一到 shared.ts 的 openModal/closeModal，此处不再维护独立实现。
// zj-modal 组件内部自带焦点陷阱，原生 div 弹窗由 shared.ts 统一处理。

// 增强可访问性：为缺失 aria-label 的元素自动添加
function enhanceA11y() {
  document.querySelectorAll('canvas').forEach((canvas) => {
    if (!canvas.getAttribute('role')) {
      canvas.setAttribute('role', 'img');
    }
  });

  document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])').forEach((btn) => {
    if (!btn.textContent.trim() && !btn.getAttribute('title')) {
      btn.setAttribute('aria-label', '操作按钮');
    }
  });

  document.querySelectorAll('input[type="text"], textarea').forEach((input) => {
    if (!input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby')) {
      const placeholder = input.getAttribute('placeholder');
      if (placeholder) input.setAttribute('aria-label', placeholder);
    }
  });
}

export { init, toast };

// ========== 全局错误处理 ==========
// 捕获未处理的 JavaScript 错误，避免白屏
window.addEventListener('error', function (event) {
  captureException(event.error || new Error(event.message), {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });

  toast('页面发生错误，请刷新重试', 4000);
});

// 捕获未处理的 Promise 拒绝
window.addEventListener('unhandledrejection', function (event) {
  const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  captureException(error, { source: 'unhandledrejection' });

  const msg = event.reason && event.reason.message ? event.reason.message : '操作失败，请重试';
  toast(msg, 4000);
});

document.addEventListener('DOMContentLoaded', () => init());
