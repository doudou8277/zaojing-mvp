# 热门电影同风格海报生成模块 — 设计文档

> 日期：2026-06-24
> 项目：造境 ZaoJing MVP
> 阶段：第一阶段（核心 MVP）
> 状态：待审核

---

## 1. 概述

### 1.1 功能目标

在造境 ZaoJing 应用中新增"热门电影"独立模块，用户可以浏览当前热门电影（基于票房、播放量、社交媒体热度动态更新），选择电影后生成与该电影视觉风格一致的海报，查看电影风格 DNA 解构，浏览热度排行榜。

### 1.2 设计原则

- **影院级视觉体验**：沉浸感、戏剧性、胶片质感
- **动态热度追踪**：混合模式（自动抓取 + 管理员审核），非静态列表
- **最大化复用**：复用现有 PosterEngine、Vision API、风格 DNA 体系
- **模块化解耦**：独立模块文件，不影响现有功能稳定性

### 1.3 第一阶段范围

| 功能 | 编号 | 描述 |
|------|------|------|
| 热度数据基础设施 | — | 自动抓取 TMDB/猫眼数据 + 管理员审核机制 |
| 独立模块入口 + 电影列表页 | — | 新增 page-movies，展示热门电影卡片 + 热度指标 + 排行榜 |
| 同风格海报生成 | H1 | 选电影 → 输入文字 → 生成该电影视觉风格的海报 |
| 电影 DNA 解构 | H5 | Vision 分析电影剧照 → 生成风格 DNA 雷达图 → 与 12 导演对比 |
| 热度排行榜 | X3 | 本周票房 TOP10 + 讨论度 TOP10 |

### 1.4 后续阶段预告

- **第二阶段**：H4 如果换导演、H7 电影金句卡、D3 导演盲盒、D2 风格参数微调
- **第三阶段**：H2 名场面重绘、X2 电影×导演 DNA 混搭、D4 海报连环画、D6 情绪推荐增强
- **第四阶段**：H3 角色搞怪二创、H6 票房竞猜海报、X1 风格挑战赛、X4 主题创作赛季

---

## 2. 架构设计

### 2.1 文件结构

```
zaojing-mvp/
├── js/
│   ├── app.js              # 现有主应用（新增模块入口按钮绑定）
│   ├── data.js             # 现有导演数据（保持不变）
│   ├── movie-data.js       # 新：热门电影数据结构 + 本地 fallback 数据
│   ├── movie-module.js     # 新：热门电影模块逻辑（IIFE 模块）
│   ├── poster-engine.js    # 现有（扩展：支持 movieId 参数 + movie 背景渲染器）
│   └── ai-client.js        # 现有（扩展：新增电影相关 API 调用）
├── server/
│   ├── server.js           # 现有（新增电影 API 路由）
│   ├── ai-service.js       # 现有（扩展：analyzeMovieDNA 函数）
│   ├── movie-tracker.js    # 新：热度数据抓取 + 管理机制
│   └── data/
│       └── movies.json     # 新：热门电影数据存储
├── css/
│   └── app.css             # 现有（新增电影模块样式）
└── index.html              # 现有（新增 page-movies + 详情面板 + 导航入口）
```

### 2.2 模块通信机制

`MovieModule` 作为独立 IIFE 模块，通过以下方式与主应用通信：

```js
// movie-module.js
const MovieModule = (function() {
  // 内部状态
  const state = {
    movies: [],
    currentMovie: null,
    selectedMovieId: null
  };

  // 暴露给主应用的接口
  return {
    init,                    // 初始化模块（由 App.init 调用）
    navigateToMovies,        // 跳转到电影列表页
    openMovieDetail,         // 打开电影详情面板
    selectMovieForGeneration,// 选择电影后跳转到输入页
    getSelectedMovie,        // 获取当前选中的电影（供 PosterEngine 使用）
    refreshMovies            // 刷新电影列表
  };
})();
```

主应用 `app.js` 在 `init()` 中调用 `MovieModule.init()`，并在导航中添加电影模块入口。

---

## 3. 数据架构

### 3.1 电影数据结构

