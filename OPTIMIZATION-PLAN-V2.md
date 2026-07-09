# 造境 ZaoJing 二次优化计划

> 基于 3 个维度（前端 / 后端 / 基础设施）的全面审查，共发现 50+ 个问题，按优先级分为 4 个阶段。

---

## Phase 6：安全加固（7 项）

### P6.1 XSS 漏洞修复 — innerHTML 转义
- **问题**：`app.js`、`movie-module.js` 中 10+ 处将用户输入/AI 返回数据直接拼入 `innerHTML`，可执行任意脚本
- **方案**：创建 `js/utils/sanitize.js` 工具函数，提供 `escapeHtml()` 和 `safeSetInnerHTML()`；将所有涉及用户输入的 `innerHTML` 拼接替换为转义后的值
- **影响文件**：`js/app.js`、`js/movie-module.js`

### P6.2 API Key 认证修复
- **问题**：①前端 `window.ZAOJING_CONFIG.apiKey` 暴露密钥；②后端 Referer 检查可被伪造绕过；③未配置 `API_KEY` 时所有端点（含 admin）完全开放
- **方案**：移除前端 API Key 逻辑，改为同源 Cookie 认证；后端移除 Referer 绕过逻辑；生产环境强制要求 `API_KEY`，未配置时拒绝启动
- **影响文件**：`js/ai-client.ts`、`server/server.js`

### P6.3 Admin 端点独立授权
- **问题**：`/api/admin/*` 端点仅受全局 API Key 保护，无角色/权限校验
- **方案**：新增 `ADMIN_TOKEN` 环境变量，admin 端点要求 `X-Admin-Token` 请求头
- **影响文件**：`server/server.js`

### P6.4 安全 HTTP 头 — helmet
- **问题**：未设置 `X-Content-Type-Options`、`X-Frame-Options`、`CSP` 等安全头
- **方案**：安装 `helmet`，在 Express 中间件链最前面启用
- **影响文件**：`server/server.js`、`server/package.json`

### P6.5 生产环境 sourcemap 控制
- **问题**：`vite.config.js` 中 `sourcemap: true` 在生产构建中暴露源代码
- **方案**：改为 `sourcemap: 'hidden'`（生成但不引用），或通过环境变量控制
- **影响文件**：`vite.config.js`

### P6.6 第三方 QR 码服务替换
- **问题**：依赖 `api.qrserver.com` 生成二维码，存在可用性和隐私风险
- **方案**：安装 `qrcode` npm 包，前端本地生成二维码
- **影响文件**：`js/app.js`、`package.json`

### P6.7 Zod schema 收紧
- **问题**：`blendStylesSchema` 和 `recommendStyleSchema` 使用 `passthrough()` 允许任意字段；`imageBase64` 无最大长度限制
- **方案**：移除 `passthrough()`，改用 `strict()`；为 `imageBase64` 添加 `max(10_000_000)` 约束
- **影响文件**：`server/validators.js`

---

## Phase 7：Bug 修复与可靠性（6 项）

### P7.1 DIRECTORS 变量未定义修复
- **问题**：`ai-service.js` 中 `analyzeMovieDNA()` 和 `localMovieDNA()` 引用未定义的 `DIRECTORS` 变量，导致导演匹配功能完全失效
- **方案**：从 `data.js` 导入导演数据，或在后端定义导演 ID 到名称的映射
- **影响文件**：`server/ai-service.js`

### P7.2 Blob URL 内存泄漏修复
- **问题**：`regenerateCurrentPoster` 和 `regenerateAllPosters` 替换海报结果时未释放旧的 Blob URL
- **方案**：在替换前调用 `URL.revokeObjectURL()` 释放旧 URL
- **影响文件**：`js/app.js`

### P7.3 事件监听器清理
- **问题**：document 级事件监听器（情绪光谱拖拽、keydown）从未移除
- **方案**：在 `init()` 中统一管理监听器引用，提供 `cleanup()` 方法
- **影响文件**：`js/app.js`、`js/movie-module.js`

### P7.4 SSE 客户端断开处理
- **问题**：`/api/generate-copy-stream` 未监听 `req.on('close')`，客户端断开后仍继续调用 LLM
- **方案**：监听 `req.on('close')`，设置 `AbortController` 中止 LLM 调用
- **影响文件**：`server/server.js`、`server/ai-service.js`

### P7.5 movie-tracker 并发安全
- **问题**：`movie-tracker.js` 同步读写 JSON 文件无锁保护，并发请求可能导致数据损坏
- **方案**：引入简单的写入队列（promise chain），确保写操作串行执行
- **影响文件**：`server/movie-tracker.js`

### P7.6 image-storage.js 兼容性修复
- **问题**：`response.buffer()` 是 node-fetch v2 专有 API，原生 fetch 下会报错
- **方案**：改为 `response.arrayBuffer()` + `Buffer.from()`
- **影响文件**：`server/image-storage.js`

