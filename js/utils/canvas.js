/**
 * 造境 ZaoJing — Canvas 工具函数
 * 提取自 poster-engine.js 和 poster-worker.js 的重复代码
 * 供主线程与 Web Worker 共享
 */

/**
 * 将 #RRGGBB 颜色与 alpha(0-1) 组合为 rgba() 字符串
 * 避免直接拼接 hex alpha 后缀
 * @param {string} hex - #RRGGBB 格式的颜色值
 * @param {number} alpha - 透明度 0-1
 * @returns {string} rgba() 格式字符串
 */
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 绘制径向暗角效果
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx - Canvas 2D 上下文
 * @param {number} width - 画布宽度
 * @param {number} height - 画布高度
 * @param {number} [intensity=0.35] - 暗角强度 0-1
 */
export function drawVignette(ctx, width, height, intensity = 0.35) {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${intensity})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
