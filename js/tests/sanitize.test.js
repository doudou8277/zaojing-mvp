/**
 * 造境 ZaoJing XSS 防护工具单元测试
 * 覆盖 escapeHtml / sanitizeColor / sanitizeImageUrl / sanitizeAttr 的正常路径与错误路径
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeColor, sanitizeImageUrl, sanitizeAttr } from '../utils/sanitize.js';

describe('escapeHtml', () => {
  // ========== 基本字符转义 ==========

  it('应转义 < 字符为 &lt;', () => {
    expect(escapeHtml('<')).toBe('&lt;');
  });

  it('应转义 > 字符为 &gt;', () => {
    expect(escapeHtml('>')).toBe('&gt;');
  });

  it('应转义 & 字符为 &amp;', () => {
    expect(escapeHtml('&')).toBe('&amp;');
  });

  it('应转义 " 字符为 &quot;', () => {
    expect(escapeHtml('"')).toBe('&quot;');
  });

  it("应转义 ' 字符为 &#39;", () => {
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('应同时转义所有特殊字符', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('应转义包含 & 的混合字符串（& 优先转义避免双重转义）', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('不应转义普通文本', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('应转义包含单引号和双引号的字符串', () => {
    expect(escapeHtml("it's a \"test\"")).toBe('it&#39;s a &quot;test&quot;');
  });

  // ========== null / undefined 输入 ==========

  it('应处理 null 输入，返回空字符串', () => {
    expect(escapeHtml(null)).toBe('');
  });

  it('应处理 undefined 输入，返回空字符串', () => {
    expect(escapeHtml(undefined)).toBe('');
  });

  // ========== 非字符串输入 ==========

  it('应处理数字输入，转换为字符串', () => {
    expect(escapeHtml(123)).toBe('123');
  });

  it('应处理数字 0 输入', () => {
    expect(escapeHtml(0)).toBe('0');
  });

  it('应处理布尔值输入，转换为字符串', () => {
    expect(escapeHtml(true)).toBe('true');
    expect(escapeHtml(false)).toBe('false');
  });

  it('应处理包含特殊字符的数字字符串', () => {
    expect(escapeHtml('1 < 2 && 3 > 0')).toBe('1 &lt; 2 &amp;&amp; 3 &gt; 0');
  });

  it('应处理空字符串', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('应处理包含 HTML 标签的完整字符串', () => {
    const input = '<div class="test">Hello & welcome</div>';
    const expected = '&lt;div class=&quot;test&quot;&gt;Hello &amp; welcome&lt;/div&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  // ========== XSS 注入尝试 ==========

  it('应防御典型 script 标签 XSS 注入', () => {
    const input = '<script>alert(1)</script>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&lt;/script&gt;');
  });

  it('应防御 img onerror XSS 注入', () => {
    const input = '<img src=x onerror=alert(1)>';
    const result = escapeHtml(input);
    expect(result).not.toContain('<img');
    expect(result).toContain('&lt;img');
  });

  // ========== 中文与 Unicode ==========

  it('应正确处理中文字符（不被转义）', () => {
    const input = '你好，世界！电影海报生成器';
    expect(escapeHtml(input)).toBe(input);
  });

  it('应处理中英混合含 HTML 的字符串', () => {
    const input = '<b>宫崎骏</b> 的电影 & 梦想';
    const expected = '&lt;b&gt;宫崎骏&lt;/b&gt; 的电影 &amp; 梦想';
    expect(escapeHtml(input)).toBe(expected);
  });
});

// ========== sanitizeColor 测试 ==========
describe('sanitizeColor', () => {
  it('应接受合法的 3 位 hex 颜色', () => {
    expect(sanitizeColor('#fff')).toBe('#fff');
    expect(sanitizeColor('#abc')).toBe('#abc');
  });

  it('应接受合法的 6 位 hex 颜色', () => {
    expect(sanitizeColor('#ff0000')).toBe('#ff0000');
    expect(sanitizeColor('#1a1a1a')).toBe('#1a1a1a');
  });

  it('应接受合法的 8 位 hex 颜色（含 alpha）', () => {
    expect(sanitizeColor('#ff0000ff')).toBe('#ff0000ff');
  });

  it('应接受合法的 rgb() 颜色', () => {
    expect(sanitizeColor('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
    expect(sanitizeColor('rgb(0,0,0)')).toBe('rgb(0,0,0)');
  });

  it('应接受合法的 rgba() 颜色', () => {
    expect(sanitizeColor('rgba(255, 0, 0, 0.5)')).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('应接受合法的 hsl() 颜色', () => {
    expect(sanitizeColor('hsl(0, 100%, 50%)')).toBe('hsl(0, 100%, 50%)');
  });

  it('应接受合法的 hsla() 颜色', () => {
    expect(sanitizeColor('hsla(0, 100%, 50%, 0.5)')).toBe('hsla(0, 100%, 50%, 0.5)');
  });

  it('应拒绝 CSS 注入字符串（red; background:url(javascript:...)）', () => {
    const malicious = 'red; background:url(javascript:alert(1))';
    const result = sanitizeColor(malicious, '#000');
    expect(result).toBe('#000');
    expect(result).not.toContain('javascript');
    expect(result).not.toContain('background');
  });

  it('应拒绝 expression 注入', () => {
    const malicious = 'expression(alert(1))';
    expect(sanitizeColor(malicious, '#fff')).toBe('#fff');
  });

  it('null 输入应返回 fallback', () => {
    expect(sanitizeColor(null, '#000')).toBe('#000');
  });

  it('undefined 输入应返回 fallback', () => {
    expect(sanitizeColor(undefined, '#000')).toBe('#000');
  });

  it('空字符串应返回 fallback', () => {
    expect(sanitizeColor('', '#000')).toBe('#000');
  });

  it('非字符串类型（数字）应返回 fallback', () => {
    expect(sanitizeColor(123, '#000')).toBe('#000');
  });

  it('超长字符串（>1000 字符）应返回 fallback（非法值）', () => {
    const longStr = '#' + 'f'.repeat(2000);
    // 合法 hex 正则只允许 3-8 位，超长 hex 不匹配
    expect(sanitizeColor(longStr, '#000')).toBe('#000');
  });

  it('颜色名 "red" 不在白名单中，应返回 fallback', () => {
    expect(sanitizeColor('red', '#000')).toBe('#000');
  });

  it('默认 fallback 为 #1a1a1a', () => {
    expect(sanitizeColor('invalid-color')).toBe('#1a1a1a');
  });
});

// ========== sanitizeImageUrl 测试 ==========
describe('sanitizeImageUrl', () => {
  it('应接受合法的 data:image/png URL', () => {
    const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA';
    expect(sanitizeImageUrl(url)).toBe(url);
  });

  it('应接受合法的 data:image/jpeg URL', () => {
    const url = 'data:image/jpeg;base64,/9j/4AAQSkZJRg';
    expect(sanitizeImageUrl(url)).toBe(url);
  });

  it('应接受合法的 https:// URL', () => {
    const url = 'https://example.com/image.png';
    expect(sanitizeImageUrl(url)).toBe(url);
  });

  it('应接受 blob: URL', () => {
    const url = 'blob:http://localhost:8127/uuid-string';
    expect(sanitizeImageUrl(url)).toBe(url);
  });

  it('应拒绝 javascript: 协议（XSS 危险）', () => {
    const malicious = 'javascript:alert(1)';
    expect(sanitizeImageUrl(malicious)).toBe('');
  });

  it('应拒绝 javascript: 伪协议编码形式', () => {
    const malicious = 'JaVaScRiPt:alert(document.cookie)';
    expect(sanitizeImageUrl(malicious)).toBe('');
  });

  it('应拒绝 data:text/html（HTML 注入）', () => {
    const malicious = 'data:text/html,<script>alert(1)</script>';
    expect(sanitizeImageUrl(malicious)).toBe('');
  });

  it('应拒绝 vbscript: 协议', () => {
    expect(sanitizeImageUrl('vbscript:msgbox(1)')).toBe('');
  });

  it('应拒绝 file:// 协议', () => {
    expect(sanitizeImageUrl('file:///etc/passwd')).toBe('');
  });

  it('null 输入应返回空字符串', () => {
    expect(sanitizeImageUrl(null)).toBe('');
  });

  it('undefined 输入应返回空字符串', () => {
    expect(sanitizeImageUrl(undefined)).toBe('');
  });

  it('空字符串应返回空字符串', () => {
    expect(sanitizeImageUrl('')).toBe('');
  });

  it('非字符串类型应返回空字符串', () => {
    expect(sanitizeImageUrl(123)).toBe('');
    expect(sanitizeImageUrl({})).toBe('');
  });

  it('URL 前后有空白应被 trim 后仍可识别为合法', () => {
    expect(sanitizeImageUrl('  https://example.com/a.png  ')).toBe('https://example.com/a.png');
  });
});

// ========== sanitizeAttr 测试 ==========
describe('sanitizeAttr', () => {
  const idPattern = /^[a-zA-Z0-9_-]{1,64}$/;

  it('应接受合法的 id 属性值', () => {
    expect(sanitizeAttr('my-id-123', idPattern)).toBe('my-id-123');
  });

  it('应拒绝含特殊字符（引号、空格）的 id', () => {
    expect(sanitizeAttr('id" onload="alert(1)', idPattern)).toBe('');
  });

  it('应拒绝含 < > 字符的属性注入尝试', () => {
    expect(sanitizeAttr('id><script>alert(1)</script>', idPattern)).toBe('');
  });

  it('null 输入应返回 fallback', () => {
    expect(sanitizeAttr(null, idPattern, 'default')).toBe('default');
  });

  it('undefined 输入应返回 fallback', () => {
    expect(sanitizeAttr(undefined, idPattern, 'default')).toBe('default');
  });

  it('空字符串应返回 fallback', () => {
    expect(sanitizeAttr('', idPattern, 'fallback')).toBe('fallback');
  });

  it('非字符串类型应返回 fallback', () => {
    expect(sanitizeAttr(123, idPattern, 'fb')).toBe('fb');
  });

  it('合法值应原样返回（含下划线和短横线）', () => {
    expect(sanitizeAttr('hello_world-123', idPattern)).toBe('hello_world-123');
  });

  it('默认 fallback 为空字符串', () => {
    expect(sanitizeAttr('bad id!!!', idPattern)).toBe('');
  });
});
