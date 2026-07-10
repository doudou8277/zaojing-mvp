/**
 * 造境 ZaoJing DNA 雷达图共享数据单元测试
 * 测试 js/utils/dna.ts 中的维度定义、值映射与绘制函数
 */

import { describe, it, expect, vi } from 'vitest';
import { DNA_DIMENSIONS, DNA_VALUE_MAPS, dnaToValues, drawDNAGrid, drawDNALabels } from '../utils/dna.ts';

// ========== 辅助：创建 mock CanvasRenderingContext2D ==========
function createMockCtx() {
  const ctx = {
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  };
  return ctx;
}

// ========== DNA_DIMENSIONS ==========
describe('DNA_DIMENSIONS', () => {
  it('应包含 8 个维度', () => {
    expect(DNA_DIMENSIONS).toHaveLength(8);
  });

  it('每个维度应包含 key 和 label 字段', () => {
    for (const dim of DNA_DIMENSIONS) {
      expect(dim).toHaveProperty('key');
      expect(dim).toHaveProperty('label');
      expect(typeof dim.key).toBe('string');
      expect(typeof dim.label).toBe('string');
      expect(dim.key.length).toBeGreaterThan(0);
      expect(dim.label.length).toBeGreaterThan(0);
    }
  });

  it('应包含正确的 key 顺序', () => {
    const keys = DNA_DIMENSIONS.map((d) => d.key);
    expect(keys).toEqual([
      'colorTemperature',
      'saturation',
      'contrast',
      'compositionType',
      'lightingType',
      'scale',
      'pace',
      'texture',
    ]);
  });

  it('应包含正确的中文标签', () => {
    const labels = DNA_DIMENSIONS.map((d) => d.label);
    expect(labels).toEqual(['色温', '饱和', '对比', '构图', '光影', '尺度', '节奏', '质感']);
  });

  it('所有 key 应唯一', () => {
    const keys = DNA_DIMENSIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ========== DNA_VALUE_MAPS ==========
describe('DNA_VALUE_MAPS', () => {
  it('应为所有 8 个维度提供值映射', () => {
    for (const dim of DNA_DIMENSIONS) {
      expect(DNA_VALUE_MAPS).toHaveProperty(dim.key);
      expect(typeof DNA_VALUE_MAPS[dim.key]).toBe('object');
      expect(DNA_VALUE_MAPS[dim.key]).not.toBeNull();
    }
  });

  it('colorTemperature 应正确映射 cool/neutral/warm', () => {
    const map = DNA_VALUE_MAPS.colorTemperature;
    expect(map.cool).toBe(0.2);
    expect(map.neutral).toBe(0.5);
    expect(map.warm).toBe(0.8);
  });

  it('saturation 应正确映射 low/medium/high', () => {
    const map = DNA_VALUE_MAPS.saturation;
    expect(map.low).toBe(0.2);
    expect(map.medium).toBe(0.5);
    expect(map.high).toBe(0.8);
  });

  it('pace 应正确映射 static/dynamic', () => {
    const map = DNA_VALUE_MAPS.pace;
    expect(map.static).toBe(0.2);
    expect(map.dynamic).toBe(0.8);
  });

  it('texture 应正确映射 smooth/digital/grainy/painterly/handdrawn', () => {
    const map = DNA_VALUE_MAPS.texture;
    expect(map.smooth).toBe(0.2);
    expect(map.digital).toBe(0.4);
    expect(map.grainy).toBe(0.6);
    expect(map.painterly).toBe(0.8);
    expect(map.handdrawn).toBe(0.9);
  });

  it('所有映射值应在 0-1 范围内', () => {
    for (const dimKey of Object.keys(DNA_VALUE_MAPS)) {
      const map = DNA_VALUE_MAPS[dimKey];
      for (const val of Object.values(map)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ========== dnaToValues ==========
describe('dnaToValues', () => {
  it('应返回长度为 8 的数组', () => {
    const result = dnaToValues({});
    expect(result).toHaveLength(8);
  });

  it('应将字符串值正确转换为数字（如 warm → 0.8）', () => {
    const result = dnaToValues({ colorTemperature: 'warm' });
    expect(result[0]).toBe(0.8);
  });

  it('应将 cool 字符串转换为 0.2', () => {
    const result = dnaToValues({ colorTemperature: 'cool' });
    expect(result[0]).toBe(0.2);
  });

  it('应将 neutral 字符串转换为 0.5', () => {
    const result = dnaToValues({ colorTemperature: 'neutral' });
    expect(result[0]).toBe(0.5);
  });

  it('应正确转换所有维度的字符串值', () => {
    const result = dnaToValues({
      colorTemperature: 'warm',
      saturation: 'high',
      contrast: 'low',
      compositionType: 'dynamic',
      lightingType: 'dramatic',
      scale: 'monumental',
      pace: 'dynamic',
      texture: 'painterly',
    });
    expect(result).toEqual([0.8, 0.8, 0.2, 0.8, 0.8, 0.8, 0.8, 0.8]);
  });

  it('应直接处理数值类型', () => {
    const result = dnaToValues({ colorTemperature: 0.65 });
    expect(result[0]).toBe(0.65);
  });

  it('应直接处理数值 0', () => {
    const result = dnaToValues({ colorTemperature: 0 });
    expect(result[0]).toBe(0);
  });

  it('应直接处理数值 1', () => {
    const result = dnaToValues({ colorTemperature: 1 });
    expect(result[0]).toBe(1);
  });

  it('混合数值与字符串时应分别正确处理', () => {
    const result = dnaToValues({
      colorTemperature: 0.3,
      saturation: 'high',
    });
    expect(result[0]).toBe(0.3);
    expect(result[1]).toBe(0.8);
  });

  it('未知字符串值应返回 0.5', () => {
    const result = dnaToValues({ colorTemperature: 'unknownValue' });
    expect(result[0]).toBe(0.5);
  });

  it('缺失的维度应返回 0.5', () => {
    const result = dnaToValues({});
    for (const val of result) {
      expect(val).toBe(0.5);
    }
  });

  it('部分缺失的维度应返回 0.5', () => {
    const result = dnaToValues({ colorTemperature: 'warm' });
    expect(result[0]).toBe(0.8);
    for (let i = 1; i < 8; i++) {
      expect(result[i]).toBe(0.5);
    }
  });

  it('null 输入应全部返回 0.5', () => {
    const result = dnaToValues(null);
    expect(result).toHaveLength(8);
    for (const val of result) {
      expect(val).toBe(0.5);
    }
  });

  it('undefined 输入应全部返回 0.5', () => {
    const result = dnaToValues(undefined);
    expect(result).toHaveLength(8);
    for (const val of result) {
      expect(val).toBe(0.5);
    }
  });
});

// ========== drawDNAGrid ==========
describe('drawDNAGrid', () => {
  it('应调用 ctx 的绘制方法', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNAGrid(ctx, 100, 100, 50, n, angleStep);

    expect(ctx.beginPath).toHaveBeenCalled();
    expect(ctx.moveTo).toHaveBeenCalled();
    expect(ctx.lineTo).toHaveBeenCalled();
    expect(ctx.closePath).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('应设置 strokeStyle（网格色与轴线色）', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNAGrid(ctx, 100, 100, 50, n, angleStep);

    // 先设网格色，后设轴线色
    expect(ctx.strokeStyle).toBe('rgba(245,240,232,0.12)');
  });

  it('beginPath 应被调用 12 次（4 个网格环 + 8 条轴线）', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNAGrid(ctx, 100, 100, 50, n, angleStep);

    expect(ctx.beginPath).toHaveBeenCalledTimes(12);
  });

  it('stroke 应被调用 12 次（4 个网格环 + 8 条轴线）', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNAGrid(ctx, 100, 100, 50, n, angleStep);

    expect(ctx.stroke).toHaveBeenCalledTimes(12);
  });

  it('closePath 应被调用 4 次（仅网格环）', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNAGrid(ctx, 100, 100, 50, n, angleStep);

    expect(ctx.closePath).toHaveBeenCalledTimes(4);
  });

  it('moveTo 应被调用 12 次（4 网格环起点 + 8 轴线起点）', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNAGrid(ctx, 100, 100, 50, n, angleStep);

    expect(ctx.moveTo).toHaveBeenCalledTimes(12);
  });

  it('lineTo 应被调用 40 次（4 环 × 8 段 + 8 轴线终点）', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNAGrid(ctx, 100, 100, 50, n, angleStep);

    expect(ctx.lineTo).toHaveBeenCalledTimes(40);
  });

  it('应支持不同维度数 n', () => {
    const ctx = createMockCtx();
    const n = 4;
    const angleStep = (2 * Math.PI) / n;
    drawDNAGrid(ctx, 50, 50, 30, n, angleStep);

    // 4 网格环 + 4 轴线 = 8
    expect(ctx.beginPath).toHaveBeenCalledTimes(8);
    expect(ctx.stroke).toHaveBeenCalledTimes(8);
    expect(ctx.closePath).toHaveBeenCalledTimes(4);
  });
});

// ========== drawDNALabels ==========
describe('drawDNALabels', () => {
  it('应为每个维度调用 fillText', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNALabels(ctx, 100, 100, 50, n, angleStep);

    expect(ctx.fillText).toHaveBeenCalledTimes(n);
  });

  it('应绘制所有 8 个维度的标签', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNALabels(ctx, 100, 100, 50, n, angleStep);

    const labels = ctx.fillText.mock.calls.map((call) => call[0]);
    expect(labels).toEqual(['色温', '饱和', '对比', '构图', '光影', '尺度', '节奏', '质感']);
  });

  it('应设置 fillStyle、font、textAlign、textBaseline', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNALabels(ctx, 100, 100, 50, n, angleStep);

    expect(ctx.fillStyle).toBe('rgba(245,240,232,0.5)');
    expect(ctx.font).toBe('11px "Instrument Sans", sans-serif');
    expect(ctx.textAlign).toBe('center');
    expect(ctx.textBaseline).toBe('middle');
  });

  it('应支持自定义颜色参数', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNALabels(ctx, 100, 100, 50, n, angleStep, '#ff0000');

    expect(ctx.fillStyle).toBe('#ff0000');
  });

  it('fillText 调用应传入 x、y 坐标', () => {
    const ctx = createMockCtx();
    const n = 8;
    const angleStep = (2 * Math.PI) / n;
    drawDNALabels(ctx, 100, 100, 50, n, angleStep);

    for (const call of ctx.fillText.mock.calls) {
      // 第一个参数是标签文本，第二、三个是 x、y 坐标
      expect(call).toHaveLength(3);
      expect(typeof call[1]).toBe('number');
      expect(typeof call[2]).toBe('number');
    }
  });
});