---

## Phase 8：工程化补全（8 项）

### P8.1 ESLint + Prettier 配置
- **问题**：无代码风格检查和格式化工具
- **方案**：安装 ESLint + Prettier，创建配置文件，添加 `lint` 和 `format` 脚本
- **影响文件**：`package.json`、`.eslintrc.cjs`、`.prettierrc`

### P8.2 husky + lint-staged
- **问题**：提交前无自动检查
- **方案**：配置 pre-commit hook，自动执行 lint + format
- **影响文件**：`package.json`、`.husky/pre-commit`

### P8.3 CI/CD 修复
- **问题**：①`.gitignore` 忽略 `package-lock.json` 但 CI 用 `npm ci`；②CI 缺前端构建和类型检查；③deploy 是空壳；④e2e 绕过已有 package.json
- **方案**：修正 `.gitignore`；CI 增加前端 build + typecheck 步骤；e2e 使用已有 package.json
- **影响文件**：`.gitignore`、`.github/workflows/ci-cd.yml`

### P8.4 Dockerfile 修复
- **问题**：Dockerfile 未构建前端，生产镜像服务原始源码
- **方案**：多阶段构建 — builder 阶段执行 `npm run build`，runtime 阶段仅复制 `dist/` 和 `server/`
- **影响文件**：`Dockerfile`

### P8.5 README 文档
- **问题**：项目完全无 README
- **方案**：创建完整的 README.md（项目介绍、快速开始、架构说明、API 概览、部署指南）
- **影响文件**：`README.md`

### P8.6 .nvmrc + 根目录 .env.example
- **问题**：无 Node 版本锁定；前端无 .env.example
- **方案**：创建 `.nvmrc`（`20`）和根目录 `.env.example`
- **影响文件**：`.nvmrc`、`.env.example`

### P8.7 前端单元测试
- **问题**：前端 0 测试覆盖
- **方案**：安装 vitest，为 `state.ts`、`ai-client.ts`、`components.js` 编写单元测试
- **影响文件**：`package.json`、`js/tests/`

### P8.8 类型定义修正
- **问题**：`types.d.ts` 中的接口与实际代码严重不匹配
- **方案**：根据 `data.js` 实际结构修正 Director、StyleDNA、PosterFormat 等类型定义
- **影响文件**：`js/types.d.ts`

---

## Phase 9：代码质量提升（6 项）

### P9.1 重复代码提取
- **问题**：`hexToRgba`、`drawVignette`、DNA 雷达图绘制、DNA 维度映射表在多处重复
- **方案**：提取到 `js/utils/canvas.js` 和 `js/utils/dna.js` 共享模块
- **影响文件**：`js/poster-engine.js`、`js/poster-worker.js`、`js/app.js`、`js/movie-module.js`

### P9.2 全局变量清理
- **问题**：`window.MovieModule`、`window.toast`、`window._serverMovies` 污染全局
- **方案**：通过 ES Module import/export 替代全局变量；`poster-engine.js` 中的 `window._serverMovies` 改为函数参数传入
- **影响文件**：`js/app.js`、`js/movie-module.js`、`js/poster-engine.js`

### P9.3 movie-tracker 日志统一
- **问题**：`movie-tracker.js` 使用 `console.log`，未使用 pino 结构化日志
- **方案**：替换所有 console 调用为 logger
- **影响文件**：`server/movie-tracker.js`

### P9.4 死代码清理
- **问题**：`generateWithGPTImage` 永远不会被调用；engine 三元表达式两分支相同；`renderDNARadar` 废弃函数；`ALLOWED_DIRECTOR_IDS` 死代码
- **方案**：移除所有死代码
- **影响文件**：`server/ai-service.js`、`server/validators.js`、`js/app.js`

### P9.5 Web Worker 错误处理
- **问题**：Worker 出错时仅 console.error，pending 请求永远挂起
- **方案**：onerror 时 reject 所有 pending 请求并清理
- **影响文件**：`js/poster-engine.js`

### P9.6 docker-compose 清理
- **问题**：`version` 字段已弃用；`.dockerignore` 未忽略 `dist/`
- **方案**：移除 `version` 字段；`.dockerignore` 添加 `dist/`
- **影响文件**：`docker-compose.yml`、`.dockerignore`

---

## 执行优先级

| 阶段 | 项目数 | 预估影响 | 建议顺序 |
|------|--------|---------|---------|
| Phase 6 安全加固 | 7 | 防止攻击和数据泄露 | 第一优先 |
| Phase 7 Bug 修复 | 6 | 修复功能性缺陷 | 第二优先 |
| Phase 8 工程化补全 | 8 | 提升开发效率和 CI 可靠性 | 第三优先 |
| Phase 9 代码质量 | 6 | 提升可维护性 | 第四优先 |
| **合计** | **27** | | |
