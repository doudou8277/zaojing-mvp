/**
 * 造境 ZaoJing 图片懒加载模块
 * 使用 IntersectionObserver 实现视口内图片按需加载
 */

import { logger } from './logger.js';

// 已观察的元素集合，避免重复观察
const observed = new WeakSet();
let observer = null;

/**
 * 初始化 IntersectionObserver
 */
function getObserver() {
  if (observer) return observer;
  if (!('IntersectionObserver' in window)) {
    logger.warn('[LazyLoad] 当前浏览器不支持 IntersectionObserver，回退到直接加载');
    return null;
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target;
          loadImage(el);
          observer.unobserve(el);
        }
      }
    },
    {
      rootMargin: '200px', // 提前 200px 开始加载
      threshold: 0.01,
    }
  );

  return observer;
}

/**
 * 加载单个图片元素
 */
function loadImage(el) {
  const src = el.dataset.src;
  if (!src) return;

  if (el.tagName === 'IMG') {
    el.src = src;
    el.removeAttribute('data-src');
    el.addEventListener('load', () => el.classList.add('loaded'), { once: true });
    el.addEventListener(
      'error',
      () => {
        el.classList.add('load-error');
        logger.warn('[LazyLoad] 图片加载失败:', src);
      },
      { once: true }
    );
  } else {
    // 背景图模式
    el.style.backgroundImage = `url(${src})`;
    el.removeAttribute('data-src');
    el.classList.add('loaded');
  }
}

/**
 * 注册元素到懒加载观察器
 * @param {HTMLElement|NodeList|string} target - 元素、元素列表或选择器
 */
export function lazyLoad(target) {
  const obs = getObserver();
  if (!obs) {
    // 不支持 IntersectionObserver，直接加载所有
    let elements;
    if (typeof target === 'string') {
      elements = document.querySelectorAll(target);
    } else if (target instanceof NodeList) {
      elements = target;
    } else {
      elements = [target];
    }
    elements.forEach(loadImage);
    return;
  }

  let elements;
  if (typeof target === 'string') {
    elements = document.querySelectorAll(target);
  } else if (target instanceof NodeList) {
    elements = target;
  } else {
    elements = [target];
  }

  for (const el of elements) {
    if (observed.has(el)) continue;
    observed.add(el);
    obs.observe(el);
  }
}

/**
 * 为所有带 data-src 属性的元素启用懒加载
 */
export function lazyLoadAll() {
  lazyLoad('[data-src]');
}

/**
 * 断开观察器（页面切换时清理）
 */
export function disconnectLazyLoad() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}
