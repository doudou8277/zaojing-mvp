/**
 * 造境 ZaoJing E2E 测试：核心用户流程
 * 覆盖：首页加载 -> 输入文字 -> 选择导演 -> 生成海报 -> 下载
 */

const { test, expect } = require('@playwright/test');

// ========== 首页加载 ==========
test.describe('首页加载', () => {
  test('应正确加载首页', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/造境|ZaoJing/);
  });

  test('应显示输入区域', async ({ page }) => {
    await page.goto('/');
    // 等待页面初始化完成
    await page.waitForTimeout(1000);
    const inputArea = page.locator('#input-text, .input-area, textarea').first();
    await expect(inputArea).toBeVisible({ timeout: 5000 });
  });

  test('应显示心情标签', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    const moodTags = page.locator('.mood-tag, [data-mood]');
    const count = await moodTags.count();
    expect(count).toBeGreaterThan(0);
  });

  test('应显示导演选择区域', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    const directors = page.locator('.director-card, [data-director]');
    const count = await directors.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ========== 健康检查 ==========
test.describe('API 健康检查', () => {
  test('GET /api/health 应返回 ok', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('zaojing-server');
  });

  test('健康检查应包含缓存统计', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    expect(body.cache).toBeDefined();
    expect(body.cache.emotion).toBeDefined();
    expect(body.cost).toBeDefined();
  });
});

// ========== 输入校验 ==========
test.describe('输入校验', () => {
  test('空文本提交应返回 400', async ({ request }) => {
    const response = await request.post('/api/analyze', {
      data: { text: '' }
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('缺少 directorId 应返回 400', async ({ request }) => {
    const response = await request.post('/api/generate-image', {
      data: { text: '测试文字' }
    });
    expect(response.status()).toBe(400);
  });

  test('无效 engine 应返回 400', async ({ request }) => {
    const response = await request.post('/api/generate-image', {
      data: { text: '测试', directorId: 'miyazaki', engine: 'invalid' }
    });
    expect(response.status()).toBe(400);
  });
});

// ========== 情绪分析（降级模式） ==========
test.describe('情绪分析', () => {
  test('应返回情绪分析结果', async ({ request }) => {
    const response = await request.post('/api/analyze', {
      data: { text: '今天我一个人走在空荡的街道上，感觉很孤独' }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.primaryEmotion).toBeTruthy();
    expect(body.recommendedDirectors).toBeDefined();
    expect(body.recommendedDirectors.length).toBeGreaterThan(0);
  });

  test('应支持 moodTagId 参数', async ({ request }) => {
    const response = await request.post('/api/analyze', {
      data: { text: '测试文字', moodTagId: 'emo' }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.primaryEmotion).toBe('忧伤');
  });
});

// ========== 文案生成（降级模式） ==========
test.describe('文案生成', () => {
  test('应返回文案结果', async ({ request }) => {
    const response = await request.post('/api/generate-copy', {
      data: { text: '关于孤独的夜晚', directorId: 'wkw', emotion: '孤独' }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.titles).toBeDefined();
    expect(body.quotes).toBeDefined();
    expect(body.quotes.length).toBeGreaterThan(0);
  });
});

// ========== 速率限制 ==========
test.describe('速率限制', () => {
  test('分析类接口应限流 20 次/分钟', async ({ request }) => {
    // 发送 21 次请求，第 21 次应被限流
    const requests = [];
    for (let i = 0; i < 22; i++) {
      requests.push(
        request.post('/api/analyze', { data: { text: `测试${i}` } })
      );
    }
    const responses = await Promise.all(requests);
    const limited = responses.filter(r => r.status() === 429);
    expect(limited.length).toBeGreaterThan(0);
  });
});

// ========== 404 处理 ==========
test.describe('错误处理', () => {
  test('未知路径应返回 404', async ({ request }) => {
    const response = await request.get('/api/nonexistent');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error).toBe('接口不存在');
  });
});

// ========== MCP 画廊 ==========
test.describe('MCP 画廊', () => {
  test('GET /api/mcp/gallery 应返回数组', async ({ request }) => {
    const response = await request.get('/api/mcp/gallery');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body)).toBeTruthy();
  });
});
