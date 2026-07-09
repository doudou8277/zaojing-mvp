/**
 * poster-engine.js 纯函数单元测试
 *
 * 覆盖范围：
 * - blendDNAs: DNA 融合算法（确定性哈希选择）
 * - blendColors: 颜色混合（hex 插值）
 * - blendPrompts: 风格描述拼接
 * - wrapText: Canvas 文本自动换行（需 mock ctx）
 * - roundRect: Canvas 圆角矩形路径（需 mock ctx）
 */

import { describe, it, expect, vi } from 'vitest';

// 导入纯函数
const { _pure } = await import('../poster-engine');
const { wrapText, roundRect, blendDNAs, blendColors, blendPrompts } = _pure;

// ========== Mock Canvas Context ==========
function createMockCtx(textWidths = {}) {
  return {
    measureText: vi.fn((text) => ({
      width: textWidths[text] !== undefined ? textWidths[text] : text.length * 10
    })),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
  };
}

// ========== blendDNAs 测试 ==========
describe('blendDNAs', () => {
  const movieDNA = {
    colorTemperature: 'warm', saturation: 'high', contrast: 'high',
    compositionType: 'dynamic', lightingType: 'dramatic', scale: 'monumental',
    pace: 'dynamic', texture: 'grainy'
  };
  const directorDNA = {
    colorTemperature: 'cool', saturation: 'low', contrast: 'low',
    compositionType: 'symmetric', lightingType: 'natural', scale: 'intimate',
    pace: 'static', texture: 'smooth'
  };

  it('ratio=0 应返回纯电影 DNA', () => {
    const result = blendDNAs(movieDNA, directorDNA, 0);
    // ratio=0 时 threshold < 0 永远为 false，所以全部取 movieDNA
    expect(result.colorTemperature).toBe('warm');
    expect(result.saturation).toBe('high');
  });

  it('ratio=1 应返回纯导演 DNA', () => {
    const result = blendDNAs(movieDNA, directorDNA, 1);
    // ratio=1 时 threshold < 1 永远为 true，所以全部取 directorDNA
    expect(result.colorTemperature).toBe('cool');
    expect(result.saturation).toBe('low');
    expect(result.pace).toBe('static');
  });

  it('默认 ratio=0.5 应融合两者', () => {
    const result = blendDNAs(movieDNA, directorDNA);
    // 确定性哈希：每个 key 有固定阈值，结果可复现
    expect(result).toBeDefined();
    expect(Object.keys(result)).toHaveLength(8);
  });

  it('相同输入应产生相同输出（确定性）', () => {
    const r1 = blendDNAs(movieDNA, directorDNA, 0.5);
    const r2 = blendDNAs(movieDNA, directorDNA, 0.5);
    expect(r1).toEqual(r2);
  });

  it('应处理缺失的 DNA 字段（fallback）', () => {
    const partial = { colorTemperature: 'warm', saturation: 'high' };
    const result = blendDNAs(partial, directorDNA, 0.5);
    expect(result).toBeDefined();
    expect(Object.keys(result)).toHaveLength(8);
  });
});

// ========== blendColors 测试 ==========
describe('blendColors', () => {
  const movieColors = {
    primary: '#ff0000', secondary: '#00ff00', accent: '#0000ff',
    bg: '#111111', text: '#ffffff', textLight: '#cccccc'
  };
  const directorColors = {
    primary: '#0000ff', secondary: '#ff00ff', accent: '#ffff00',
    bg: '#222222', text: '#eeeeee', textLight: '#aaaaaa'
  };

  it('ratio=0 应返回纯电影颜色', () => {
    const result = blendColors(movieColors, directorColors, 0);
    expect(result.primary).toBe('#ff0000');
    expect(result.bg).toBe('#111111');
  });

  it('ratio=1 应返回纯导演颜色', () => {
    const result = blendColors(movieColors, directorColors, 1);
    expect(result.primary).toBe('#0000ff');
    expect(result.bg).toBe('#222222');
  });

  it('ratio=0.5 应返回中间值', () => {
    const result = blendColors(movieColors, directorColors, 0.5);
    // #ff0000 和 #0000ff 的中间值: r=128(80), g=0, b=128(80) → #800080
    expect(result.primary).toBe('#800080');
  });

  it('应处理 null 值（fallback 到另一侧）', () => {
    const partial = { primary: '#ff0000', secondary: null, accent: '#0000ff' };
    const result = blendColors(partial, directorColors, 0.5);
    expect(result.primary).toBeDefined();
    expect(result.secondary).toBe('#ff00ff'); // null 时 fallback 到 directorColors
  });

  it('两侧颜色对象都完整时应返回所有 6 个字段', () => {
    const result = blendColors(movieColors, directorColors, 0.5);
    expect(Object.keys(result)).toHaveLength(6);
    expect(result).toHaveProperty('primary');
    expect(result).toHaveProperty('secondary');
    expect(result).toHaveProperty('accent');
    expect(result).toHaveProperty('bg');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('textLight');
  });
});

