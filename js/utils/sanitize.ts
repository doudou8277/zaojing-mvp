/**
 * 造境 ZaoJing XSS 防护工具
 * 提供 HTML 转义、CSS 颜色校验、URL 协议白名单、属性值校验等函数，防止注入攻击
 */

/**
 * 标记为安全 HTML 的值
 * 通过 safe() 标记的内容在 safeHtml 模板中不会被转义
 */
export interface SafeHtml {
  __safe_html: true;
  value: string;
}

/**
 * 转义 HTML 特殊字符，防止 XSS
 * 将 &, <, >, ", ' 转义为对应的 HTML 实体
 */
export function escapeHtml(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 安全地构建 HTML 模板字符串
 * 用法: safeHtml`<div>${userInput}</div>`
 * 标记为 safe 的部分不会被转义，其余 ${} 自动转义
 */
export function safeHtml(strings: TemplateStringsArray, ...values: unknown[]): string {
  let result = strings[0];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val !== null && val !== undefined && (val as SafeHtml).__safe_html) {
      // 标记为安全的 HTML，不转义
      result += (val as SafeHtml).value;
    } else {
      result += escapeHtml(val);
    }
    result += strings[i + 1];
  }
  return result;
}

/**
 * 标记字符串为安全 HTML（不转义）
 * 用法: safe`<span class="icon">🎬</span>`
 */
export function safe(value: unknown): SafeHtml {
  return { __safe_html: true, value: String(value) };
}

/**
 * 校验颜色值是否安全（防止 CSS 注入）
 * 只接受合法的 hex 颜色、rgb/rgba、hsl/hsla
 * @param color - 待校验的颜色字符串
 * @param fallback - 校验失败时返回的默认颜色
 */
export function sanitizeColor(color: string, fallback: string = '#1a1a1a'): string {
  if (!color || typeof color !== 'string') return fallback;
  const trimmed = color.trim();
  // 合法 hex: #RGB, #RRGGBB, #RRGGBBAA
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  // 合法 rgb/rgba: rgb(r,g,b) 或 rgba(r,g,b,a)
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/.test(trimmed)) return trimmed;
  // 合法 hsl/hsla: hsl(h,s%,l%) 或 hsla(h,s%,l%,a)
  if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*(,\s*[\d.]+\s*)?\)$/.test(trimmed)) return trimmed;
  // 不安全，返回默认值
  return fallback;
}

/**
 * 校验图片 URL 是否安全（防止 javascript: 等危险协议）
 * 只允许 data:image/ 、blob: 、http://localhost、https:// 协议
 * @param url - 待校验的 URL
 */
export function sanitizeImageUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  // 允许 data:image/ 协议（用户上传的图片）
  if (trimmed.startsWith('data:image/')) return trimmed;
  // 允许 blob: 协议（本地生成的 Blob URL）
  if (trimmed.startsWith('blob:')) return trimmed;
  // 允许 https:// 协议
  if (trimmed.startsWith('https://')) return trimmed;
  // 允许 http://localhost（本地开发）
  if (/^http:\/\/localhost(:\d+)?\//.test(trimmed)) return trimmed;
  // 拒绝 javascript:、data:text/html、vbscript: 等危险协议
  return '';
}

/**
 * 校验 HTML 属性值是否匹配允许的字符模式（防止属性注入 XSS）
 * @param value - 待校验的属性值
 * @param pattern - 允许的正则模式
 * @param fallback - 校验失败时返回的默认值
 */
export function sanitizeAttr(value: string, pattern: RegExp, fallback: string = ''): string {
  if (!value || typeof value !== 'string') return fallback;
  return pattern.test(value) ? value : fallback;
}

/**
 * 安全释放 Blob URL，避免内存泄漏
 * 仅释放以 blob: 开头的 URL，对 null/undefined/非 blob URL 安全无操作
 * @param url - 待释放的 URL
 */
export function safeRevokeUrl(url: string | null | undefined): void {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}