```js
{
  id: "nezha2-2025",
  title: "哪吒之魔童闹海",
  enTitle: "Ne Zha 2",
  director: "饺子",
  releaseDate: "2025-01-29",
  posterUrl: "https://image.tmdb.org/t/p/w500/...",
  backdropUrl: "https://image.tmdb.org/t/p/original/...",

  // 热度指标
  heatScore: 95,            // 0-100 综合热度
  boxOffice: 16400000000,   // 票房（人民币）
  boxOfficeRank: 1,
  socialHeat: 'explosive',  // explosive | high | medium | rising
  socialMentions: 12000000, // 社交媒体提及量
  trendingPeriod: "2025.01 - 2025.06",
  lastUpdated: "2026-06-24T12:00:00Z",

  // 视觉风格
  visualStyle: "东方水墨神话史诗",
  styleKeywords: ["水墨", "高饱和", "神话", "东方色彩"],
  signatureScenes: [
    "哪吒与敖丙的宿命对决",
    "混元珠爆发",
    "海底龙宫崩塌"
  ],
  iconicQuotes: [
    "我命由我不由天",
    "若命运不公，就和它斗到底"
  ],

  // 风格 DNA（与导演 DNA 同构，8 维度）
  styleDNA: {
    colorTemperature: 'warm',
    saturation: 'high',
    contrast: 'high',
    compositionType: 'dynamic',
    lightingType: 'dramatic',
    scale: 'monumental',
    pace: 'dynamic',
    texture: 'painterly'
  },

  // 色彩（从剧照提取，6 色 hex）
  colors: {
    primary: '#c0392b',
    secondary: '#2c3e50',
    accent: '#f39c12',
    bg: '#1a0a0a',
    text: '#f5e6d3',
    textLight: '#c9a96e'
  },

  // 导演匹配（基于 DNA 相似度计算）
  matchedDirectorIds: ['lee', 'kurosawa'],
  matchScores: { lee: 0.85, kurosawa: 0.78, miyazaki: 0.65 },

  // AI 生成 prompt
  stylePrompt: "Eastern ink wash mythology epic, high saturation traditional Chinese colors, dramatic lighting, monumental scale, dynamic composition with flowing ink elements",
  negativePrompt: "low quality, blurry, text, watermark, deformed",

  // 字体偏好（用于海报文字渲染）
  fontFamily: "'Noto Serif SC', serif",
  titleWeight: 900,

  // 状态
  status: 'active',  // active | upcoming | archived
  featured: true,    // 是否为本周冠军
  approved: true,    // 管理员是否已审核
  approvedAt: "2026-06-24T10:00:00Z"
}
```

### 3.2 热度数据抓取（`server/movie-tracker.js`）

**数据源**：
- **TMDB API**（`/trending/movie/week`、`/movie/{id}`、`/movie/{id}/images`）：全球电影数据、海报、剧照
- **猫眼/灯塔**（网页抓取）：中国票房数据
- **社交媒体**（定性评估）：微博热搜、抖音话题量（通过公开页面估算）

**热度算法**：
```
heatScore = boxOfficeScore * 0.4 + socialScore * 0.3 + recencyScore * 0.2 + attendanceScore * 0.1

其中：
- boxOfficeScore: 票房对数归一化到 0-100
- socialScore: 社交提及量对数归一化到 0-100
- recencyScore: 上映 30 天内=100，每 30 天递减 10
- attendanceScore: 上座率归一化（如有数据）
```

**更新机制**：
- 定时任务每 6 小时执行一次（`setInterval` 或 cron）
- 抓取数据写入 `server/data/movies.json`
- 新电影状态为 `approved: false`，需管理员审核后变为 `approved: true`
- 管理员审核接口：`POST /api/admin/movies/:id/approve`、`POST /api/admin/movies/:id/reject`

**本地 Fallback**：
- `js/movie-data.js` 内置 10 部预设电影数据（含完整 DNA + colors + prompt）
- 当后端 `/api/movies` 不可用时，前端使用本地数据
- 本地数据每季度手动更新一次

### 3.3 API 端点

| 方法 | 路由 | 功能 | 限流 |
|------|------|------|------|
| GET | `/api/movies` | 获取已审核的热门电影列表 | 无 |
| GET | `/api/movies/:id` | 获取电影详情 | 无 |
| GET | `/api/movies/ranking` | 热度排行榜（票房+讨论度） | 无 |
| POST | `/api/movies/:id/analyze-dna` | 触发电影风格 DNA 分析 | 10次/分钟 |
| POST | `/api/admin/movies/:id/approve` | 管理员审核通过 | 无 |
| POST | `/api/admin/movies/:id/reject` | 管理员拒绝 | 无 |
| POST | `/api/admin/movies/refresh` | 手动触发热度数据刷新 | 1次/分钟 |

