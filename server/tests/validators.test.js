/**
 * validators.js Zod Schema 单元测试
 */

import { describe, it, expect } from 'vitest';
const { validate, schemas } = require('../validators');

// ========== analyzeSchema ==========
describe('analyzeSchema', () => {
  it('应接受有效的文本', () => {
    const result = schemas.analyze.safeParse({ text: '一段文字' });
    expect(result.success).toBe(true);
  });

  it('应拒绝空文本', () => {
    const result = schemas.analyze.safeParse({ text: '' });
    expect(result.success).toBe(false);
  });

  it('应拒绝纯空格文本', () => {
    const result = schemas.analyze.safeParse({ text: '   ' });
    expect(result.success).toBe(false);
  });

  it('应拒绝超过 500 字的文本', () => {
    const result = schemas.analyze.safeParse({ text: 'a'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('应接受可选的 moodTagId', () => {
    const result = schemas.analyze.safeParse({ text: '文字', moodTagId: 'emo' });
    expect(result.success).toBe(true);
  });
});

// ========== generateImageSchema ==========
describe('generateImageSchema', () => {
  it('应接受有效的图片生成请求', () => {
    const result = schemas.generateImage.safeParse({
      text: '文字',
      directorId: 'miyazaki',
    });
    expect(result.success).toBe(true);
  });

  it('应设置 engine 默认值为 seedream', () => {
    const result = schemas.generateImage.safeParse({
      text: '文字',
      directorId: 'miyazaki',
    });
    expect(result.success).toBe(true);
    expect(result.data.engine).toBe('seedream');
  });

  it('应设置 size 默认值为 vertical', () => {
    const result = schemas.generateImage.safeParse({
      text: '文字',
      directorId: 'miyazaki',
    });
    expect(result.success).toBe(true);
    expect(result.data.size).toBe('vertical');
  });

  it('应拒绝无效的 engine 值', () => {
    const result = schemas.generateImage.safeParse({
      text: '文字',
      directorId: 'miyazaki',
      engine: 'invalid-engine',
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝无效的 size 值', () => {
    const result = schemas.generateImage.safeParse({
      text: '文字',
      directorId: 'miyazaki',
      size: 'huge',
    });
    expect(result.success).toBe(false);
  });

  it('应接受 seedream 引擎', () => {
    const result = schemas.generateImage.safeParse({
      text: '文字',
      directorId: 'wkw',
      engine: 'seedream',
    });
    expect(result.success).toBe(true);
  });

  it('应拒绝缺少 directorId 的请求', () => {
    const result = schemas.generateImage.safeParse({ text: '文字' });
    expect(result.success).toBe(false);
  });
});

// ========== generateCopySchema ==========
describe('generateCopySchema', () => {
  it('应接受有效的文案生成请求', () => {
    const result = schemas.generateCopy.safeParse({
      text: '文字',
      directorId: 'nolan',
    });
    expect(result.success).toBe(true);
  });

  it('应拒绝缺少 directorId 的请求', () => {
    const result = schemas.generateCopy.safeParse({ text: '文字' });
    expect(result.success).toBe(false);
  });
});

// ========== agentCreateSchema ==========
describe('agentCreateSchema', () => {
  it('应接受有效的 Agent 请求', () => {
    const result = schemas.agentCreate.safeParse({
      text: '文字',
      directorIds: ['miyazaki', 'wkw'],
    });
    expect(result.success).toBe(true);
  });

  it('应接受不带 directorIds 的请求', () => {
    const result = schemas.agentCreate.safeParse({ text: '文字' });
    expect(result.success).toBe(true);
  });

  it('应拒绝空文本', () => {
    const result = schemas.agentCreate.safeParse({ text: '' });
    expect(result.success).toBe(false);
  });
});

// ========== analyzeImageSchema ==========
describe('analyzeImageSchema', () => {
  it('应接受有效的 base64 图片数据', () => {
    const result = schemas.analyzeImage.safeParse({
      imageBase64: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });

  it('应拒绝过短的 base64 数据', () => {
    const result = schemas.analyzeImage.safeParse({
      imageBase64: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝缺少 imageBase64 的请求', () => {
    const result = schemas.analyzeImage.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ========== parseStyleSchema ==========
describe('parseStyleSchema', () => {
  it('应接受有效的风格描述', () => {
    const result = schemas.parseStyle.safeParse({
      description: '赛博朋克风格',
    });
    expect(result.success).toBe(true);
  });

  it('应拒绝空描述', () => {
    const result = schemas.parseStyle.safeParse({ description: '' });
    expect(result.success).toBe(false);
  });

  it('应拒绝超过 500 字的描述', () => {
    const result = schemas.parseStyle.safeParse({
      description: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

// ========== analyzeMovieSchema ==========
describe('analyzeMovieSchema', () => {
  it('应接受有效的电影名称', () => {
    const result = schemas.analyzeMovie.safeParse({ movieName: '盗梦空间' });
    expect(result.success).toBe(true);
  });

  it('应拒绝空电影名称', () => {
    const result = schemas.analyzeMovie.safeParse({ movieName: '' });
    expect(result.success).toBe(false);
  });

  it('应拒绝过长的电影名称', () => {
    const result = schemas.analyzeMovie.safeParse({
      movieName: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// ========== blendStylesSchema ==========
describe('blendStylesSchema', () => {
  it('应接受有效的混搭请求', () => {
    const result = schemas.blendStyles.safeParse({
      styleA: { name: '风格A' },
      styleB: { name: '风格B' },
      ratio: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it('ratio 应默认为 0.5', () => {
    const result = schemas.blendStyles.safeParse({
      styleA: { name: 'A' },
      styleB: { name: 'B' },
    });
    expect(result.success).toBe(true);
    expect(result.data.ratio).toBe(0.5);
  });

  it('应拒绝 ratio > 1', () => {
    const result = schemas.blendStyles.safeParse({
      styleA: {},
      styleB: {},
      ratio: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝缺少 styleA 的请求', () => {
    const result = schemas.blendStyles.safeParse({
      styleB: {},
      ratio: 0.5,
    });
    expect(result.success).toBe(false);
  });
});

// ========== validate 中间件 ==========
describe('validate middleware', () => {
  it('校验通过时应调用 next 并替换 req.body', () => {
    const req = { body: { text: '  文字  ' } };
    let nextCalled = false;
    const middleware = validate(schemas.analyze, 'body');
    middleware(req, {}, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(req.body.text).toBe('文字'); // trim 生效
  });

  it('校验失败时应返回 400 错误', () => {
    const req = { body: { text: '' } };
    const res = {
      status: (code) => {
        expect(code).toBe(400);
        return res;
      },
      json: (data) => {
        expect(data).toHaveProperty('error');
        expect(data).toHaveProperty('details');
      },
    };
    const middleware = validate(schemas.analyze, 'body');
    middleware(req, res, () => {
      throw new Error('next 不应被调用');
    });
  });
});
