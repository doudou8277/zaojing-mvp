/**
 * 导演数据一致性验证测试
 * 确保前端 data.ts 的 styleDNA 与 shared/directors.json（后端权威数据源）保持一致
 * 如果有人改了一处忘了改另一处，此测试会失败
 */
import { describe, it, expect } from 'vitest';
import { DIRECTORS } from '../data.js';
import directorsJson from '../../shared/directors.json';

describe('导演数据一致性（shared/directors.json 单一来源）', () => {
  it('shared/directors.json 应包含所有前端导演', () => {
    DIRECTORS.forEach(director => {
      expect(directorsJson[director.id], `导演 ${director.id} 不在 shared/directors.json 中`).toBeDefined();
    });
  });

  it('前端 DIRECTORS 的 styleDNA 应与 shared/directors.json 完全一致', () => {
    DIRECTORS.forEach(director => {
      const jsonEntry = directorsJson[director.id];
      if (!jsonEntry) return; // 上一条测试已覆盖
      expect(
        director.styleDNA,
        `导演 ${director.id} 的 styleDNA 与 shared/directors.json 不一致`
      ).toEqual(jsonEntry.styleDNA);
    });
  });

  it('shared/directors.json 不应包含前端未定义的导演', () => {
    const frontendIds = new Set(DIRECTORS.map(d => d.id));
    Object.keys(directorsJson).forEach(id => {
      expect(frontendIds.has(id), `shared/directors.json 中的导演 ${id} 不在前端 DIRECTORS 中`).toBe(true);
    });
  });

  it('shared/directors.json 每个导演都应有完整的 styleDNA（8 个维度）', () => {
    const requiredKeys = [
      'colorTemperature', 'saturation', 'contrast', 'compositionType',
      'lightingType', 'scale', 'pace', 'texture',
    ];
    Object.entries(directorsJson).forEach(([id, data]) => {
      expect(data.styleDNA, `导演 ${id} 缺少 styleDNA`).toBeDefined();
      requiredKeys.forEach(key => {
        expect(data.styleDNA[key], `导演 ${id} 的 styleDNA.${key} 缺失`).toBeDefined();
      });
    });
  });
});