---

## 4. UI/UX 设计

### 4.1 导航入口

- 顶部导航栏新增"热门电影"按钮，与"我的电影墙"并列
- 输入页底部新增"热门电影"入口卡片，带实时热度数字（如"本周 12 部热映"）
- 按钮样式：与现有导航一致，但带一个微妙的脉冲动画提示新功能

### 4.2 电影列表页（`page-movies`）

**布局结构**：

1. **Cinematic Hero**（顶部，50vh）
   - 全屏宽度，使用本周冠军电影的剧照做背景
   - 底部 60% 渐变到 `var(--bg)` 保证文字可读性
   - 内容：本周冠军标签 + 电影标题（Noto Serif SC 2.5rem）+ 导演 + 票房 + 热度条 + CTA 按钮
   - 热度条：品牌薄荷绿渐变，宽度按 heatScore 比例
   - CTA 按钮：`✦ 生成同风格海报 →`，带 glow 效果

2. **正在热映**（横向滑动区）
   - 标题 + 左右箭头按钮
   - 横向 `scroll-snap` 滑动，每张卡片 `scroll-snap-align: start`
   - 卡片尺寸：200×300px（2:3 海报比例）
   - 卡片内容：TMDB 海报全幅背景 + 底部渐变 + 标题 + 热度徽章
   - 热度徽章色标：🔴 爆表(90+) / 🟠 高热(70-89) / 🟡 上升(50-69)
   - Hover：卡片放大 1.05x + 上浮 4px + 阴影加深
   - 分类 tab：正在热映 | 即将上映 | 口碑佳作

3. **排行榜**（双列）
   - 左列：🏆 票房榜 TOP10
   - 右列：💬 讨论榜 TOP10
   - TOP3 用金/银/铜色标，排名数字用 JetBrains Mono 大号
   - 每行：排名 + 电影名 + 数值（票房/讨论量）
   - 点击跳转到电影详情

### 4.3 电影详情面板（全屏沉浸式覆盖层）

**结构**：
- 全屏 `position:fixed; inset:0; z-index:100`
- 背景：电影剧照 + `backdrop-filter: blur(20px)` + `rgba(11,10,9,.92)` 遮罩
- 入场动画：从底部滑入 `translateY(100%) → 0`，300ms `cubic-bezier(.22,1,.36,1)`

**内容布局**（两列）：
- **左列**：电影海报（原版，300×450px）+ 基础信息（导演/上映/票房/热度）
- **右列**：
  - 风格 DNA 雷达图（Canvas 绘制，8 维度多边形，半透明薄荷绿填充 + 描边）
  - 雷达图可交互：hover 维度顶点显示标签和数值
  - 可叠加一位匹配导演的 DNA 做对比（虚线轮廓）
  - 色彩提取：6 个色块横排（48×48px），标注 hex 值，hover 放大
  - 最相似导演：水平进度条，薄荷绿填充，百分比用 JetBrains Mono

**底部区域**：
- 标志性场景：TMDB 剧照缩略图横排（圆角 8px），hover 放大 + 显示场景描述
- CTA 按钮组：`✦ 生成同风格海报 →`（主按钮）+ `📊 DNA对比` + `🔗 分享`

### 4.4 生成流程

1. 用户在电影详情面板点击"生成同风格海报"
2. 详情面板关闭，跳转到输入页
3. 输入页顶部显示电影风格标签：`[🎬 哪吒2 · 东方水墨]`（薄荷绿描边 + 电影缩略图），可点击移除或更换
4. 用户输入文字 → 点击"选择导演 →"（此时导演选择页会标注"已选电影风格，导演为可选"）
5. 生成海报
6. 结果页左侧显示生成的海报，右侧新增"灵感来源"面板：
   - 电影剧照缩略图
   - 风格 DNA 迷你雷达图
   - "查看电影详情"链接
7. 生成动画步骤文案："正在解析《哪吒2》视觉风格..." → "调配色彩..." → "渲染画面..." → "添加文字..."

### 4.5 响应式设计

- **桌面端**（>768px）：Hero 全宽，卡片横滑，详情面板双列
- **平板端**（768px）：Hero 高度 40vh，卡片缩小到 160×240px，详情面板单列
- **移动端**（<480px）：Hero 高度 35vh，卡片 140×210px，排行榜单列，详情面板全屏单列

### 4.6 视觉规范

