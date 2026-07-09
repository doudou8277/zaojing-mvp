/**
 * 造境 ZaoJing — 颜色工具函数（共享）
 * 提取自 poster-engine.ts 与 poster-worker.js 的重复定义
 * 供主线程与 Web Worker 共享
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const full = cleaned.length === 3
    ? cleaned.split('').map(c => c + c).join('')
    : cleaned;
  return {
    r: parseInt(full.substring(0, 2), 16),
    g: parseInt(full.substring(2, 4), 16),
    b: parseInt(full.substring(4, 6), 16),
  };
}

function blendColor(directorColor: string, emotionColor: string, factor: number): string {
  const d = hexToRgb(directorColor);
  const e = hexToRgb(emotionColor);
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.round(d.r * (1 - f) + e.r * f);
  const g = Math.round(d.g * (1 - f) + e.g * f);
  const b = Math.round(d.b * (1 - f) + e.b * f);
  return `rgb(${r}, ${g}, ${b})`;
}

export { hexToRgb, blendColor };
