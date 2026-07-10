/**
 * 造境 ZaoJing Web Components 单元测试
 * 测试 js/components.ts 中的自定义元素注册与基本行为
 *
 * 注意：Web Components 需要 DOM 环境，本测试使用 jsdom。
 * 如果测试环境不支持 customElements，相关测试将被跳过。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// 检测当前环境是否支持 customElements
const supportsCustomElements = typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined';

// 根据环境支持情况决定是否运行测试
const describeOrSkip = supportsCustomElements ? describe : describe.skip;

// 动态导入组件模块，避免在不支持的环境下报错
let ZJModal, ZJToast, ZJLoading;

if (supportsCustomElements) {
  const mod = await import('../components');
  ZJModal = mod.ZJModal;
  ZJToast = mod.ZJToast;
  ZJLoading = mod.ZJLoading;
}

describeOrSkip('Web Components 自定义元素注册', () => {
  it('应成功导入三个组件类', () => {
    expect(ZJModal).toBeDefined();
    expect(ZJToast).toBeDefined();
    expect(ZJLoading).toBeDefined();
  });

  it('ZJModal 应继承 HTMLElement', () => {
    expect(ZJModal.prototype instanceof HTMLElement).toBe(true);
  });

  it('ZJToast 应继承 HTMLElement', () => {
    expect(ZJToast.prototype instanceof HTMLElement).toBe(true);
  });

  it('ZJLoading 应继承 HTMLElement', () => {
    expect(ZJLoading.prototype instanceof HTMLElement).toBe(true);
  });

  it('应在 customElements 注册表中注册 zj-modal', () => {
    expect(customElements.get('zj-modal')).toBe(ZJModal);
  });

  it('应在 customElements 注册表中注册 zj-toast', () => {
    expect(customElements.get('zj-toast')).toBe(ZJToast);
  });

  it('应在 customElements 注册表中注册 zj-loading', () => {
    expect(customElements.get('zj-loading')).toBe(ZJLoading);
  });
});

describeOrSkip('ZJModal 组件行为', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('zj-modal');
    element.setAttribute('modal-id', 'test-modal');
    element.setAttribute('title', '测试标题');
    element.setAttribute('subtitle', '测试副标题');
    document.body.appendChild(element);
  });

  afterEach(() => {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  it('connectedCallback 应创建模态遮罩结构', () => {
    const overlay = element.querySelector('.modal-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.id).toBe('test-modal');
  });

  it('应渲染标题和副标题', () => {
    const title = element.querySelector('.modal-title');
    expect(title).not.toBeNull();
    expect(title.textContent).toBe('测试标题');

    const subtitle = element.querySelector('.modal-subtitle');
    expect(subtitle).not.toBeNull();
    expect(subtitle.textContent).toBe('测试副标题');
  });

  it('应创建关闭按钮', () => {
    const closeBtn = element.querySelector('.modal-close');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn.id).toBe('test-close');
  });

  it('open 方法应显示模态框', () => {
    const overlay = element.querySelector('.modal-overlay');
    expect(overlay.style.display).toBe('none');

    element.open();
    expect(overlay.style.display).toBe('flex');
  });

  it('close 方法应隐藏模态框', () => {
    const overlay = element.querySelector('.modal-overlay');
    element.open();
    expect(overlay.style.display).toBe('flex');

    element.close();
    expect(overlay.style.display).toBe('none');
  });

  it('isOpen 应正确反映模态框状态', () => {
    expect(element.isOpen()).toBe(false);
    element.open();
    expect(element.isOpen()).toBe(true);
    element.close();
    expect(element.isOpen()).toBe(false);
  });
});

describeOrSkip('ZJToast 组件行为', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('zj-toast');
    element.id = 'test-toast';
    document.body.appendChild(element);
  });

  afterEach(() => {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  it('connectedCallback 应创建 toast 结构', () => {
    const toast = element.querySelector('.toast');
    expect(toast).not.toBeNull();
    // 内部 div 不再设置 id（避免与宿主元素 id 重复导致 duplicate ID）
    expect(toast.id).toBe('');
  });

  it('show 方法应显示消息', () => {
    element.show('测试消息', 9999);
    const toast = element.querySelector('.toast');
    // show() 通过添加 .show 类控制可见性，display 重置为空（由 CSS 控制）
    expect(toast.classList.contains('show')).toBe(true);
    expect(toast.textContent).toBe('测试消息');
  });

  it('hide 方法应隐藏消息', () => {
    element.show('测试消息', 9999);
    element.hide();
    const toast = element.querySelector('.toast');
    expect(toast.style.display).toBe('none');
  });
});

describeOrSkip('ZJLoading 组件行为', () => {
  let element;

  beforeEach(() => {
    element = document.createElement('zj-loading');
    element.id = 'test-loading';
    element.setAttribute('steps', '4');
    document.body.appendChild(element);
  });

  afterEach(() => {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  it('connectedCallback 应创建加载遮罩结构', () => {
    const overlay = element.querySelector('.loading-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.id).toBe('test-loading');
  });

  it('应创建指定数量的步骤指示器', () => {
    const dots = element.querySelectorAll('.gen-step-dot');
    expect(dots.length).toBe(4);
  });

  it('show 方法应显示加载遮罩', () => {
    const overlay = element.querySelector('.loading-overlay');
    element.show();
    expect(overlay.style.display).toBe('flex');
  });

  it('hide 方法应隐藏加载遮罩', () => {
    const overlay = element.querySelector('.loading-overlay');
    element.show();
    element.hide();
    expect(overlay.style.display).toBe('none');
  });

  it('setStep 应更新步骤指示器激活状态', () => {
    element.setStep(2);
    const dots = element.querySelectorAll('.gen-step-dot');
    expect(dots[0].classList.contains('active')).toBe(true);
    expect(dots[1].classList.contains('active')).toBe(true);
    expect(dots[2].classList.contains('active')).toBe(false);
    expect(dots[3].classList.contains('active')).toBe(false);
  });

  it('setSubtext 应更新加载副文本', () => {
    element.setSubtext('正在生成中…');
    const subtext = element.querySelector('.loading-subtext');
    expect(subtext.textContent).toBe('正在生成中…');
  });
});

// 如果环境不支持 customElements，提供说明
if (!supportsCustomElements) {
  describe('Web Components 测试环境检测', () => {
    it.skip('当前测试环境不支持 customElements，Web Components 测试已跳过', () => {
      // 此测试仅为注释说明，不会实际执行
    });
  });
}