- **色彩**：复用品牌色系（`--bg`, `--ink`, `--miya` 等），电影卡片使用电影自身的 colors 做点缀
- **字体**：标题用 Noto Serif SC，数据用 JetBrains Mono，正文用 Noto Sans SC
- **圆角**：卡片 12px，按钮 8px，色块 4px
- **阴影**：`0 8px 32px rgba(0,0,0,.4)` 用于浮层和卡片 hover
- **过渡**：所有交互元素 `transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s`

---

## 5. 生成管线设计

### 5.1 电影风格海报生成流程

```
用户输入文字 + 选择电影
        │
        ▼
MovieModule.selectMovieForGeneration(movieId)
  - state.selectedMovieId = movieId
  - 跳转到输入页，显示电影标签
        │
        ▼
用户点击"选择导演 →"
  - 如果未选导演，使用电影的 matchedDirectorIds[0] 作为默认
  - 如果选了导演，导演风格与电影风格叠加
        │
        ▼
startGeneration()
  - 读取 MovieModule.getSelectedMovie()
  - 组装引擎参数
        │
        ▼
PosterEngine.generate({
  text: state.inputText,
  movieId: movie.id,           // 新参数
  stylePrompt: movie.stylePrompt,
  colors: movie.colors,
  styleDNA: movie.styleDNA,
  fontFamily: movie.fontFamily,
  titleWeight: movie.titleWeight,
  format: state.posterFormat,
  showQuote: state.showQuote,
  title: state.currentTitle,
  quote: movie.iconicQuotes[0] // 优先使用电影金句
})
        │
        ▼
引擎内部：
  ├─ AI 生图：stylePrompt 替代 director.promptCore
  ├─ Canvas 背景：新增 bgRenderers['movie']，使用 movie.colors + drawCustomBg 逻辑
  ├─ 文字层：使用 movie.fontFamily + movie.titleWeight
  ├─ 金句：优先 movie.iconicQuotes，fallback 到匹配导演的 quotes
  ├─ 暗角/胶片孔/水印：复用现有逻辑
  └─ 返回结果包含 movieRef 字段
        │
        ▼
结果页展示
  - 左侧：生成的海报
  - 右侧：灵感来源面板（电影剧照 + DNA 迷你雷达 + 详情链接）
```

### 5.2 PosterEngine 扩展

**新增参数**：
- `movieId`：电影 ID，当存在时使用电影风格而非导演风格
- `stylePrompt`：电影风格 prompt（替代 director.promptCore）
- `colors`：电影色彩（替代 director.colors）
- `styleDNA`：电影风格 DNA（替代 director.styleDNA）
- `fontFamily` / `titleWeight`：字体偏好

**新增背景渲染器**：
- `bgRenderers['movie']`：当 `movieId` 存在时调用
- 复用 `drawCustomBg` 的动态背景逻辑，但使用电影的 `colors` 和 `styleDNA`
- 根据 `styleDNA.texture` 选择不同的纹理叠加（grainy → 噪点, painterly → 笔触, smooth → 渐变）

**结果对象扩展**：
```js
{
  dataUrl: "blob:...",
  title: "生成的标题",
  quote: "电影金句",
  director: "哪吒2",  // 电影标题
  directorId: "nezha2-2025",  // 电影 ID
  format: "vertical",
  width: 720,
  height: 1080,
  usedAI: true,
  movieRef: {  // 新增
    id: "nezha2-2025",
    title: "哪吒之魔童闹海",
    posterUrl: "https://...",
    styleDNA: { ... }
  }
}
```

---

## 6. 电影 DNA 分析

### 6.1 分析流程

```
管理员触发 DNA 分析（或电影首次审核时自动触发）
        │
        ▼
analyzeMovieDNA(movieId)
  │
  ├─ 1. searchTMDBImages(movieTitle) → 获取 3-5 张剧照
  │
  ├─ 2. 每张剧照调用 callVisionLLM：
  │     prompt: "Analyze this movie still and extract its visual style DNA
  │              across 8 dimensions: colorTemperature, saturation, contrast,
  │              compositionType, lightingType, scale, pace, texture.
  │              Also extract 6 dominant colors as hex values.
  │              Return as JSON."
  │
  ├─ 3. 合并结果：
  │     - DNA 各维度取众数（分类值）或均值（如有数值化）
  │     - colors 取所有剧照出现频率最高的 6 个颜色
  │
  ├─ 4. 与 12 导演 DNA 计算相似度：
  │     - 对每个导演调用 calculateDNASimilarity(movieDNA, directorDNA)
  │     - 取 Top 3 作为 matchedDirectorIds
  │
  ├─ 5. 生成 stylePrompt：
  │     - 基于 DNA 维度值组装英文 prompt
  │     - 加入 styleKeywords 作为修饰词
  │     - 加入 visualStyle 作为整体描述
  │
  └─ 6. 存储到 movie 数据中
```