// ========== blendPrompts 测试 ==========
describe('blendPrompts', () => {
  const moviePrompt = 'warm tones, natural lighting';
  const directorPrompt = 'symmetric composition, pastel colors';

  it('ratio < 0.3 应以电影风格为主', () => {
    const result = blendPrompts(moviePrompt, directorPrompt, 0.2);
    expect(result).toContain(moviePrompt);
    expect(result).toContain('subtle');
    expect(result).toContain(directorPrompt);
  });

  it('ratio > 0.7 应以导演风格为主', () => {
    const result = blendPrompts(moviePrompt, directorPrompt, 0.8);
    expect(result).toContain(directorPrompt);
    expect(result).toContain('inspired by');
    expect(result).toContain(moviePrompt);
  });

  it('0.3 ≤ ratio ≤ 0.7 应均衡融合', () => {
    const result = blendPrompts(moviePrompt, directorPrompt, 0.5);
    expect(result).toContain('blended with');
    expect(result).toContain(moviePrompt);
    expect(result).toContain(directorPrompt);
  });

  it('moviePrompt 为空时应返回 directorPrompt', () => {
    const result = blendPrompts('', directorPrompt, 0.5);
    expect(result).toBe(directorPrompt);
  });

  it('directorPrompt 为空时应返回 moviePrompt', () => {
    const result = blendPrompts(moviePrompt, '', 0.5);
    expect(result).toBe(moviePrompt);
  });

  it('两者都为空时应返回空字符串', () => {
    const result = blendPrompts('', '', 0.5);
    expect(result).toBe('');
  });

  it('默认 ratio=0.5', () => {
    const result = blendPrompts(moviePrompt, directorPrompt);
    expect(result).toContain('blended with');
  });
});

