/**
 * 造境 ZaoJing Service Worker
 * 缓存策略：
 * - 静态资源（JS/CSS/字体/图片）：Cache First，回退网络
 * - API 请求：Network First，回退缓存
 * - 页面导航：Network First，回退离线页面
 */

const CACHE_VERSION = 'zaojing-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

// 预缓存的核心资源
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// 静态资源匹配模式
const STATIC_PATTERNS = [
  /\.(?:js|ts|css|woff2?|ttf|png|jpg|jpeg|gif|svg|ico|webp)$/,
  /^https?:\/\/[^/]+\/assets\//,
];

// API 路径匹配
const API_PATTERNS = [
  /^\/api\/movies/,
  /^\/api\/mcp\/gallery/,
  /^\/api\/health/,
];

// ========== 安装阶段：预缓存 ==========
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ========== 激活阶段：清理旧缓存 ==========
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ========== 请求拦截 ==========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源请求
  if (url.origin !== self.location.origin) return;

  // 跳过非 GET 请求
  if (request.method !== 'GET') return;

  // 导航请求：Network First
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }

  // 静态资源：Cache First
  if (STATIC_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // API 请求：Network First（带缓存回退）
  if (API_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(networkFirst(request, null, API_CACHE, 300000)); // 5分钟缓存
    return;
  }

  // 其他请求：直接走网络
});

// ========== 缓存策略函数 ==========

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    // 离线且无缓存，返回离线提示
    return new Response('离线模式：资源不可用', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function networkFirst(request, fallbackUrl, cacheName = STATIC_CACHE, maxAge = 0) {
  const cache = cacheName ? await caches.open(cacheName) : null;
  try {
    const response = await fetch(request);
    if (response.ok && cache) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // 网络失败，尝试缓存
    if (cache) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    // 尝试回退页面
    if (fallbackUrl) {
      const fallbackCache = await caches.open(STATIC_CACHE);
      const fallback = await fallbackCache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response('离线模式：无法连接服务器', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
