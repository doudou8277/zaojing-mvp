/**
 * 造境 ZaoJing E2E 测试：核心用户旅程 UI 测试
 *
 * 覆盖：首页加载 -> 文字输入 -> 导演选择 -> 生成按钮 -> 导航切换 -> 模态弹窗 -> 响应式布局
 *
 * 注意：
 *   - 本测试依赖后端服务器运行（playwright.config.js 的 webServer 会自动启动）
 *   - 测试不依赖真实 AI API 调用，服务器降级模式（无 API Key）下也可通过
 *   - 选择器基于 index.html 中的真实元素 ID 和类名
 */

const { test, expect } = require('@playwright/test');

// ========== 测试 1: 首页加载和基本元素 ==========
test.describe('首页加载与基本元素', () => {
  test('首页应正确加载并显示输入区域', async ({ page }) => {
    await page.goto('/');
    // 等待页面初始化完成（模块加载 + 心情标签渲染）
    await page.waitForTimeout(1500);

    // 检查标题（输入页 h1 为"今天想说什么？"）
    await expect(page.locator('#page-input h1')).toBeVisible();

    // 检查输入框（实际 ID 为 input-text，非 user-input）
    await expect(page.locator('#input-text')).toBeVisible();

    // 检查心情标签（由 JS 动态渲染到 #mood-tags 容器）
    await expect(page.locator('.mood-tag').first()).toBeVisible({ timeout: 5000 });
  });

  test('应显示字数统计和示例提示', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // 字数统计
    await expect(page.locator('#char-count')).toBeVisible();
    await expect(page.locator('#char-count')).toContainText('0/200');

    // 示例提示按钮
    const exampleChips = page.locator('.example-chip');
    await expect(exampleChips.first()).toBeVisible();
    const count = await exampleChips.count();
    expect(count).toBeGreaterThan(0);
  });

  test('应显示主要操作按钮', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    // 选择导演按钮
    await expect(page.locator('#btn-to-directors')).toBeVisible();
    // 热门电影按钮
    await expect(page.locator('#btn-to-movies')).toBeVisible();
    // 多人共创按钮
    await expect(page.locator('#btn-to-cocreate')).toBeVisible();
    // 我的电影墙按钮
    await expect(page.locator('#btn-to-wall')).toBeVisible();
  });
});

// ========== 测试 2: 输入文字后进入导演选择页 ==========
test.describe('输入到导演选择流程', () => {
  test('输入文字后应能进入导演选择页', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 输入文字（实际 ID 为 input-text）
    await page.fill('#input-text', '一个关于梦想的故事');
    await expect(page.locator('#input-text')).toHaveValue('一个关于梦想的故事');

    // 点击"选择导演"按钮
    await page.click('#btn-to-directors');

    // 等待导演选择页可见（可能经过 AI 情绪分析，需要较长超时）
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });

    // 检查至少有一个导演卡片（由 initDirectorsPage 动态渲染）
    await expect(page.locator('.director-card').first()).toBeVisible({ timeout: 5000 });
    const cardCount = await page.locator('.director-card').count();
    expect(cardCount).toBeGreaterThan(0);
  });

  test('未输入文字且未选心情标签时应提示', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 不输入文字直接点击
    await page.click('#btn-to-directors');

    // 应显示 toast 提示（不导航到导演页）
    await expect(page.locator('#page-directors')).not.toBeVisible({ timeout: 3000 });
    // 应停留在输入页
    await expect(page.locator('#page-input')).toBeVisible();
  });

  test('选择心情标签后也应能进入导演选择页', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 点击第一个心情标签
    await page.locator('.mood-tag').first().click();

    // 点击"选择导演"按钮
    await page.click('#btn-to-directors');

    // 等待导演选择页可见
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.director-card').first()).toBeVisible({ timeout: 5000 });
  });
});

// ========== 测试 3: 选择导演后显示生成按钮 ==========
test.describe('导演选择与生成按钮', () => {
  test('选择导演后应显示可用的生成按钮', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 输入文字并进入导演页
    await page.fill('#input-text', '一个关于梦想的故事');
    await page.click('#btn-to-directors');
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.director-card').first()).toBeVisible({ timeout: 5000 });

    // 生成按钮应存在且可见
    await expect(page.locator('#btn-generate')).toBeVisible();

    // 默认已选中宫崎骏，生成按钮应可用（非 disabled）
    await expect(page.locator('#btn-generate')).toBeEnabled({ timeout: 5000 });
  });

  test('点击导演卡片应能切换选中状态', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    await page.fill('#input-text', '一个关于梦想的故事');
    await page.click('#btn-to-directors');
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.director-card').first()).toBeVisible({ timeout: 5000 });

    // 获取已选中的导演数量
    const selectedBefore = await page.locator('.director-card.selected').count();

    // 点击未选中的导演卡片（选择第二个导演）
    const cards = page.locator('.director-card');
    const totalCards = await cards.count();
    if (totalCards > 1) {
      // 找一个未选中的卡片点击
      for (let i = 0; i < totalCards; i++) {
        const card = cards.nth(i);
        const isSelected = await card.evaluate(el => el.classList.contains('selected'));
        if (!isSelected) {
          await card.click();
          break;
        }
      }
      // 选中数量应增加
      const selectedAfter = await page.locator('.director-card.selected').count();
      expect(selectedAfter).toBeGreaterThan(selectedBefore);
    }

    // 选择计数文本应更新
    await expect(page.locator('#select-count')).toContainText(/已选 \d+ 位/);
  });

  test('返回按钮应能回到输入页', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    await page.fill('#input-text', '一个关于梦想的故事');
    await page.click('#btn-to-directors');
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });

    // 点击"重新输入"返回按钮
    await page.click('#btn-back-input');

    // 应回到输入页
    await expect(page.locator('#page-input')).toBeVisible();
    // 输入的文字应保留
    await expect(page.locator('#input-text')).toHaveValue('一个关于梦想的故事');
  });
});

