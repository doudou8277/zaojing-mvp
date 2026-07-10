// shared.ts — 跨页面共享的工具函数和状态
import { createStore } from './state';
import { logger } from './utils/logger.js';
import { escapeHtml, sanitizeColor, sanitizeImageUrl, sanitizeAttr } from './utils/sanitize.js';
import type {
  PosterResult,
  CustomStyle,
  HistoryEntry,
  WallItem,
  EmotionAnalysis,
  HealthStatus,
  AIEngine,
  PosterFormat,
} from './types.d.ts';

// ========== SpeechRecognition 全局类型声明 ==========
// TypeScript DOM lib 尚未包含 SpeechRecognition 主接口（仅包含事件类型），
// 此处补充最小化声明以供状态类型使用
declare global {
  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((ev: SpeechRecognitionEvent) => void) | null;
    onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
    onend: ((ev: Event) => void) | null;
    onstart: ((ev: Event) => void) | null;
  }
  var SpeechRecognition: {
    prototype: SpeechRecognition;
    new (): SpeechRecognition;
  };
}

// ========== 应用状态初始类型 ==========

interface AppInitialState {
  inputText: string;
  moodTagId: string | null;
  uploadedImage: string | null;
  selectedDirectorIds: string[];
  currentPosterIndex: number;
  posterResults: PosterResult[];
  isGenerating: boolean;
  posterFormat: PosterFormat;
  customStyles: CustomStyle[];
  history: HistoryEntry[];
  wallItems: WallItem[];
  aiEngine: AIEngine;
  useAI: boolean;
  aiHealthStatus: HealthStatus | null;
  emotionAnalysis: EmotionAnalysis | null;
  imageEmotionAnalysis: boolean | null;
  styleSource: 'preset' | 'custom' | 'movie' | 'blend';
  currentCustomStyle: CustomStyle | null;
  activeCustomStyleId: string | null;
  movieStyle: CustomStyle | null;
  blendStyle: { a: string; b: string; ratio: number } | null;
  showQuote: boolean;
  currentTitle: string;
  altTitles: string[];
  currentQuote: string;
  currentQuoteIndex: number;
  voiceRecognition: SpeechRecognition | null;
  isListening: boolean;
  cocreateContributors: string[];
  cocreateAnalysis: unknown | null;
  trailerTimer: ReturnType<typeof setTimeout> | null;
  genTimer: ReturnType<typeof setTimeout> | null;
  // 索引签名：满足 createStore<T extends Record<string, unknown>> 约束
  [key: string]: unknown;
}

// ========== 工具函数 ==========

// getElementById 简写
const $ = (id: string): HTMLElement | null => document.getElementById(id);

// 页面 DOM 映射（惰性守卫：非 DOM 环境（如 Node 测试）中返回空对象）
const pages: Record<string, HTMLElement | null> =
  typeof document !== 'undefined'
    ? {
        input: $('page-input'),
        directors: $('page-directors'),
        generating: $('page-generating'),
        result: $('page-result'),
        wall: $('page-wall'),
        ticket: $('page-ticket'),
        cocreate: $('page-cocreate'),
        movies: $('page-movies'),
        batch: $('page-batch'),
        'hot-topics': $('page-hot-topics'),
        template: $('page-template'),
      }
    : {};

// 路由切换
function navigate(pageId: string): void {
  Object.values(pages).forEach((p) => p && p.classList.remove('active'));
  const page = pages[pageId];
  if (page) page.classList.add('active');
  window.scrollTo(0, 0);
  history.replaceState(null, '', `#${pageId}`);
  updateFlowIndicator(pageId);
}

