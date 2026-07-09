// 造境 ZaoJing Playwright 配置
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:8127',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', channel: 'chrome' }
    }
  ],
  webServer: {
    command: 'cd .. && npm run build && cd server && STATIC_DIR=../dist node server.js',
    port: 8127,
    timeout: 30000,
    reuseExistingServer: true
  }
});