// ========== 测试 4: 导航功能 ==========
test.describe('页面导航功能', () => {
  test('应能从首页导航到电影墙页面', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 检查导航按钮存在
    await expect(page.locator('#btn-to-wall')).toBeVisible();

    // 点击"我的电影墙"按钮
    await page.click('#btn-to-wall');

    // 电影墙页面应可见
    await expect(page.locator('#page-wall')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#page-wall h1')).toBeVisible();
  });

  test('电影墙页面应能返回首页', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 导航到电影墙
    await page.click('#btn-to-wall');
    await expect(page.locator('#page-wall')).toBeVisible({ timeout: 5000 });

    // 点击返回按钮
    const backBtn = page.locator('#btn-wall-back, #btn-wall-to-input').first();
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // 应回到输入页
    await expect(page.locator('#page-input')).toBeVisible();
  });

  test('应能从首页导航到多人共创页面', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 点击"多人共创"按钮
    await page.click('#btn-to-cocreate');

    // 多人共创页面应可见
    await expect(page.locator('#page-cocreate')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#page-cocreate h1')).toBeVisible();
    await expect(page.locator('#page-cocreate h1')).toHaveText('多人共创');
  });

  test('顶部导航栏应能跳转到热门电影页', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 顶部导航的"热门电影"按钮
    await expect(page.locator('#nav-to-movies')).toBeVisible();

    // 点击后应导航到电影页（异步加载电影模块，需较长超时）
    await page.click('#nav-to-movies');
    await expect(page.locator('#page-movies')).toBeVisible({ timeout: 15000 });
  });
});

// ========== 测试 5: 模态弹窗打开和关闭 ==========
test.describe('模态弹窗交互', () => {
  test('风格创建弹窗应能打开和关闭', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 先进入导演选择页（风格创建按钮在导演页）
    await page.fill('#input-text', '一个关于梦想的故事');
    await page.click('#btn-to-directors');
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });

    // 点击"创建风格"按钮打开弹窗
    await expect(page.locator('#btn-create-style')).toBeVisible();
    await page.click('#btn-create-style');

    // 弹窗应可见（zj-modal 内部的 .modal-overlay，id 为 style-create-modal）
    await expect(page.locator('#style-create-modal')).toBeVisible({ timeout: 5000 });

    // 弹窗内应有风格描述输入框
    await expect(page.locator('#style-description-input')).toBeVisible();

    // 使用 Escape 键关闭弹窗
    await page.keyboard.press('Escape');

    // 弹窗应关闭
    await expect(page.locator('#style-create-modal')).not.toBeVisible({ timeout: 5000 });
  });

  test('风格创建弹窗应能通过关闭按钮关闭', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 进入导演选择页
    await page.fill('#input-text', '一个关于梦想的故事');
    await page.click('#btn-to-directors');
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });

    // 打开弹窗
    await page.click('#btn-create-style');
    await expect(page.locator('#style-create-modal')).toBeVisible({ timeout: 5000 });

    // 点击关闭按钮
    const closeBtn = page.locator('#style-create-close');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      // 备选：点击 .modal-close 按钮
      await page.locator('.modal-close').first().click();
    }

    // 弹窗应关闭
    await expect(page.locator('#style-create-modal')).not.toBeVisible({ timeout: 5000 });
  });

  test('导演页 Escape 键应能返回输入页（无弹窗时）', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 进入导演选择页
    await page.fill('#input-text', '一个关于梦想的故事');
    await page.click('#btn-to-directors');
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });

    // 确保没有弹窗打开，按 Escape 应返回输入页
    await page.keyboard.press('Escape');

    // 应回到输入页
    await expect(page.locator('#page-input')).toBeVisible({ timeout: 5000 });
  });
});

// ========== 测试 6: 响应式布局 ==========
test.describe('响应式布局', () => {
  test('移动端布局应正确显示', async ({ page }) => {
    // 设置 iPhone X 尺寸
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 检查页面在移动端尺寸下正常显示
    await expect(page.locator('#page-input h1')).toBeVisible();
    await expect(page.locator('#input-text')).toBeVisible();
    await expect(page.locator('.mood-tag').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#btn-to-directors')).toBeVisible();
  });

  test('移动端应能完成输入到导演选择流程', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 输入文字
    await page.fill('#input-text', '深夜加班后走出写字楼，抬头看见月亮');
    await page.click('#btn-to-directors');

    // 导演页应在移动端正常显示
    await expect(page.locator('#page-directors')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.director-card').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#btn-generate')).toBeVisible();
  });

  test('平板尺寸布局应正确显示', async ({ page }) => {
    // 设置 iPad 尺寸
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await page.waitForTimeout(1500);

    await expect(page.locator('#page-input h1')).toBeVisible();
    await expect(page.locator('#input-text')).toBeVisible();
    await expect(page.locator('.mood-tag').first()).toBeVisible({ timeout: 5000 });
  });

  test('宽屏桌面布局应正确显示', async ({ page }) => {
    // 设置桌面宽屏尺寸
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.waitForTimeout(1500);

    await expect(page.locator('#page-input h1')).toBeVisible();
    await expect(page.locator('#input-text')).toBeVisible();
    await expect(page.locator('.mood-tag').first()).toBeVisible({ timeout: 5000 });
  });
});
