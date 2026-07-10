/**
 * 造境 ZaoJing Web Components
 * 提取重复 HTML 模式为可复用组件
 *
 * 组件列表：
 *   <zj-modal>     — 模态弹窗（9 处重复 → 1 个组件）
 *   <zj-toast>     — Toast 通知
 *   <zj-loading>   — 加载遮罩 + 步骤指示器
 *
 * P2-2 重构要点：
 *   - zj-modal 用 DOM API 移动子节点替代 innerHTML 拼接（修复 XSS 隐患）
 *   - zj-modal 添加 observedAttributes + attributeChangedCallback（声明式 open 属性生效）
 *   - zj-loading 添加 disconnectedCallback（防止内存泄漏）
 *   - 所有来自 HTML 属性的动态值经 sanitizeAttr 校验后再使用
 */

import { sanitizeAttr } from './utils/sanitize.js';

// ========== <zj-modal> 模态弹窗组件 ==========
// 用法：
//   <zj-modal modal-id="director-swap-modal" title="🎬 如果换导演" subtitle="选择一位导演">
//     <!-- 弹窗内容放在这里 -->
//   </zj-modal>
//
// 属性：
//   modal-id        — 弹窗 ID（内部 .modal-overlay 的 id）
//   title           — 弹窗标题
//   subtitle        — 副标题
//   close-id        — 关闭按钮 ID（默认：modal-id 的 "-modal" 替换为 "-close"）
//   close-char      — 关闭按钮字符（默认 "✕"，可选 "×"）
//   title-tag       — 标题标签（默认 "h3"，可选 "h2"）
//   subtitle-class  — 副标题 CSS 类（默认 "modal-subtitle"，可选 "modal-desc"）
//   open            — 是否显示（声明式，observedAttributes 监听变化）
//
// 方法：
//   open()   — 打开弹窗（命令式，向后兼容）
//   close()  — 关闭弹窗
//   isOpen() — 是否打开

class ZJModal extends HTMLElement {
  _initialized = false;
  _keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  _trapFocus: ((e: KeyboardEvent) => void) | null = null;
  _previouslyFocused: HTMLElement | null = null;
  _overlay: HTMLElement | null = null;

  /** 声明式属性监听：open 属性变化时自动打开/关闭 */
  static get observedAttributes(): string[] {
    return ['open'];
  }

  attributeChangedCallback(name: string, _oldVal: string, newVal: string): void {
    if (name === 'open' && this._initialized) {
      // 属性变化驱动开/关，不操作 attribute 避免循环
      if (newVal !== null) {
        this._doOpen();
      } else {
        this._doClose();
      }
    }
  }