### 6.2 DNA 雷达图渲染

- Canvas 绘制，8 维度正多边形
- 电影 DNA：半透明薄荷绿填充（`rgba(127,196,171,.15)`）+ 实线描边
- 对比导演 DNA：无填充 + 虚线描边（`--ink-mute` 色）
- 维度标签：8 个顶点外侧标注维度名 + 当前值
- 交互：hover 顶点时高亮该维度，显示详细说明
- 尺寸：300×300px（详情面板），120×120px（结果页迷你版）

---

## 7. 错误处理

| 场景 | 处理策略 | 用户可见反馈 |
|------|----------|-------------|
| TMDB API 不可用 | 使用本地 fallback 电影数据（10 部预设） | 无（静默降级） |
| `/api/movies` 返回空 | 显示空状态："暂无热门电影" + 引导使用导演模式 | 空状态插画 + CTA |
| Vision DNA 分析失败 | 管理员手动填写 DNA + 使用匹配导演的 DNA 作为默认 | 无（管理员侧） |
| AI 图片生成失败 | 降级到 Canvas 背景（使用电影 colors） | toast："AI 生图不可用，使用本地渲染" |
| 热度数据过期(>24h) | 列表正常显示，但标注"数据更新于 X 小时前" | 顶部提示条 |
| 电影剧照加载失败 | 使用电影海报作为 fallback 图片 | 无 |
| 管理员未审核任何电影 | 前端使用本地 fallback 数据 | 无 |

---

## 8. 测试策略

### 8.1 单元测试

- `movie-tracker.js`：热度算法计算、数据源抓取 mock、数据合并逻辑
- `movie-data.js`：本地 fallback 数据完整性、数据结构校验
- `PosterEngine`（扩展部分）：movieId 参数处理、movie 背景渲染器输出

### 8.2 集成测试

- 完整生成流程：选电影 → 输入文字 → 生成海报 → 结果展示
- DNA 分析流程：TMDB 剧照获取 → Vision 分析 → DNA 存储 → 雷达图渲染
- 管理员审核流程：抓取数据 → 审核 → 前端更新

### 8.3 浏览器测试

- 电影列表页：横向滑动、卡片 hover、排行榜点击
- 详情面板：入场动画、DNA 雷达图交互、场景缩略图
- 生成流程：电影标签显示/移除、结果页灵感来源面板
- 响应式：桌面/平板/移动端布局

---

## 9. 实施计划

### 9.1 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `js/movie-data.js` | 新建 | 电影数据结构 + 10 部本地 fallback 数据 |
| `js/movie-module.js` | 新建 | 电影模块逻辑（列表渲染、详情面板、生成流程） |
| `js/poster-engine.js` | 修改 | 新增 movieId 参数支持 + movie 背景渲染器 |
| `js/ai-client.js` | 修改 | 新增电影相关 API 调用方法 |
| `js/app.js` | 修改 | 新增模块入口绑定 + 导航 + 生成流程集成 |
| `server/movie-tracker.js` | 新建 | 热度数据抓取 + 管理机制 |
| `server/ai-service.js` | 修改 | 新增 analyzeMovieDNA 函数 |
| `server/server.js` | 修改 | 新增电影 API 路由 |
| `server/data/movies.json` | 新建 | 电影数据存储（初始为空或种子数据） |
| `css/app.css` | 修改 | 新增电影模块样式 |
| `index.html` | 修改 | 新增 page-movies + 详情面板 + 导航入口 |

### 9.2 实施顺序

1. **数据层**：`movie-data.js`（本地 fallback 数据）→ `movie-tracker.js`（后端抓取）
2. **后端 API**：`server.js` 路由 → `ai-service.js` DNA 分析
3. **引擎扩展**：`poster-engine.js` movie 参数支持
4. **前端模块**：`movie-module.js` 列表/详情/生成 → `index.html` 页面结构
5. **样式**：`css/app.css` 电影模块样式
6. **集成**：`app.js` 导航绑定 + 生成流程集成
7. **测试**：浏览器全流程验证
