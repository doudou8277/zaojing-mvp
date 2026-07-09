/**
 * API 集成测试
 * 使用 supertest 测试 Express 路由层（认证、校验、错误处理）
 * 不涉及真实 AI API 调用，仅验证路由层行为
 */

import { describe, it, expect } from 'vitest';

// ========== 测试环境变量配置 ==========
// 必须在 require('../server') 之前设置，因为 server.js 在模块加载时读取环境变量
// dotenv 不会覆盖已设置的变量，因此设为空字符串可确保认证中间件允许 localhost 访问
process.env.NODE_ENV = 'test';
process.env.API_KEY = '';
process.env.ADMIN_TOKEN = '';

const request = require('supertest');
const app = require('../server');

// ========== 健康检查 ==========
describe('健康检查', () => {
  it('GET /api/health 应返回 200 和 status 字段', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body.status).toBe('ok');
    // 简化后的健康检查仅返回最小化信息（uptime/timestamp），不再泄露缓存与成本数据
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/health/ready 应返回 200 或 503', async () => {
    const res = await request(app).get('/api/health/ready');

    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('server', true);
  });
});

// ========== 错误上报 ==========
describe('错误上报', () => {
  it('POST /api/errors 缺少 errors 字段应返回 400', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 'INVALID_FORMAT');
  });

  it('POST /api/errors errors 非数组应返回 400', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({ errors: 'not-an-array' });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 'INVALID_FORMAT');
  });

  it('POST /api/errors 空数组应返回 204', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({ errors: [] });

    expect(res.status).toBe(204);
  });

  it('POST /api/errors 有效数组应返回 204', async () => {
    const res = await request(app)
      .post('/api/errors')
      .send({
        errors: [
          {
            type: 'exception',
            message: '测试错误',
            url: 'http://localhost/',
            sessionId: 'test-sid',
            timeSinceLoad: 1000,
            stack: 'Error: 测试错误\n    at test'
          }
        ]
      });

    expect(res.status).toBe(204);
  });

  it('POST /api/errors 超过 50 条应返回 400 TOO_MANY_ERRORS', async () => {
    const errors = Array.from({ length: 51 }, () => ({ type: 'error', message: 'x' }));
    const res = await request(app)
      .post('/api/errors')
      .send({ errors });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 'TOO_MANY_ERRORS');
  });
});

// ========== 认证 ==========
describe('认证', () => {
  it('未配置 API_KEY 时（测试环境），GET /api/health 应可访问', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/nonexistent 应返回 404', async () => {
    const res = await request(app).get('/api/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 404);
  });
});

// ========== 输入校验 ==========
describe('输入校验', () => {
  it('POST /api/analyze 缺少 text 字段应返回 400', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 400);
    expect(res.body).toHaveProperty('details');
  });

  it('POST /api/analyze text 为空字符串应返回 400', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({ text: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 400);
  });

  it('POST /api/generate-image 缺少 directorId 应返回 400', async () => {
    const res = await request(app)
      .post('/api/generate-image')
      .send({ text: '一段文字' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 400);
  });
});