  connectedCallback(): void {
    if (this._initialized) return;
    this._initialized = true;

    // 校验来自 HTML 属性的值，防止属性注入 XSS
    // ID/类名只允许字母、数字、连字符、下划线
    const idPattern = /^[a-zA-Z0-9_-]+$/;
    const classPattern = /^[a-zA-Z0-9 _-]+$/;
    const tagPattern = /^h[1-6]$/;

    const rawModalId = this.getAttribute('modal-id') || '';
    const title = this.getAttribute('title') || '';
    const subtitle = this.getAttribute('subtitle') || '';
    const rawCloseChar = this.getAttribute('close-char') || '✕';
    const rawTitleTag = this.getAttribute('title-tag') || 'h3';
    const rawSubtitleClass = this.getAttribute('subtitle-class') || 'modal-subtitle';
    const isOpen = this.hasAttribute('open');

    const modalId = sanitizeAttr(rawModalId, idPattern, 'modal');
    // closeId 基于 modalId 计算（或直接从属性获取），同样需要校验
    const rawCloseId = this.getAttribute('close-id') || modalId.replace(/-modal$/, '-close');
    const closeId = sanitizeAttr(rawCloseId, idPattern, 'modal-close');
    const rawContentClass = this.getAttribute('content-class') || modalId.replace(/-modal$/, '-content');
    const contentClass = sanitizeAttr(rawContentClass, classPattern, 'modal-content');
    // closeChar 只取第一个字符，防止注入长字符串
    const closeChar = rawCloseChar ? rawCloseChar.charAt(0) : '✕';
    const titleTag = sanitizeAttr(rawTitleTag, tagPattern, 'h3');
    const subtitleClass = sanitizeAttr(rawSubtitleClass, classPattern, 'modal-subtitle');

    // 保存原始子节点引用（用 DOM API 移动，而非 innerHTML 拼接，防 XSS）
    const childNodes = Array.from(this.childNodes);

    // 构建弹窗骨架结构
    this.innerHTML = `
      <div class="modal-overlay" id="${modalId}" style="display:${isOpen ? 'flex' : 'none'}" role="dialog" aria-modal="true">
        <div class="modal-content ${contentClass}">
          <button class="modal-close" id="${closeId}" aria-label="关闭"></button>
        </div>
      </div>
    `;
    // closeChar 通过 textContent 安全设置，不拼入 innerHTML
    const closeBtn = this.querySelector<HTMLElement>('.modal-close');
    if (closeBtn) closeBtn.textContent = closeChar;

    this._overlay = this.querySelector<HTMLElement>('.modal-overlay');
    const contentEl = this.querySelector<HTMLElement>('.modal-content');

    // 用 textContent 安全添加标题和副标题（防 XSS）
    if (title && contentEl) {
      const titleEl = document.createElement(titleTag);
      titleEl.className = 'modal-title';
      titleEl.textContent = title; // 安全：textContent 不解析 HTML
      contentEl.appendChild(titleEl);
    }
    if (subtitle && contentEl) {
      const subEl = document.createElement('p');
      subEl.className = subtitleClass;
      subEl.textContent = subtitle; // 安全：textContent 不解析 HTML
      contentEl.appendChild(subEl);
    }

    // 用 DOM API 移动原始子节点（而非 innerHTML 拼接，防 XSS）
    if (contentEl) {
      childNodes.forEach((node) => contentEl.appendChild(node));
    }

    // 点击遮罩关闭
    if (this._overlay) {
      this._overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === this._overlay) {
          this.close();
          this._dispatchClose();
        }
      });
    }

    // 关闭按钮（closeBtn 已在上方获取并设置 textContent）
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.close();
        this._dispatchClose();
      });
    }

    // Escape 键关闭
    const keydownHandler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
        this._dispatchClose();
      }
    };
    this._keydownHandler = keydownHandler;
    document.addEventListener('keydown', keydownHandler);
  }

  _dispatchClose(): void {
    this.dispatchEvent(new CustomEvent<void>('zj:close', { bubbles: true }));
  }

  /** 命令式打开：设置 open 属性触发 attributeChangedCallback */
  open(): void {
    this.setAttribute('open', '');
  }

  /** 命令式关闭：移除 open 属性触发 attributeChangedCallback */
  close(): void {
    this.removeAttribute('open');
  }

  /** 实际打开逻辑（由 attributeChangedCallback 或 connectedCallback 初始状态调用） */
  _doOpen(): void {
    if (!this._overlay) return;
    this._overlay.style.display = 'flex';
    this._previouslyFocused = document.activeElement as HTMLElement | null;
    const closeBtn = this.querySelector<HTMLElement>('.modal-close');
    if (closeBtn) closeBtn.focus();
    const trapFocus = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab') return;
      const focusable = this.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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
    this._trapFocus = trapFocus;
    this.addEventListener('keydown', trapFocus);
  }

  /** 实际关闭逻辑（由 attributeChangedCallback 调用） */
  _doClose(): void {
    if (!this._overlay) return;
    this._overlay.style.display = 'none';
    if (this._trapFocus) {
      this.removeEventListener('keydown', this._trapFocus);
      this._trapFocus = null;
    }
    if (this._previouslyFocused && this._previouslyFocused.focus) {
      this._previouslyFocused.focus();
      this._previouslyFocused = null;
    }
  }

  isOpen(): boolean {
    return this._overlay ? this._overlay.style.display !== 'none' : false;
  }

  disconnectedCallback(): void {
    if (this._keydownHandler) {
      document.removeEventListener('keydown', this._keydownHandler);
      this._keydownHandler = null;
    }
    if (this._trapFocus) {
      this.removeEventListener('keydown', this._trapFocus);
      this._trapFocus = null;
    }
  }
}

// ========== <zj-toast> Toast 通知组件 ==========
// 用法：
//   <zj-toast id="toast"></zj-toast>
//   // 推荐通过 shared.ts 的 toast() 函数调用，不直接操作组件
//   import { toast } from './shared.js';
//   toast('消息内容', 3000);
//
// 方法：
//   show(message, duration) — 显示消息，duration 默认 2500ms
//   hide()                  — 手动隐藏
//
// 注意：内部 div 不使用 id（避免与宿主元素 id 重复），样式使用 .toast.show 类名
//       与全局 CSS 保持一致。