// 更新流程步骤指示器
function updateFlowIndicator(pageId: string): void {
  const indicator = document.getElementById('flow-indicator');
  if (!indicator) return;

  // 仅在核心三步流程中显示
  const coreSteps = ['input', 'directors', 'result', 'generating'];
  if (!coreSteps.includes(pageId)) {
    indicator.classList.remove('visible');
    return;
  }
  indicator.classList.add('visible');

  // 映射页面到步骤
  const stepMap: Record<string, string> = {
    input: 'input',
    directors: 'directors',
    generating: 'directors',
    result: 'result',
  };
  const currentStep = stepMap[pageId] || 'input';
  const order = ['input', 'directors', 'result'];
  const currentIdx = order.indexOf(currentStep);

  indicator.querySelectorAll<HTMLElement>('.flow-step').forEach((el) => {
    const step = el.dataset.step || '';
    const idx = order.indexOf(step);
    el.classList.toggle('active', idx === currentIdx);
    el.classList.toggle('done', idx < currentIdx);
  });
}

// toast 提示（统一 API：自动检测 zj-toast 组件，否则回退到直接 DOM 操作）
/** ZJToast 组件接口（类型安全调用） */
interface ZJToastElement extends HTMLElement {
  show(message: string, duration?: number): void;
  hide(): void;
}

function isZJToast(el: HTMLElement): el is ZJToastElement {
  return el.tagName === 'ZJ-TOAST' && typeof (el as ZJToastElement).show === 'function';
}