// ========== wrapText 测试 ==========
describe('wrapText', () => {
  it('短文本应在单行返回', () => {
    const ctx = createMockCtx({ 'Hello': 30 });
    const { lines } = wrapText(ctx, 'Hello', 100);
    expect(lines).toEqual(['Hello']);
  });

  it('长文本应按字符换行（CJK/英文按各自规则）', () => {
    // 每个字符宽度 10px，maxWidth=30 → 每行约 3 个字符
    const ctx = createMockCtx();
    const { lines } = wrapText(ctx, 'ABCDEFGH', 30);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('空文本应返回空数组', () => {
    const ctx = createMockCtx();
    const { lines } = wrapText(ctx, '', 100);
    expect(lines).toEqual([]);
  });

  it('单个超宽字符应独占一行', () => {
    const ctx = createMockCtx({ 'X': 200 });
    const { lines } = wrapText(ctx, 'X', 100);
    expect(lines).toEqual(['X']);
  });

  it('中文文本应逐字符断行且不丢字（未截断时）', () => {
    const ctx = createMockCtx();
    const text = '这是一段中文文本用于测试自动换行功能';
    const { lines, truncated } = wrapText(ctx, text, 200); // 宽到足够不截断
    expect(lines.join('')).toBe(text);
    expect(truncated).toBe(false);
  });

  it('英文文本应在单词边界断行，不应在单词中间断开', () => {
    const ctx = createMockCtx();
    // 每字符 10px，maxWidth=60 约 6 字符，"hello"=50px 可放下，"hello world"=110px 不行
    const { lines } = wrapText(ctx, 'hello world', 60);
    // 不应出现 "hel" 或 "lo" 这类断词
    for (const line of lines) {
      expect(line).not.toMatch(/^lo/);
      expect(line).not.toMatch(/hel$/);
    }
    expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toContain('hello');
    expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toContain('world');
  });

  it('超出 maxLines 时应截断并在最后一行加省略号', () => {
    const ctx = createMockCtx();
    // 每字符 10px，maxWidth=100（约 10 字符/行），maxLines=2
    const { lines, truncated } = wrapText(ctx, 'AAAAABBBBBCCCCCDDDDDEEEEE', 100, 2);
    expect(truncated).toBe(true);
    expect(lines.length).toBe(2);
    // 最后一行应以省略号结尾
    expect(lines[1]).toMatch(/\.\.\.$/);
  });

  it('未超出 maxLines 时 truncated 应为 false', () => {
    const ctx = createMockCtx();
    const { lines, truncated } = wrapText(ctx, '短文本', 100, 5);
    expect(truncated).toBe(false);
    expect(lines.length).toBe(1);
  });

  it('maxLines 默认为 10', () => {
    const ctx = createMockCtx();
    // 生成足够长的文本，超过 10 行（每行约 5 字符 × 10 行 = 50 字符）
    const longText = 'A'.repeat(200);
    const { lines, truncated } = wrapText(ctx, longText, 50);
    expect(truncated).toBe(true);
    expect(lines.length).toBe(10);
  });

  // ========== wrapText 边界 case ==========

  it('空字符串应返回空数组（无行）', () => {
    const ctx = createMockCtx();
    const { lines, truncated } = wrapText(ctx, '', 100);
    expect(lines).toEqual([]);
    expect(truncated).toBe(false);
  });

  it('单超长英文单词（无空格）应逐字符断行', () => {
    const ctx = createMockCtx();
    // 每字符 10px，maxWidth=30 → 每行约 3 字符
    const longWord = 'Supercalifragilisticexpialidocious';
    // 给足够多的 maxLines（34 字符 / 3 ≈ 12 行），避免触发截断省略号
    const { lines, truncated } = wrapText(ctx, longWord, 30, 20);
    expect(lines.length).toBeGreaterThan(1);
    expect(truncated).toBe(false);
    // 所有字符应被保留（未截断时）
    expect(lines.join('').length).toBe(longWord.length);
  });

  it('maxLines=1 时应只返回一行', () => {
    const ctx = createMockCtx();
    const { lines, truncated } = wrapText(ctx, 'AAAAABBBBBCCCCCDDDDDEEEEE', 50, 1);
    expect(lines.length).toBe(1);
    expect(truncated).toBe(true);
    // 唯一一行应以省略号结尾
    expect(lines[0]).toMatch(/\.\.\.$/);
  });

  it('maxLines=0 时应返回空行数组且 truncated=true', () => {
    const ctx = createMockCtx();
    const { lines, truncated } = wrapText(ctx, 'hello world', 100, 0);
    expect(lines.length).toBe(0);
    expect(truncated).toBe(true);
  });

  it('纯中文无空格文本应正确逐字换行且不丢字（未截断时）', () => {
    const ctx = createMockCtx();
    const text = '春江潮水连海平海上明月共潮生';
    const { lines, truncated } = wrapText(ctx, text, 50); // maxWidth 小，强制多行
    expect(truncated).toBe(false);
    // 拼接后应与原文一致
    expect(lines.join('')).toBe(text);
    expect(lines.length).toBeGreaterThan(1);
  });

  it('中英混合文本应正确换行（英文按词、中文按字）', () => {
    const ctx = createMockCtx();
    const text = '电影 Inception 的导演是 Nolan，他擅长叙事迷宫';
    const { lines, truncated } = wrapText(ctx, text, 80);
    expect(truncated).toBe(false);
    // 拼接后不应丢失关键内容
    const joined = lines.join('');
    expect(joined).toContain('Inception');
    expect(joined).toContain('Nolan');
    expect(joined).toContain('电影');
  });

  it('截断时省略号行加省略号后宽度不应超过 maxWidth', () => {
    // 为省略号行提供精确宽度：每个字符 10px，省略号 "..." = 30px
    const textWidths = {};
    const ctx = createMockCtx(textWidths);
    // 用足够长的文本触发截断
    const longText = 'A'.repeat(100);
    const maxWidth = 50; // 每行约 5 个字符（50px）
    const { lines } = wrapText(ctx, longText, maxWidth, 2);
    expect(lines.length).toBe(2);
    const lastLine = lines[1];
    expect(lastLine).toMatch(/\.\.\.$/);
    // 验证最后一行加省略号后的宽度不超过 maxWidth
    // mock ctx 中每字符 10px，"..." 为 30px
    const charCount = lastLine.length - 3; // 减去省略号
    const totalWidth = charCount * 10 + 30;
    expect(totalWidth).toBeLessThanOrEqual(maxWidth);
  });

  it('换行符 \\n 应分段处理', () => {
    const ctx = createMockCtx();
    const { lines } = wrapText(ctx, '第一段\n第二段', 500);
    expect(lines).toContain('第一段');
    expect(lines).toContain('第二段');
    expect(lines.length).toBe(2);
  });
});

// ========== roundRect 测试 ==========
describe('roundRect', () => {
  it('应调用 Canvas 路径 API', () => {
    const ctx = createMockCtx();
    roundRect(ctx, 0, 0, 100, 50, 10);
    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 0);
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
    expect(ctx.closePath).toHaveBeenCalled();
  });

  it('应在正确的坐标绘制四个圆角', () => {
    const ctx = createMockCtx();
    roundRect(ctx, 10, 20, 100, 50, 5);
    // arcTo 被调用 4 次（四个角）
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
    // 验证第一个角（右上角）
    expect(ctx.arcTo).toHaveBeenNthCalledWith(1, 110, 20, 110, 70, 5);
  });
});