// ========== MCP 端点 ==========
describe('MCP 端点', () => {
  it('GET /api/mcp/gallery 应返回 200（即使为空也应返回空数组）', async () => {
    const res = await request(app).get('/api/mcp/gallery');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

// ========== 风格相关 ==========
describe('风格相关', () => {
  it('POST /api/parse-style 缺少 description 应返回 400', async () => {
    const res = await request(app)
      .post('/api/parse-style')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 400);
  });

  it('POST /api/blend-styles 缺少 styleA/styleB 应返回 400', async () => {
    const res = await request(app)
      .post('/api/blend-styles')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code', 400);
  });
});

// ========== 错误路径与边界 case ==========
// 注意：必须在"限流"测试之前运行，因为限流测试会耗尽 analyze 端点的配额
describe('错误路径 / 边界 case', () => {
  // ---------- analyze 端点 ----------
  it('POST /api/analyze text 仅含空白字符应返回 400（trim 后为空）', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({ text: '     ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  it('POST /api/analyze text 超过 500 字应返回 400', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .send({ text: 'A'.repeat(501) });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  // ---------- generate-image 端点 ----------
  it('POST /api/generate-image 缺少 text 字段应返回 400', async () => {
    const res = await request(app)
      .post('/api/generate-image')
      .send({ directorId: 'miyazaki' });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  it('POST /api/generate-image text 为空字符串应返回 400', async () => {
    const res = await request(app)
      .post('/api/generate-image')
      .send({ text: '', directorId: 'miyazaki' });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  it('POST /api/generate-image 无效 engine 参数应返回 400', async () => {
    const res = await request(app)
      .post('/api/generate-image')
      .send({ text: '一段电影描述', directorId: 'miyazaki', engine: 'invalid-engine' });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
    // Zod enum 校验失败应在 details 中包含 engine 字段错误
    const hasEngineError = res.body.details?.some(d => d.field === 'engine');
    expect(hasEngineError).toBe(true);
  });

  it('POST /api/generate-image 无效 size 参数应返回 400', async () => {
    const res = await request(app)
      .post('/api/generate-image')
      .send({ text: '一段电影描述', directorId: 'miyazaki', size: 'huge-poster' });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  // ---------- generate-copy 端点 ----------
  it('POST /api/generate-copy 缺少 directorId 应返回 400', async () => {
    const res = await request(app)
      .post('/api/generate-copy')
      .send({ text: '一段文字' });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  // ---------- 未认证访问受保护端点 ----------
  // 注意：测试环境 API_KEY='' 且来自 localhost（supertest 使用 127.0.0.1），
  // 因此 /api/* 端点默认放行。这里测试 /metrics 端点的 Bearer Token 认证
  it('GET /metrics 配置了 METRICS_TOKEN 后错误 Token 应返回 401', async () => {
    const originalToken = process.env.METRICS_TOKEN;
    process.env.METRICS_TOKEN = 'secret-token';
    try {
      const res = await request(app)
        .get('/metrics')
        .set('Authorization', 'Bearer wrong-token');

      expect(res.status).toBe(401);
    } finally {
      if (originalToken === undefined) {
        delete process.env.METRICS_TOKEN;
      } else {
        process.env.METRICS_TOKEN = originalToken;
      }
    }
  });

  it('GET /metrics 配置了 METRICS_TOKEN 后缺失 Authorization 头应返回 401', async () => {
    const originalToken = process.env.METRICS_TOKEN;
    process.env.METRICS_TOKEN = 'secret-token';
    try {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(401);
    } finally {
      if (originalToken === undefined) {
        delete process.env.METRICS_TOKEN;
      } else {
        process.env.METRICS_TOKEN = originalToken;
      }
    }
  });

  // ---------- 路径参数非法 ----------
  it('GET /api/movies/:id id 过长（>64 字符）应返回 400', async () => {
    const longId = 'a'.repeat(65);
    const res = await request(app).get(`/api/movies/${longId}`);
    expect(res.status).toBe(400);
  });

  // ---------- 合规检测 ----------
  it('POST /api/compliance-check 缺少 content 应返回 400', async () => {
    const res = await request(app)
      .post('/api/compliance-check')
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/compliance-check content 超过 2000 字应返回 400', async () => {
    const res = await request(app)
      .post('/api/compliance-check')
      .send({ content: 'A'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  // ---------- 风格混搭 ----------
  it('POST /api/blend-styles ratio 超出 0-1 范围应返回 400', async () => {
    const res = await request(app)
      .post('/api/blend-styles')
      .send({ styleA: { name: 'A' }, styleB: { name: 'B' }, ratio: 2 });

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  // ---------- 非 JSON body ----------
  it('POST /api/analyze 发送非 JSON content-type 应返回 400 或错误（不应崩溃）', async () => {
    const res = await request(app)
      .post('/api/analyze')
      .set('Content-Type', 'text/plain')
      .send('not json');

    // Express JSON 中间件对非法 JSON 返回 400；text/plain 时 req.body 为 {}，
    // 校验层发现缺少 text 也返回 400
    expect(res.status).toBe(400);
  });
});

// ========== 限流 ==========
// 注意：此测试必须在所有其他会消耗 analyze 限流配额的测试之后执行，
// 因为会耗尽 analyze 端点的限流配额（20 次/分钟），之后所有 analyze 类请求都会返回 429
describe('限流', () => {
  it('连续发送超过限流阈值的请求应返回 429', async () => {
    const statusCodes = [];

    // analyze 端点限流：20 次/分钟
    // 发送空 body 触发校验失败（400），但请求仍计入限流计数
    // 之前的测试可能已消耗部分配额，发送 25 次确保超过 20 次阈值
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post('/api/analyze')
        .send({});
      statusCodes.push(res.status);
    }

    // 至少有一个请求应返回 429（限流触发）
    expect(statusCodes).toContain(429);
  });
});

// ========== 路径参数校验 ==========
describe('路径参数校验', () => {
  it('DELETE /api/mcp/gallery/../../etc/passwd 应返回 400（非法 ID）', async () => {
    const res = await request(app).delete('/api/mcp/gallery/..%2F..%2Fetc%2Fpasswd');

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  it('GET /api/mcp/reference/invalid!id 应返回 400（含特殊字符）', async () => {
    const res = await request(app).get('/api/mcp/reference/invalid!id');

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  it('GET /api/movies/<script> 应返回 400（XSS 尝试）', async () => {
    const res = await request(app).get('/api/movies/%3Cscript%3E');

    expect(res.status).toBe(400);
    expect(res.body.error).toHaveProperty('code', 400);
  });

  it('GET /api/movies/valid-id-123 应返回 404（合法格式但不存在）', async () => {
    const res = await request(app).get('/api/movies/valid-id-123');

    expect(res.status).toBe(404);
    expect(res.body.error).toHaveProperty('code', 404);
  });
});

// ========== HTTP 状态码规范 ==========
describe('HTTP 状态码规范', () => {
  it('GET /api/mcp/gallery 应返回 200', async () => {
    const res = await request(app).get('/api/mcp/gallery');

    expect(res.status).toBe(200);
  });

  it('GET /api/movies/ranking 应返回 200', async () => {
    const res = await request(app).get('/api/movies/ranking');

    expect(res.status).toBe(200);
  });

  it('GET /api/v1/health 应返回 200 和 apiVersion 字段', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('apiVersion', 'v1');
  });
});