function toast(msg: string, duration: number = 2500): void {
  const el = $('toast');
  if (!el) return;

  // 优先使用 zj-toast 组件的 .show() 方法
  if (isZJToast(el)) {
    el.show(msg, duration);
  } else {
    // 回退：直接操作 DOM（兼容非组件环境，如测试或旧版 HTML）
    const toastEl = el as HTMLElement & { _timer?: ReturnType<typeof setTimeout> };
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  // 同时通知屏幕阅读器：向全局 aria-live 区域写入消息
  const liveRegion = document.getElementById('aria-live-region');
  if (liveRegion) liveRegion.textContent = msg;
}

const showToast = toast;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// escapeHtml 统一从 utils/sanitize.js 导入，消灭重复定义

// ========== 应用状态 ==========

const state = createStore<AppInitialState>({
  inputText: '',
  moodTagId: null,
  uploadedImage: null,
  selectedDirectorIds: [],
  currentPosterIndex: 0,
  posterResults: [],
  isGenerating: false,
  posterFormat: 'vertical',
  customStyles: [],
  history: [],
  wallItems: [],
  aiEngine: 'seedream',
  useAI: true,
  aiHealthStatus: null,
  emotionAnalysis: null,
  imageEmotionAnalysis: null,
  styleSource: 'preset',
  currentCustomStyle: null,
  activeCustomStyleId: null,
  movieStyle: null,
  blendStyle: null,
  showQuote: true,
  currentTitle: '',
  altTitles: [],
  currentQuote: '',
  currentQuoteIndex: -1,
  voiceRecognition: null,
  isListening: false,
  cocreateContributors: [],
  cocreateAnalysis: null,
  trailerTimer: null,
  genTimer: null,
});

// ========== 弹窗焦点管理 ==========

/** ZJModal 组件接口（类型安全调用，替代 as any） */
interface ZJModalElement extends HTMLElement {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/** 类型守卫：判断元素是否为 zj-modal 组件 */
function isZJModal(el: HTMLElement): el is ZJModalElement {
  return el.tagName === 'ZJ-MODAL' && typeof (el as ZJModalElement).open === 'function';
}

/** WeakMap 存储焦点陷阱和先前焦点，替代在 DOM 上挂自定义属性 */
const focusTrapMap = new WeakMap<HTMLElement, (e: KeyboardEvent) => void>();
const previousFocusMap = new WeakMap<HTMLElement, HTMLElement | null>();

// 所有弹窗 ID 清单（zj-modal + 原生 div）
const ALL_MODAL_IDS = [
  'result-tools-modal',
  'style-editor-modal',
  'director-swap-modal',
  'creative-modal',
  'movie-detail-overlay',
];

// 查找弹窗元素：先按 id 查 .modal-overlay，再查原生 div
function findModalEl(id: string): HTMLElement | null {
  // zj-modal 内部的 .modal-overlay 有对应 id
  const overlay = document.getElementById(id);
  if (overlay) return overlay;
  // 原生 div 弹窗
  return $(id);
}

// 查找 zj-modal 父元素（如果弹窗是 zj-modal 组件）
function findZJModalParent(el: HTMLElement): ZJModalElement | null {
  let parent: HTMLElement | null = el.parentElement;
  while (parent) {
    if (isZJModal(parent)) return parent;
    parent = parent.parentElement;
  }
  return null;
}

// 获取弹窗内所有可聚焦元素
function getFocusable(modal: HTMLElement): HTMLElement[] {
  return Array.from(
    modal.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

// 统一打开弹窗：处理焦点陷阱
function openModal(id: string): void {
  const el = findModalEl(id);
  if (!el) return;

  // 如果是 zj-modal 内部的 overlay，调用组件的 .open()
  const zjParent = findZJModalParent(el);
  if (zjParent) {
    zjParent.open();
    return;
  }

  // 原生 div 弹窗：手动实现焦点陷阱
  el.style.display = 'flex';

  // 保存当前焦点（用 WeakMap 替代 DOM 挂载）
  previousFocusMap.set(el, document.activeElement as HTMLElement | null);

  // 聚焦到弹窗内首个可聚焦元素
  const focusable = getFocusable(el);
  if (focusable.length > 0) {
    focusable[0].focus();
  }

  // 添加 Tab 焦点陷阱
  const trap = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return;
    const items = getFocusable(el);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  focusTrapMap.set(el, trap);
  el.addEventListener('keydown', trap);
}

// 统一关闭弹窗：恢复焦点
function closeModal(id: string): void {
  const el = findModalEl(id);
  if (!el) return;

  // 如果是 zj-modal 内部的 overlay，调用组件的 .close()
  const zjParent = findZJModalParent(el);
  if (zjParent) {
    zjParent.close();
    return;
  }

  // 原生 div 弹窗
  el.style.display = 'none';

  // 移除焦点陷阱（用 WeakMap 替代 DOM 挂载）
  const trap = focusTrapMap.get(el);
  if (trap) {
    el.removeEventListener('keydown', trap);
    focusTrapMap.delete(el);
  }

  // 恢复焦点
  const prev = previousFocusMap.get(el);
  if (prev && prev.focus) {
    prev.focus();
    previousFocusMap.delete(el);
  }
}

// 检查是否有弹窗打开
function isAnyModalOpen(): boolean {
  return ALL_MODAL_IDS.some((id) => {
    const el = findModalEl(id);
    return el && el.style.display !== 'none';
  });
}

// 关闭所有弹窗，返回是否有弹窗被关闭
function closeAllModals(): boolean {
  let closedAny = false;
  ALL_MODAL_IDS.forEach((id) => {
    const el = findModalEl(id);
    if (el && el.style.display !== 'none') {
      closeModal(id);
      closedAny = true;
    }
  });
  return closedAny;
}

// ========== 结果工具弹窗 Tab 切换 ==========

/** 打开结果工具弹窗并切换到指定 Tab */
function openResultToolsModal(tab: string): void {
  openModal('result-tools-modal');
  switchResultToolsTab(tab);
}

/** 切换结果工具弹窗的 Tab 面板 */
function switchResultToolsTab(tab: string): void {
  document.querySelectorAll<HTMLElement>('.result-tools-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.resultTab === tab);
  });
  document.querySelectorAll<HTMLElement>('.result-tools-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.resultPanel === tab);
  });
}

export {
  $,
  pages,
  navigate,
  toast,
  showToast,
  sleep,
  escapeHtml,
  sanitizeColor,
  sanitizeImageUrl,
  sanitizeAttr,
  state,
  logger,
  openModal,
  closeModal,
  isAnyModalOpen,
  closeAllModals,
  openResultToolsModal,
  switchResultToolsTab,
  ALL_MODAL_IDS,
};
