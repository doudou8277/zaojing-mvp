/**
 * 造境 ZaoJing — DNA 雷达图共享数据
 * 提取自 app.js 和 movie-module.js 中重复的维度定义和值映射
 */

/** DNA 维度定义 */
export interface DNADimension {
  key: string;
  label: string;
}

/** DNA 8 维度定义 */
export const DNA_DIMENSIONS: DNADimension[] = [
  { key: 'colorTemperature', label: '色温' },
  { key: 'saturation', label: '饱和' },
  { key: 'contrast', label: '对比' },
  { key: 'compositionType', label: '构图' },
  { key: 'lightingType', label: '光影' },
  { key: 'scale', label: '尺度' },
  { key: 'pace', label: '节奏' },
  { key: 'texture', label: '质感' },
];

/** DNA 维度值 → 0-1 归一化映射 */
export const DNA_VALUE_MAPS: Record<string, Record<string, number>> = {
  colorTemperature: { cool: 0.2, neutral: 0.5, warm: 0.8 },
  saturation: { low: 0.2, medium: 0.5, high: 0.8 },
  contrast: { low: 0.2, medium: 0.5, high: 0.8 },
  compositionType: { symmetric: 0.2, centered: 0.4, asymmetric: 0.6, dynamic: 0.8 },
  lightingType: { natural: 0.2, 'high-key': 0.4, 'low-key': 0.6, dramatic: 0.8 },
  scale: { intimate: 0.2, medium: 0.5, monumental: 0.8 },
  pace: { static: 0.2, dynamic: 0.8 },
  texture: { smooth: 0.2, digital: 0.4, grainy: 0.6, painterly: 0.8, handdrawn: 0.9 },
};

/**
 * 将风格 DNA 对象转换为 0-1 数值数组（用于雷达图绘制）
 * @param styleDNA - 风格 DNA 对象
 * @returns 0-1 范围的数值数组，长度与 DNA_DIMENSIONS 一致
 */
export function dnaToValues(styleDNA: Record<string, unknown> | null | undefined): number[] {
  return DNA_DIMENSIONS.map((dim) => {
    const val = styleDNA?.[dim.key];
    if (typeof val === 'number') return val;
    const map = DNA_VALUE_MAPS[dim.key];
    if (map && typeof val === 'string') return map[val] ?? 0.5;
    return 0.5;
  });
}

/**
 * 绘制 DNA 雷达图网格（共享绘制逻辑）
 * @param ctx - Canvas 2D 上下文
 * @param cx - 中心 X
 * @param cy - 中心 Y
 * @param radius - 雷达图半径
 * @param n - 维度数
 * @param angleStep - 每个维度的角度步长
 */
export function drawDNAGrid(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  n: number,
  angleStep: number
): void {
  ctx.strokeStyle = 'rgba(245,240,232,0.08)';
  for (let r = 1; r <= 4; r++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const x = cx + Math.cos(angle) * radius * (r / 4);
      const y = cy + Math.sin(angle) * radius * (r / 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // 轴线
  ctx.strokeStyle = 'rgba(245,240,232,0.12)';
  for (let i = 0; i < n; i++) {
    const angle = i * angleStep - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.stroke();
  }
}

/**
 * 绘制 DNA 雷达图标签
 * @param ctx - Canvas 2D 上下文
 * @param cx - 中心 X
 * @param cy - 中心 Y
 * @param radius - 雷达图半径
 * @param n - 维度数
 * @param angleStep - 每个维度的角度步长
 * @param color - 标签颜色
 */
export function drawDNALabels(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  n: number,
  angleStep: number,
  color: string = 'rgba(245,240,232,0.5)'
): void {
  ctx.fillStyle = color;
  ctx.font = '11px "Instrument Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const x = cx + Math.cos(angle) * (radius + 18);
    const y = cy + Math.sin(angle) * (radius + 18);
    ctx.fillText(DNA_DIMENSIONS[i].label, x, y);
  }
}
