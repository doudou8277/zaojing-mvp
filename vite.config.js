/**
 * 造境 ZaoJing Vite 配置
 * 开发环境：HMR 热更新 + API 代理到 Express 后端
 * 生产环境：打包压缩 + Code Splitting + 内容指纹
 */

import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // 项目根目录
  root: '.',

  // 插件：仅在 ANALYZE=true 时生成 Bundle 分析报告（不影响开发模式）
  plugins: [
    ...(process.env.ANALYZE === 'true'
      ? [
          visualizer({
            filename: 'dist/stats.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            // 仅在 ANALYZE=true 时自动打开报告
            open: true,
          }),
        ]
      : []),
  ],

  // 路径别名（与 tsconfig.json paths 对齐）
  resolve: {
    alias: {
      '@': resolve(__dirname, './js'),
      '@server': resolve(__dirname, './server'),
    },
  },

  // 测试配置（vitest）
  test: {
    // 排除 e2e 目录（Playwright 测试单独运行）
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },

  // 开发服务器配置
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8127',
        changeOrigin: true,
        // 图片生成 API 可能需要长达 180 秒，设置足够的代理超时
        timeout: 300000, // 5 分钟（涵盖 180s 生图 + 60s 下载 + 余量）
        proxyTimeout: 300000,
      },
      '/generated': {
        target: 'http://localhost:8127',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8127',
        ws: true,
        changeOrigin: true
      }
    }
  },

  // 构建配置
  build: {
    // 输出到 dist 目录
    outDir: 'dist',
    // 生成 sourcemap（开发环境用，生产环境使用 hidden 不暴露源码引用）
    sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
    // 资源内联阈值（小于 4KB 的资源内联为 base64）
    assetsInlineLimit: 4096,
    // 关闭 modulepreload：动态 import 的 chunk 只在实际调用时才下载，
    // 避免非首屏 chunk（如 movie-module、poster-engine）被首屏预加载。
    // 动态 import() 本身会处理 chunk 加载，无需 modulepreload 辅助。
    modulePreload: false,
    // 分包策略
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('data.js') || id.includes('movie-data.js')) return 'data';
          if (id.includes('ai-client')) return 'ai-client';
          if (id.includes('poster-engine.ts') || id.includes('poster-engine.js')) return 'poster-engine';
          if (id.includes('movie-module.js')) return 'movie-module';
          if (id.includes('components.ts')) return 'components';
        }
      }
    }
  },

  // 静态资源目录
  publicDir: 'public'
});