class ZJToast extends HTMLElement {
  _initialized = false;
  _toastEl: HTMLElement | null = null;
  _timer: ReturnType<typeof setTimeout> | null = null;

  connectedCallback(): void {
    if (this._initialized) return;
    this._initialized = true;

    this.innerHTML = `
      <div class="toast" role="status" aria-live="polite" aria-atomic="true" style="display:none"></div>
    `;
    this._toastEl = this.querySelector<HTMLElement>('.toast');
    this._timer = null;
  }

  show(message: string, duration: number = 2500): void {
    if (!this._toastEl) return;
    this._toastEl.textContent = message; // 安全：textContent 防止 XSS
    this._toastEl.style.display = '';
    this._toastEl.classList.add('show');

    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.hide(), duration);
  }

  hide(): void {
    if (!this._toastEl) return;
    this._toastEl.classList.remove('show');
    this._toastEl.style.display = 'none';
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  disconnectedCallback(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }
}

// ========== <zj-loading> 加载遮罩组件 ==========
// 用法：
//   <zj-loading id="loading-overlay" steps="4"></zj-loading>
//   const loading = document.getElementById('loading-overlay');
//   loading.show();
//   loading.setStep(2);   // 设置当前步骤
//   loading.hide();
//
// 属性：
//   steps — 总步骤数（默认 4）
//   title — 加载标题（默认"AI 正在创作…"）

class ZJLoading extends HTMLElement {
  _initialized = false;
  _overlay: HTMLElement | null = null;
  _subtext: HTMLElement | null = null;
  _steps: NodeListOf<Element> | null = null;
  _totalSteps = 0;

  connectedCallback(): void {
    if (this._initialized) return;
    this._initialized = true;

    // 校验来自 HTML 属性的值
    const idPattern = /^[a-zA-Z0-9_-]+$/;
    const rawLoadingId = this.id || 'loading-overlay';
    const loadingId = sanitizeAttr(rawLoadingId, idPattern, 'loading-overlay');
    const steps = parseInt(this.getAttribute('steps') || '4', 10);
    // title 不拼入 innerHTML，通过 textContent 安全设置
    const safeSteps = isNaN(steps) || steps < 1 ? 4 : Math.min(steps, 10);

    const dots = Array.from(
      { length: safeSteps },
      (_, i) => `<div class="gen-step-dot${i === 0 ? ' active' : ''}"></div>`
    ).join('');

    this.innerHTML = `
      <div class="loading-overlay" id="${loadingId}" style="display:none">
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-text"></div>
          <div class="loading-subtext" id="loading-subtext">正在分析情绪…</div>
          <div class="gen-steps" id="gen-steps">${dots}</div>
        </div>
      </div>
    `;
    // title 通过 textContent 安全设置
    const title = this.getAttribute('title') || 'AI 正在创作…';
    const titleEl = this.querySelector<HTMLElement>('.loading-text');
    if (titleEl) titleEl.textContent = title;

    this._overlay = this.querySelector<HTMLElement>('.loading-overlay');
    this._subtext = this.querySelector<HTMLElement>('.loading-subtext');
    this._steps = this.querySelectorAll('.gen-step-dot');
    this._totalSteps = safeSteps;
  }

  show(): void {
    if (this._overlay) this._overlay.style.display = 'flex';
  }

  hide(): void {
    if (this._overlay) this._overlay.style.display = 'none';
  }

  setStep(step: number): void {
    if (!this._steps) return;
    this._steps.forEach((dot, i) => {
      dot.classList.toggle('active', i <= step - 1);
    });
  }

  setSubtext(text: string): void {
    if (this._subtext) this._subtext.textContent = text;
  }

  /** P2-2 补全：清理 DOM 引用，防止内存泄漏 */
  disconnectedCallback(): void {
    this._overlay = null;
    this._subtext = null;
    this._steps = null;
  }
}

// ========== 注册自定义元素 ==========
customElements.define('zj-modal', ZJModal);
customElements.define('zj-toast', ZJToast);
customElements.define('zj-loading', ZJLoading);

export { ZJModal, ZJToast, ZJLoading };
