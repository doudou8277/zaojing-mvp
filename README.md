# 造境 ZaoJing — AI 电影海报生成器

> 用一句话，让你的情绪变成电影海报。

造境 ZaoJing 是一款 AI 驱动的创意海报生成器：用户输入文字（或上传图片、语音输入），选择心仪的导演风格，AI 即可生成电影级风格海报。内置 12 位世界级导演美学体系，支持九宫格、金句卡、名场面重绘、连环画、角色二创、竞猜海报等多种创意玩法。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [环境变量](#环境变量)
- [构建与部署](#构建与部署)
- [API 概览](#api-概览)
- [测试](#测试)
- [许可证](#许可证)

---

## 功能特性

### 核心创作流程

- **多模态输入**：文字输入、语音输入、心情标签快捷选择、上传图片让 AI 理解情绪
- **情绪分析**：AI 自动分析文字/图片情绪，推荐最匹配的导演风格
- **12 位导演风格**：宫崎骏、王家卫、是枝裕和、韦斯·安德森、诺兰、周星驰、贾樟柯、李安、黑泽明、索菲亚·科波拉、查泽雷、昆汀
- **多导演系列海报**：可同时选择多位导演，生成系列海报合集
- **海报版式**：竖版（朋友圈九宫格）、横版（小红书封面）、方形（朋友圈封面）、九宫格（系列合集）

### 风格自定义

- **创建风格**：用自然语言描述想要的视觉风格，AI 解析生成（赛博朋克、水墨东方、复古胶片等）
- **从电影生成**：输入电影名，AI 分析其视觉风格 DNA
- **风格混搭**：选择两位导演，按比例混合出全新风格
- **情绪推荐**：根据情绪自动推荐匹配的风格

### 电影探索（TMDB 数据）

- **热门电影**：正在热映、即将上映、口碑佳作
- **热度排行**：票房榜、讨论榜
- **电影详情**：风格 DNA 雷达图、色彩提取、最相似导演匹配、标志性场景
- **导演盲盒**：随机导演 × 随机电影风格，开启惊喜创作
- **情绪推荐电影**：输入心情，匹配风格最契合的电影
- **每周挑战赛 & 赛季面板**：主题创作、排行榜、赛季奖励

### 创意玩法

- **金句卡**：选择电影金句，生成电影风格金句卡（方版/竖版）
- **名场面重绘**：选择标志性场景，用你的方式重新演绎
- **连环画**：用 3-4 个场景讲述故事，生成电影风格连环画
- **角色二创**：经典台词 / 恶搞改编 / 神反应，制作角色表情包
- **竞猜海报**：生成电影线索海报，让朋友猜电影名（三档难度）
- **如果换导演**：选择另一位导演，看看他会怎么拍这部电影

### 其他

- **AI 影评 & 导演手记**：自动生成专业影评和导演创作手记
- **电影墙**：个人作品集，本地持久化
- **多人共创**：每人写一句话，AI 融合成一部电影
- **分享**：二维码分享、链接复制
- **预告片**：生成海报预告片动画

---

## 技术栈

| 分类 | 技术 | 说明 |
|------|------|------|
| **前端** | Vanilla JS + Vite + TypeScript | 原生 JS 实现，TypeScript 渐进迁移 |
| **前端依赖** | qrcode | 二维码生成（分享功能） |
| **后端** | Express.js | Node.js Web 框架 |
| **后端中间件** | helmet、cors、dotenv | 安全头、跨域、环境变量 |
| **请求校验** | Zod | Schema 驱动的请求参数校验 |
| **日志** | pino + pino-pretty | 高性能结构化日志 |
| **HTTP 客户端** | node-fetch | 调用火山引擎 / TMDB API |
| **AI 服务** | 火山引擎（火山方舟） | 豆包 Seedream 4.0 图片生成 + doubao-1.5-pro 文本模型 |
| **电影数据** | TMDB API | 热门电影、票房排行、电影详情 |
| **构建工具** | Vite | 前端构建与开发服务器 |
| **代码规范** | ESLint + Prettier + Husky + lint-staged | 代码风格统一与 Git 钩子 |
| **后端测试** | Vitest | 单元测试 |
| **E2E 测试** | Playwright | 端到端测试 |
| **容器化** | Docker + Docker Compose | 多阶段构建、一键部署 |

---

## 快速开始

### 环境要求

- **Node.js** >= 20（项目根目录 `.nvmrc` 指定版本 20，推荐使用 [nvm](https://github.com/nvm-sh/nvm) 管理）
- **npm** >= 9
- 火山引擎 API Key（必需，用于 AI 生图与文本生成）
- TMDB API Key（必需，用于电影数据）

### 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd zaojing-mvp

# 2. 使用 nvm 切换 Node 版本（可选）
nvm use

# 3. 安装根目录依赖（前端 + 开发工具）
npm install

# 4. 安装后端依赖
cd server && npm install && cd ..

# 5. 配置环境变量
cp server/.env.example server/.env
# 编辑 server/.env，填入 VOLCENGINE_API_KEY 和 TMDB_API_KEY
```

### 启动开发服务器

项目支持两种启动方式：

```bash
# 方式一：同时启动前端（Vite）和后端（Express）
npm start
# 前端：http://localhost:5173（Vite 默认端口）
# 后端：http://localhost:8127

# 方式二：分别启动（推荐调试时使用）
# 终端 1：启动后端
npm run server

# 终端 2：启动前端
npm run dev
```

启动后访问 Vite 开发服务器地址即可使用。前端通过代理将 `/api` 请求转发到后端。

---

## 项目结构

```
zaojing-mvp/
├── index.html                  # 前端入口 HTML（单页应用）
├── showcase.html               # 作品展示页
├── package.json                # 根目录依赖与脚本
├── vite.config.*               # Vite 配置
├── tsconfig.json               # TypeScript 配置
├── .nvmrc                      # Node 版本锁定（20）
├── .eslintrc.cjs               # ESLint 配置
├── .prettierrc                 # Prettier 配置
├── .husky/                     # Git 钩子（pre-commit）
│
├── css/
│   └── app.css                 # 全局样式
│
├── js/                         # 前端源码
│   ├── app.js                  # 应用入口与路由
│   ├── shared.ts               # 共享工具（导航、toast、模态框、DOM 工具）
│   ├── ai-client.ts            # AI 接口客户端（TypeScript，含 AbortController 超时）
│   ├── components.ts           # Web Components（zj-modal、zj-toast、zj-loading）
│   ├── data.ts                 # 导演 / 心情标签 / 金句数据
│   ├── movie-data.js           # 电影相关数据
│   ├── movie-module.js         # 电影模块（热映、排行榜、详情、盲盒）
│   ├── poster-engine.ts        # 海报渲染引擎（Canvas，wrapText 智能换行）
│   ├── poster-worker.js        # 海报背景渲染 Web Worker
│   ├── state.ts                # 全局状态管理（TypeScript）
│   ├── types.d.ts              # TypeScript 类型定义
│   ├── pages/                  # 页面模块（首屏 input/directors 同步，其余懒加载）
│   │   ├── input.js            # 输入页（文字/语音/图片上传/心情标签）
│   │   ├── directors.js        # 导演选择页（DNA 雷达图、多选）
│   │   ├── generating.js       # 生成中页（真实阶段反馈、取消按钮）
│   │   ├── result.js           # 结果页（海报展示、电影墙、分享、重新生成）
│   │   ├── style.js            # 风格自定义页（风格解析、混搭、情绪推荐）
│   │   ├── cocreate.js         # 多人共创页
│   │   ├── trailer.js          # 预告片动画页
│   │   ├── batch.js            # 批量生成页
│   │   ├── templates.js        # 创意模板（金句卡/连环画/梗图/竞猜）
│   │   ├── brand.js            # 品牌设置页（Logo、水印、字体）
│   │   ├── hot-topics.js       # 热门话题页
│   │   ├── typography.js       # 字体排版页
│   │   └── accounts.js         # 账号管理页
│   └── utils/
│       ├── sanitize.ts         # 输入净化（escapeHtml/sanitizeColor/sanitizeImageUrl/sanitizeAttr）
│       ├── constants.ts        # 命名常量（超时/限流/字号比例/阈值）
│       ├── storage.ts          # 智能存储（localStorage + IndexedDB 自动降级）
│       ├── logger.ts           # 前端分级日志
│       ├── error-boundary.js   # 模块级错误边界
│       ├── lazy-load.js        # 图片懒加载
│       ├── compliance.js       # 内容合规检测
│       ├── batch-queue.js      # 批量生成队列
│       ├── canvas.js           # Canvas 辅助工具
│       ├── dna.ts              # 导演 DNA 雷达图
│       ├── font-manager.js     # 自定义字体管理
│       ├── account-manager.js  # 多账号配置
│       ├── brand-toolkit.js    # 品牌工具包
│       ├── hot-topics.js       # 热门话题抓取
│       ├── poster-animator.js  # 海报动画效果
│       ├── social-share.js     # 社交分享
│       └── sentry.js           # 错误追踪
│
├── server/                     # 后端服务
│   ├── server.js               # Express 主入口（helmet/CSP/限流/路由）
│   ├── ai-service.js           # AI 服务封装（火山引擎调用，prompt sanitize）
│   ├── validators.js           # 请求参数校验（Zod Schema）
│   ├── cache.js                # 多级缓存（情绪 / 文案 / 图片 / 风格）
│   ├── cost-monitor.js         # API 成本监控（原子写入）
│   ├── image-storage.js        # 生成图片存储与清理
│   ├── logger.js               # 日志模块（pino）
│   ├── movie-tracker.js        # 电影热度追踪与审核（原子写入）
│   ├── api-gateway.js          # MCP 文件系统网关（原子写入）
│   ├── prompt-sanitizer.js     # Prompt Injection 防护
│   ├── data/
│   │   └── movies.json         # 本地电影数据
│   ├── generated/              # 生成图片存储（Docker volume）
│   ├── gallery/                # 画廊数据（Docker volume，原子写入）
│   ├── utils/
│   │   └── atomic-write.js     # 原子写入工具（tmp + rename）
│   ├── tests/                  # 后端单元测试（Vitest）
│   │   ├── ai-service.test.js
│   │   ├── api.test.js
│   │   ├── atomic-write.test.js
│   │   ├── cache.test.js
│   │   ├── compliance.test.js
│   │   ├── cost-monitor.test.js
│   │   ├── prompt-sanitizer.test.js
│   │   ├── rate-limit.test.js
│   │   ├── server.test.js
│   │   └── validators.test.js
│   └── .env.example            # 环境变量示例
│
├── e2e/                        # 端到端测试（Playwright）
│   ├── tests/
│   │   └── core-flow.spec.js   # 核心用户流程测试
│   ├── playwright.config.js    # Playwright 配置
│   └── package.json
│
├── dist/                       # 前端构建产物（gitignore）
├── Dockerfile                  # Docker 多阶段构建
└── docker-compose.yml          # Docker Compose 编排
```

---

## 环境变量

后端环境变量配置文件位于 [`server/.env.example`](server/.env.example)。使用前请复制为 `server/.env` 并填入实际密钥：

```bash
cp server/.env.example server/.env
```

### 关键变量说明

| 变量名 | 必需 | 说明 |
|--------|------|------|
| `VOLCENGINE_API_KEY` | 是 | 火山方舟 API Key，用于豆包文本模型 + Seedream 4.0 图片生成。申请地址：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey |
| `TMDB_API_KEY` | 是 | TMDB API Key，用于热门电影、票房排行、电影详情。申请地址：https://www.themoviedb.org/settings/api |
| `API_KEY` | 生产环境必需 | 保护 `/api/*` 端点。同源浏览器请求通过 Origin 头验证，外部调用需在请求头携带 `X-API-Key`。留空则仅允许 localhost 访问 |
| `ADMIN_TOKEN` | 生产环境必需 | 保护 `/api/admin/*` 端点（电影审核、数据刷新）。请求时需在请求头携带 `X-Admin-Token` |
| `METRICS_TOKEN` | 生产环境建议配置 | 保护 `/metrics` 端点（Prometheus 指标）。使用 Bearer Token 认证（`Authorization: Bearer <token>`），采用时序安全比较防攻击 |
| `TRUST_PROXY_HOPS` | 反向代理时必需 | 信任的反向代理层数（默认 0）。使用 Nginx/CDN 时设置为对应层数，以正确获取客户端 IP |
| `CORS_WHITELIST` | 生产环境需配置 | 允许跨域访问的域名列表，逗号分隔。开发环境默认允许 localhost |
| `PORT` | 否 | 服务器端口，默认 `8127` |
| `NODE_ENV` | 否 | 运行环境，`development` 或 `production` |
| `STATIC_DIR` | 否 | 静态文件目录（相对于 `server/`），默认 `../` |

> 注：本项目已移除 OpenAI 依赖，纯使用国内方案（火山引擎）。

---

## 构建与部署

### 本地构建

```bash
# 构建前端生产包（输出到 dist/）
npm run build

# 本地预览构建产物
npm run preview
```

### Docker 部署

项目提供多阶段构建的 Dockerfile 和 Docker Compose 编排，支持一键部署。

#### 使用 Docker Compose（推荐）

```bash
# 1. 准备环境变量（在项目根目录创建 .env 或直接导出）
export VOLCENGINE_API_KEY=your_key
export TMDB_API_KEY=your_key
export API_KEY=your_api_key
export CORS_WHITELIST=https://your-domain.com

# 2. 构建并启动
docker compose up -d --build

# 3. 查看日志
docker compose logs -f

# 4. 停止
docker compose down
```

服务启动后访问 `http://localhost:8127`。Docker Compose 配置包含：

- 端口映射：`8127:8127`
- 数据持久化：`zaojing-generated`（生成图片）、`zaojing-gallery`（画廊数据）
- 健康检查：每 30 秒探测 `/api/health`
- 自动重启：`unless-stopped`

#### 使用 Docker 单独构建

```bash
# 构建镜像
docker build -t zaojing .

# 运行容器
docker run -d \
  --name zaojing \
  -p 8127:8127 \
  -e VOLCENGINE_API_KEY=your_key \
  -e TMDB_API_KEY=your_key \
  -e API_KEY=your_api_key \
  -e NODE_ENV=production \
  zaojing
```

### 生产环境注意事项

1. **必须配置** `API_KEY` 和 `ADMIN_TOKEN`，否则 API 端点仅允许 localhost 访问
2. **必须配置** `METRICS_TOKEN` 以保护 `/metrics` 端点
3. **必须配置** `CORS_WHITELIST` 为你的部署域名
4. 设置 `NODE_ENV=production` 以启用静态文件缓存、CSP 等生产特性
5. **反向代理**：如果使用 Nginx/CDN 等反向代理，需设置 `TRUST_PROXY_HOPS` 环境变量为代理层数（默认 0，不信任任何代理）
6. 后端内置分级速率限制（分析类 20 次/分钟，生图类 15 次/分钟，管理类 10 次/分钟，读取类 60 次/分钟），生产环境建议替换为 Redis
7. **安全特性**：CSP 策略（限制脚本/样式/图片来源）、Prompt Injection 防护（危险模式过滤 + XML 标签包裹）、XSS 防护（输入转义 + 颜色/URL/属性校验）、请求参数 Zod 校验、Helmet 安全头
8. **数据持久化**：画廊和成本统计使用原子写入（tmp + rename），防止进程崩溃导致数据损坏；电影墙缩略图使用 IndexedDB 存储，避免 localStorage 5MB 限制

---

## API 概览

所有 API 端点前缀为 `/api`，除健康检查外均需认证（同源请求自动放行，外部调用需携带 `X-API-Key` 请求头）。

### 核心 AI 服务

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 健康检查（无需认证），返回服务状态、缓存与成本统计 |
| `POST` | `/api/analyze` | 情绪分析 + 导演推荐 |
| `POST` | `/api/generate-image` | AI 图片生成（支持 Seedream / Canvas 引擎） |
| `POST` | `/api/generate-copy` | AI 文案生成（标题、金句、影评） |
| `POST` | `/api/generate-copy-stream` | AI 文案流式生成（SSE，打字机效果） |
| `POST` | `/api/agent/create` | Agent 全链路编排（分析 + 多导演生成） |
| `POST` | `/api/analyze-image` | 图片情绪分析（Vision） |

### 风格管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/parse-style` | 自定义风格解析（自然语言 → 风格 DNA） |
| `POST` | `/api/analyze-movie` | 电影风格分析（电影名 → 视觉风格） |
| `POST` | `/api/blend-styles` | 风格混搭（两位导演按比例混合） |
| `POST` | `/api/recommend-style` | 情绪推荐风格 |

### MCP 文件系统（画廊管理）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/mcp/save-poster` | 保存海报到画廊 |
| `GET` | `/api/mcp/gallery` | 读取画廊列表 |
| `DELETE` | `/api/mcp/gallery/:id` | 删除指定海报 |
| `GET` | `/api/mcp/reference/:directorId` | 获取导演参考素材 |

### 电影数据（TMDB）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/movies` | 获取已审核的热门电影列表 |
| `GET` | `/api/movies/ranking` | 获取热度排行榜（票房榜、讨论榜） |
| `GET` | `/api/movies/:id` | 获取电影详情 |
| `POST` | `/api/movies/:id/analyze-dna` | 触发电影风格 DNA 分析 |

### 管理端点（需 `X-Admin-Token`）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/admin/movies/:id/approve` | 审核通过电影 |
| `POST` | `/api/admin/movies/:id/reject` | 拒绝电影 |
| `POST` | `/api/admin/movies/refresh` | 手动刷新热度数据 |

---

## 测试

### 前端单元测试（Vitest）

前端测试位于 `js/tests/`，覆盖组件、工具函数、Canvas 引擎、状态管理等模块。

```bash
# 在项目根目录运行
npm test

# 监听模式
npm run test:watch
```

测试文件覆盖：sanitize 安全工具、constants 常量、poster-engine 排版引擎（含 wrapText 边界 case）、components Web Components、error-boundary 错误边界、batch-queue 批量队列、state 状态管理、logger 日志、DNA 雷达图、brand-toolkit 品牌工具、font-manager 字体管理、account-manager 账号管理、templates 模板管理、hot-topics 热门话题、compliance 合规检测、directors-consistency 导演数据一致性、ai-client AI 客户端。

### 后端单元测试（Vitest）

后端测试位于 `server/tests/`，覆盖 AI 服务、缓存、成本监控、请求校验、限流、Prompt Injection 防护、原子写入、API 错误路径等模块。

```bash
cd server

# 运行所有测试
npm test

# 监听模式（开发时实时运行）
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

测试文件：

- `server/tests/ai-service.test.js` — AI 服务封装测试
- `server/tests/api.test.js` — API 端点测试（含错误路径/边界 case）
- `server/tests/atomic-write.test.js` — 原子写入工具测试
- `server/tests/cache.test.js` — 缓存层测试
- `server/tests/compliance.test.js` — 内容合规检测测试
- `server/tests/cost-monitor.test.js` — 成本监控测试
- `server/tests/prompt-sanitizer.test.js` — Prompt Injection 防护测试
- `server/tests/rate-limit.test.js` — 速率限制测试
- `server/tests/server.test.js` — Express 服务器测试
- `server/tests/validators.test.js` — 请求参数校验测试

### E2E 端到端测试（Playwright）

E2E 测试位于 `e2e/`，覆盖首页加载、输入文字、选择导演、生成海报等核心用户流程。

```bash
cd e2e

# 安装 Playwright 浏览器（首次运行）
npx playwright install chromium

# 运行所有 E2E 测试（无头模式）
npm test

# 有头模式运行（可视化调试）
npm run test:headed

# 查看 HTML 测试报告
npm run report
```

测试配置（`e2e/playwright.config.js`）：

- 测试目录：`./tests`
- baseURL：`http://localhost:8127`
- 浏览器：Chromium
- 自动启动 webServer（`cd server && node server.js`）
- 失败时自动截图、录制视频、保留 trace

---

## 许可证

本项目采用 [ISC License](LICENSE) 许可证。
