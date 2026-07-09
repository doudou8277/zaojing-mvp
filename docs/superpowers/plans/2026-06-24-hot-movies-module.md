# 热门电影同风格海报生成模块 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在造境 ZaoJing 应用中新增"热门电影"独立模块，用户可浏览当前热门电影、生成同风格海报、查看电影风格 DNA。

**Architecture:** 模块化插件架构（方案 A）。新增 `movie-data.js`（数据）、`movie-module.js`（前端逻辑）、`movie-tracker.js`（后端热度追踪）三个独立文件，扩展现有 `poster-engine.js`、`ai-service.js`、`server.js`、`ai-client.js`、`app.js`、`index.html`、`app.css`。

**Tech Stack:** Vanilla JS (IIFE 模块模式) + Express.js + Canvas 2D API + TMDB API + 火山引擎/OpenAI Vision API

**Spec:** `docs/superpowers/specs/2026-06-24-hot-movies-module-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `js/movie-data.js` | 新建 | 电影数据结构定义 + 10 部本地 fallback 电影数据 |
| `server/movie-tracker.js` | 新建 | TMDB 热度数据抓取 + 热度算法 + 管理员审核机制 |
| `server/data/movies.json` | 新建 | 电影数据存储（初始种子数据） |
| `server/server.js` | 修改 | 新增 7 个电影 API 路由 |
| `server/ai-service.js` | 修改 | 新增 `analyzeMovieDNA` 函数 |
| `js/poster-engine.js` | 修改 | `generate()` 支持 `movieId` 参数 + movie 背景渲染器 |
| `js/ai-client.js` | 修改 | 新增 5 个电影相关 API 调用方法 |
| `js/movie-module.js` | 新建 | 电影列表渲染 + 详情面板 + DNA 雷达图 + 生成流程 |
| `index.html` | 修改 | 新增 `page-movies` + 详情面板 HTML + 导航入口 |
| `css/app.css` | 修改 | 新增电影模块全部样式 |
| `js/app.js` | 修改 | 模块初始化 + 导航绑定 + 生成流程集成 |

---

## Task 1: 电影数据结构与本地 Fallback 数据

**Files:**
- Create: `js/movie-data.js`

- [ ] **Step 1: 创建 movie-data.js 文件**

```js
/**
 * 造境 ZaoJing — 热门电影数据层 v1.0
 * 包含：电影数据结构 + 10 部本地 fallback 电影 + 热度等级定义
 */

// 热度等级定义
const HEAT_LEVELS = {
  explosive: { label: '社交爆表', color: '#e74c3c', min: 90 },
  high:      { label: '高热',    color: '#e67e22', min: 70 },
  medium:    { label: '上升',    color: '#f1c40f', min: 50 },
  rising:    { label: '新晋',    color: '#3498db', min: 0  }
};

// 根据热度分数获取热度等级
function getHeatLevel(score) {
  if (score >= HEAT_LEVELS.explosive.min) return 'explosive';
  if (score >= HEAT_LEVELS.high.min)      return 'high';
  if (score >= HEAT_LEVELS.medium.min)    return 'medium';
  return 'rising';
}

// 10 部本地 fallback 电影数据（2026 年 6 月热门）
const FALLBACK_MOVIES = [
  {
    id: 'nezha2-2025',
    title: '哪吒之魔童闹海',
    enTitle: 'Ne Zha 2',
    director: '饺子',
    releaseDate: '2025-01-29',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 95,
    boxOffice: 16400000000,
    boxOfficeRank: 1,
    socialHeat: 'explosive',
    socialMentions: 12000000,
    trendingPeriod: '2025.01 - 2025.06',
    lastUpdated: '2026-06-24',
    visualStyle: '东方水墨神话史诗',
    styleKeywords: ['水墨', '高饱和', '神话', '东方色彩', '史诗'],
    signatureScenes: ['哪吒与敖丙的宿命对决', '混元珠爆发', '海底龙宫崩塌'],
    iconicQuotes: ['我命由我不由天', '若命运不公，就和它斗到底'],
    styleDNA: { colorTemperature: 'warm', saturation: 'high', contrast: 'high', compositionType: 'dynamic', lightingType: 'dramatic', scale: 'monumental', pace: 'dynamic', texture: 'painterly' },
    colors: { primary: '#c0392b', secondary: '#2c3e50', accent: '#f39c12', bg: '#1a0a0a', text: '#f5e6d3', textLight: '#c9a96e' },
    matchedDirectorIds: ['lee', 'kurosawa'],
    matchScores: { lee: 0.85, kurosawa: 0.78, miyazaki: 0.65 },
    stylePrompt: 'Eastern ink wash mythology epic, high saturation traditional Chinese colors, dramatic lighting, monumental scale, dynamic composition with flowing ink elements, mythological atmosphere',
    negativePrompt: 'low quality, blurry, text, watermark, deformed, western style',
    fontFamily: "'Noto Serif SC', serif",
    titleWeight: 900,
    status: 'active',
    featured: true,
    approved: true
  },
  {
    id: 'toy5-2026',
    title: '玩具总动员5',
    enTitle: 'Toy Story 5',
    director: '安德鲁·斯坦顿',
    releaseDate: '2026-06-19',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 88,
    boxOffice: 131000000,
    boxOfficeRank: 2,
    socialHeat: 'high',
    socialMentions: 11620000,
    trendingPeriod: '2026.06',
    lastUpdated: '2026-06-24',
    visualStyle: '皮克斯3D动画·温暖怀旧',
    styleKeywords: ['3D动画', '温暖', '怀旧', '玩具', '微缩视角'],
    signatureScenes: ['胡迪与巴斯光年重聚', '玩具天团合体'],
    iconicQuotes: ['飞向宇宙，浩瀚无垠', '你是我最好的朋友'],
    styleDNA: { colorTemperature: 'warm', saturation: 'medium', contrast: 'medium', compositionType: 'symmetric', lightingType: 'natural', scale: 'intimate', pace: 'dynamic', texture: 'smooth' },
    colors: { primary: '#d4a843', secondary: '#8b6914', accent: '#c0392b', bg: '#2d1f0f', text: '#f0e0c0', textLight: '#c9a96e' },
    matchedDirectorIds: ['wes', 'miyazaki'],
    matchScores: { wes: 0.82, miyazaki: 0.75, lee: 0.60 },
    stylePrompt: 'Pixar 3D animation style, warm nostalgic tones, toy miniature perspective, soft natural lighting, symmetrical composition, playful and heartwarming',
    negativePrompt: 'dark mood, horror, realistic photo, grainy',
    fontFamily: "'Noto Sans SC', sans-serif",
    titleWeight: 800,
    status: 'active',
    featured: false,
    approved: true
  },
  {
    id: 'avatar3-2025',
    title: '阿凡达3：火与烬',
    enTitle: 'Avatar: Fire and Ash',
    director: '詹姆斯·卡梅隆',
    releaseDate: '2025-12-19',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 82,
    boxOffice: 8500000000,
    boxOfficeRank: 3,
    socialHeat: 'high',
    socialMentions: 8560000,
    trendingPeriod: '2025.12 - 2026.03',
    lastUpdated: '2026-06-24',
    visualStyle: '潘多拉海洋·生物荧光美学',
    styleKeywords: ['生物荧光', '海洋', '科幻', '3D', '异星'],
    signatureScenes: ['阿凡达半边脸特写', '潘多拉海洋生态奇观'],
    iconicQuotes: ['我看到你了', '一切能量都是借来的，终有一天要归还'],
    styleDNA: { colorTemperature: 'cool', saturation: 'high', contrast: 'high', compositionType: 'centered', lightingType: 'dramatic', scale: 'monumental', pace: 'dynamic', texture: 'smooth' },
    colors: { primary: '#00a8cc', secondary: '#001f3f', accent: '#7fffd4', bg: '#0a0a2a', text: '#e0f0ff', textLight: '#7ec8e3' },
    matchedDirectorIds: ['nolan', 'chazelle'],
    matchScores: { nolan: 0.80, chazelle: 0.72, wkw: 0.68 },
    stylePrompt: 'Pandora ocean bioluminescent aesthetic, alien marine ecosystem, cool blue cyan tones, dramatic lighting, monumental scale, photorealistic 3D render, ethereal glow',
    negativePrompt: 'low quality, cartoon, flat lighting, earth setting',
    fontFamily: "'Noto Serif SC', serif",
    titleWeight: 700,
    status: 'active',
    featured: false,
    approved: true
  },
  {
    id: 'jurassic-rebirth-2026',
    title: '侏罗纪世界：重生',
    enTitle: 'Jurassic World: Rebirth',
    director: '加雷斯·爱德华兹',
    releaseDate: '2026-06-13',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 79,
    boxOffice: 80000000,
    boxOfficeRank: 4,
    socialHeat: 'high',
    socialMentions: 5200000,
    trendingPeriod: '2026.06',
    lastUpdated: '2026-06-24',
    visualStyle: '写实派怪兽美学·丛林战争',
    styleKeywords: ['怪兽', '丛林', '写实', '战争', '恐龙'],
    signatureScenes: ['雇佣兵丛林战场', '恐龙融入人类生态'],
    iconicQuotes: ['生命会找到出路', '恐龙不再是化石，它们是现在'],
    styleDNA: { colorTemperature: 'cool', saturation: 'low', contrast: 'high', compositionType: 'dynamic', lightingType: 'dramatic', scale: 'monumental', pace: 'dynamic', texture: 'grainy' },
    colors: { primary: '#2d5016', secondary: '#1a1a0a', accent: '#8b0000', bg: '#0d1a0d', text: '#d4d4c4', textLight: '#8a8a7a' },
    matchedDirectorIds: ['nolan', 'kurosawa'],
    matchScores: { nolan: 0.78, kurosawa: 0.70, jia: 0.55 },
    stylePrompt: 'Realistic monster aesthetic, jungle warfare, desaturated cool tones, high contrast, dramatic lighting, monumental dinosaurs, gritty texture, cinematic',
    negativePrompt: 'cartoon, bright colors, cute, flat lighting',
    fontFamily: "'Noto Serif SC', serif",
    titleWeight: 800,
    status: 'active',
    featured: false,
    approved: true
  },
  {
    id: 'nolan-untitled-2026',
    title: '诺兰未定名新片',
    enTitle: 'Nolan Untitled',
    director: '克里斯托弗·诺兰',
    releaseDate: '2026-07-17',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 75,
    boxOffice: 0,
    boxOfficeRank: 0,
    socialHeat: 'high',
    socialMentions: 4800000,
    trendingPeriod: '2026.07 (即将上映)',
    lastUpdated: '2026-06-24',
    visualStyle: 'IMAX胶片·时间结构叙事',
    styleKeywords: ['IMAX', '胶片', '时间结构', '谍战', '实拍'],
    signatureScenes: ['待上映'],
    iconicQuotes: ['时间是最伟大的导演'],
    styleDNA: { colorTemperature: 'cool', saturation: 'low', contrast: 'high', compositionType: 'symmetric', lightingType: 'dramatic', scale: 'monumental', pace: 'dynamic', texture: 'grainy' },
    colors: { primary: '#6a8caf', secondary: '#9db4c0', accent: '#c9b458', bg: '#1a2332', text: '#e8e0c8', textLight: '#b8a878' },
    matchedDirectorIds: ['nolan'],
    matchScores: { nolan: 0.95, kurosawa: 0.60, coppola: 0.55 },
    stylePrompt: 'IMAX film aesthetic, Christopher Nolan style, cool desaturated tones, high contrast, dramatic lighting, monumental scale, time-bending narrative, gritty film texture',
    negativePrompt: 'bright colors, cartoon, warm tones, flat lighting',
    fontFamily: "'Noto Serif SC', serif",
    titleWeight: 900,
    status: 'upcoming',
    featured: false,
    approved: true
  },
  {
    id: 'wandering-earth3-2026',
    title: '流浪地球3',
    enTitle: 'The Wandering Earth 3',
    director: '郭帆',
    releaseDate: '2026-02-07',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 72,
    boxOffice: 5200000000,
    boxOfficeRank: 5,
    socialHeat: 'medium',
    socialMentions: 3600000,
    trendingPeriod: '2026.02 - 2026.05',
    lastUpdated: '2026-06-24',
    visualStyle: '重工业科幻·地下城',
    styleKeywords: ['重工业', '科幻', '地下城', '硬核', '中国'],
    signatureScenes: ['太阳氦闪危机', '地下城实景'],
    iconicQuotes: ['道路千万条，安全第一条', '希望是这个时代像钻石一样珍贵的东西'],
    styleDNA: { colorTemperature: 'cool', saturation: 'low', contrast: 'high', compositionType: 'symmetric', lightingType: 'dramatic', scale: 'monumental', pace: 'dynamic', texture: 'grainy' },
    colors: { primary: '#3a5a8a', secondary: '#1a2a3a', accent: '#ff6b35', bg: '#0a0f1a', text: '#c8d0d8', textLight: '#8a9098' },
    matchedDirectorIds: ['nolan', 'kurosawa'],
    matchScores: { nolan: 0.82, kurosawa: 0.65, chazelle: 0.50 },
    stylePrompt: 'Heavy industrial sci-fi, underground city, cool blue steel tones, high contrast, dramatic lighting, monumental machinery, gritty texture, Chinese hard sci-fi',
    negativePrompt: 'bright colors, cartoon, fantasy, warm tones',
    fontFamily: "'Noto Sans SC', sans-serif",
    titleWeight: 800,
    status: 'active',
    featured: false,
    approved: true
  },
  {
    id: 'fengshen3-2026',
    title: '封神第三部',
    enTitle: 'Creation of the Gods III',
    director: '乌尔善',
    releaseDate: '2026-07-01',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 68,
    boxOffice: 0,
    boxOfficeRank: 0,
    socialHeat: 'medium',
    socialMentions: 2800000,
    trendingPeriod: '2026.07 (即将上映)',
    lastUpdated: '2026-06-24',
    visualStyle: '中国神话史诗·神仙大战',
    styleKeywords: ['神话', '史诗', '神仙', '战争', '东方'],
    signatureScenes: ['诛仙阵神话奇观', '姬发与殷郊宿命对决'],
    iconicQuotes: ['天命不可违', '封神榜上，皆有定数'],
    styleDNA: { colorTemperature: 'warm', saturation: 'high', contrast: 'high', compositionType: 'symmetric', lightingType: 'dramatic', scale: 'monumental', pace: 'dynamic', texture: 'painterly' },
    colors: { primary: '#8b0000', secondary: '#2c0a0a', accent: '#ffd700', bg: '#1a0505', text: '#f0e0c0', textLight: '#c9a96e' },
    matchedDirectorIds: ['kurosawa', 'lee'],
    matchScores: { kurosawa: 0.85, lee: 0.72, miyazaki: 0.60 },
    stylePrompt: 'Chinese mythology epic, gods warfare, warm red and gold tones, high saturation, dramatic lighting, monumental scale, painterly texture, oriental fantasy',
    negativePrompt: 'western fantasy, cartoon, modern city, flat lighting',
    fontFamily: "'Noto Serif SC', serif",
    titleWeight: 900,
    status: 'upcoming',
    featured: false,
    approved: true
  },
  {
    id: 'tron-ares-2026',
    title: '创：战神',
    enTitle: 'Tron: Ares',
    director: '约阿希姆·罗宁',
    releaseDate: '2026-05-23',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 62,
    boxOffice: 35000000,
    boxOfficeRank: 8,
    socialHeat: 'medium',
    socialMentions: 1900000,
    trendingPeriod: '2026.05 - 2026.06',
    lastUpdated: '2026-06-24',
    visualStyle: '赛博朋克·电子网格美学',
    styleKeywords: ['赛博朋克', '霓虹', '电子', '网格', '数字世界'],
    signatureScenes: ['数字世界穿越', '霓虹光效对决'],
    iconicQuotes: ['在网格之中，一切皆有可能'],
    styleDNA: { colorTemperature: 'cool', saturation: 'high', contrast: 'high', compositionType: 'asymmetric', lightingType: 'low-key', scale: 'medium', pace: 'dynamic', texture: 'digital' },
    colors: { primary: '#00ffff', secondary: '#ff00ff', accent: '#00ff00', bg: '#0a0a1a', text: '#e0e0ff', textLight: '#8080a0' },
    matchedDirectorIds: ['wkw', 'chazelle'],
    matchScores: { wkw: 0.78, chazelle: 0.70, nolan: 0.65 },
    stylePrompt: 'Cyberpunk electronic grid aesthetic, neon light effects, digital world, cool cyan and magenta tones, high contrast, low-key lighting, digital texture, futuristic',
    negativePrompt: 'natural, warm tones, organic, film grain, vintage',
    fontFamily: "'Noto Sans SC', sans-serif",
    titleWeight: 700,
    status: 'active',
    featured: false,
    approved: true
  },
  {
    id: 'moon-base-2026',
    title: '月球基地',
    enTitle: 'Moon Base',
    director: '待定',
    releaseDate: '2026-07-15',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 55,
    boxOffice: 0,
    boxOfficeRank: 0,
    socialHeat: 'rising',
    socialMentions: 950000,
    trendingPeriod: '2026.07 (即将上映)',
    lastUpdated: '2026-06-24',
    visualStyle: '近未来写实科幻',
    styleKeywords: ['月球', '近未来', '写实', '救援', '太空'],
    signatureScenes: ['30天极限救援', '太空碎片隔绝地球与月球'],
    iconicQuotes: ['回家，是最远的旅程'],
    styleDNA: { colorTemperature: 'cool', saturation: 'low', contrast: 'medium', compositionType: 'asymmetric', lightingType: 'natural', scale: 'monumental', pace: 'static', texture: 'smooth' },
    colors: { primary: '#a0a0b0', secondary: '#2a2a3a', accent: '#4a90d9', bg: '#0a0a14', text: '#d0d0e0', textLight: '#9090a0' },
    matchedDirectorIds: ['nolan', 'jia'],
    matchScores: { nolan: 0.72, jia: 0.65, coppola: 0.55 },
    stylePrompt: 'Near-future realistic sci-fi, lunar base, cool gray tones, low saturation, natural lighting, monumental space, smooth texture, isolation atmosphere',
    negativePrompt: 'fantasy, bright colors, cartoon, warm tones',
    fontFamily: "'Noto Sans SC', sans-serif",
    titleWeight: 700,
    status: 'upcoming',
    featured: false,
    approved: true
  },
  {
    id: 'oppenheimer-2023',
    title: '奥本海默',
    enTitle: 'Oppenheimer',
    director: '克里斯托弗·诺兰',
    releaseDate: '2023-07-21',
    posterUrl: '',
    backdropUrl: '',
    heatScore: 58,
    boxOffice: 9500000000,
    boxOfficeRank: 6,
    socialHeat: 'medium',
    socialMentions: 1500000,
    trendingPeriod: '2023.07 - 2024.03',
    lastUpdated: '2026-06-24',
    visualStyle: 'IMAX胶片·历史传记',
    styleKeywords: ['IMAX', '胶片', '历史', '传记', '核爆'],
    signatureScenes: ['三位一体核爆试验', '奥本海默听证会'],
    iconicQuotes: ['我成了死神，世界的毁灭者', '我们是否做过原子弹该做的事'],
    styleDNA: { colorTemperature: 'warm', saturation: 'low', contrast: 'high', compositionType: 'centered', lightingType: 'dramatic', scale: 'monumental', pace: 'static', texture: 'grainy' },
    colors: { primary: '#c9a45c', secondary: '#1a1a0a', accent: '#ff4500', bg: '#0f0a05', text: '#e8d5b7', textLight: '#b8a878' },
    matchedDirectorIds: ['nolan', 'coppola'],
    matchScores: { nolan: 0.92, coppola: 0.68, kurosawa: 0.60 },
    stylePrompt: 'IMAX film biographic aesthetic, Christopher Nolan style, warm desaturated tones, high contrast, dramatic lighting, monumental scale, gritty film texture, historical drama',
    negativePrompt: 'cartoon, bright colors, fantasy, modern UI',
    fontFamily: "'Noto Serif SC', serif",
    titleWeight: 900,
    status: 'archived',
    featured: false,
    approved: true
  }
];

// 导出
window.MOVIE_DATA = {
  FALLBACK_MOVIES,
  HEAT_LEVELS,
  getHeatLevel
};
```

- [ ] **Step 2: 在 index.html 中引入 movie-data.js**

在 `index.html` 的 Scripts 区域，在 `data.js` 之后、`app.js` 之前添加：

```html
<script src="js/data.js?v=20260623a"></script>
<script src="js/movie-data.js?v=20260623a"></script>
<script src="js/ai-client.js?v=20260623a"></script>
<script src="js/poster-engine.js?v=20260623a"></script>
<script src="js/movie-module.js?v=20260623a"></script>
<script src="js/app.js?v=20260623a"></script>
```

- [ ] **Step 3: 验证数据加载**

在浏览器控制台执行：
```js
console.log(MOVIE_DATA.FALLBACK_MOVIES.length, MOVIE_DATA.getHeatLevel(95))
```
预期输出：`10 "explosive"`

- [ ] **Step 4: 提交**

```bash
git add js/movie-data.js index.html
git commit -m "feat: add movie data layer with 10 fallback movies"
```

---

## Task 2: 后端热度追踪模块

**Files:**
- Create: `server/movie-tracker.js`
- Create: `server/data/movies.json`

- [ ] **Step 1: 创建 movies.json 种子数据**

```json
{
  "movies": [],
  "lastFetch": null,
  "pendingReview": []
}
```

- [ ] **Step 2: 创建 movie-tracker.js**

```js
/**
 * 造境 ZaoJing — 热门电影热度追踪模块
 * 从 TMDB API 获取热门电影数据，计算热度分数，支持管理员审核
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 读取本地数据
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { movies: [], lastFetch: null, pendingReview: [] };
  }
}

// 保存本地数据
function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[movie-tracker] 保存数据失败:', e.message);
  }
}

// 从 TMDB 获取本周热门电影
async function fetchTrendingMovies() {
  if (!TMDB_API_KEY) {
    console.warn('[movie-tracker] TMDB_API_KEY 未配置，跳过抓取');
    return [];
  }

  try {
    const url = `${TMDB_BASE}/trending/movie/week?api_key=${TMDB_API_KEY}&language=zh-CN`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`TMDB API 返回 ${resp.status}`);
    const data = await resp.json();
    return data.results || [];
  } catch (e) {
    console.error('[movie-tracker] TMDB 抓取失败:', e.message);
    return [];
  }
}

// 获取电影详情（含票房）
async function fetchMovieDetail(tmdbId) {
  if (!TMDB_API_KEY) return null;
  try {
    const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=zh-CN&append_to_response=images`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    console.error(`[movie-tracker] 获取电影 ${tmdbId} 详情失败:`, e.message);
    return null;
  }
}

// 计算热度分数 (0-100)
function calculateHeatScore(movie) {
  // 票房分数 (40%)
  const boxOffice = movie.revenue || 0;
  const boxScore = boxOffice > 0
    ? Math.min(100, Math.log10(boxOffice / 1000000) * 12)
    : 0;

  // 社交热度 (30%) - 基于 TMDB popularity
  const popularity = movie.popularity || 0;
  const socialScore = Math.min(100, popularity * 2);

  // 时效性 (20%)
  let recencyScore = 0;
  if (movie.release_date) {
    const releaseDate = new Date(movie.release_date);
    const daysSince = (Date.now() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 0) {
      recencyScore = 80; // 即将上映
    } else if (daysSince < 30) {
      recencyScore = 100;
    } else if (daysSince < 90) {
      recencyScore = 70;
    } else if (daysSince < 180) {
      recencyScore = 40;
    } else {
      recencyScore = 10;
    }
  }

  // 上座率 (10%) - TMDB vote_average 作为代理
  const voteScore = (movie.vote_average || 0) * 10;

  return Math.round(boxScore * 0.4 + socialScore * 0.3 + recencyScore * 0.2 + voteScore * 0.1);
}

// 将 TMDB 电影转换为内部格式
function convertTmdbMovie(tmdbMovie, detail) {
  const heatScore = calculateHeatScore({ ...tmdbMovie, ...detail });
  const posterUrl = tmdbMovie.poster_path
    ? `${TMDB_IMG_BASE}/w500${tmdbMovie.poster_path}`
    : '';
  const backdropUrl = tmdbMovie.backdrop_path
    ? `${TMDB_IMG_BASE}/original${tmdbMovie.backdrop_path}`
    : '';

  return {
    id: `tmdb-${tmdbMovie.id}`,
    title: tmdbMovie.title || tmdbMovie.original_title || '',
    enTitle: tmdbMovie.original_title || '',
    director: detail && detail.crew ? (detail.crew.find(c => c.job === 'Director') || {}).name || '未知' : '未知',
    releaseDate: tmdbMovie.release_date || '',
    posterUrl,
    backdropUrl,
    heatScore,
    boxOffice: detail ? detail.revenue || 0 : 0,
    socialHeat: heatScore >= 90 ? 'explosive' : heatScore >= 70 ? 'high' : heatScore >= 50 ? 'medium' : 'rising',
    socialMentions: Math.round((tmdbMovie.popularity || 0) * 10000),
    trendingPeriod: tmdbMovie.release_date ? tmdbMovie.release_date.substring(0, 7) : '',
    lastUpdated: new Date().toISOString(),
    visualStyle: '',
    styleKeywords: [],
    signatureScenes: [],
    iconicQuotes: [],
    styleDNA: null,  // 需要后续 analyzeMovieDNA 填充
    colors: null,    // 需要后续 analyzeMovieDNA 填充
    matchedDirectorIds: [],
    matchScores: {},
    stylePrompt: '',
    negativePrompt: 'low quality, blurry, text, watermark, deformed',
    fontFamily: "'Noto Serif SC', serif",
    titleWeight: 800,
    status: tmdbMovie.release_date && new Date(tmdbMovie.release_date) > new Date() ? 'upcoming' : 'active',
    featured: false,
    approved: false  // 新抓取的需要管理员审核
  };
}

// 执行一次完整的热度数据刷新
async function refreshMovies() {
  console.log('[movie-tracker] 开始刷新热门电影数据...');
  const data = loadData();

  const trending = await fetchTrendingMovies();
  if (trending.length === 0) {
    console.warn('[movie-tracker] 未获取到热门电影数据');
    return { fetched: 0, pending: data.pendingReview.length };
  }

  // 取前 20 部
  const topMovies = trending.slice(0, 20);
  const newMovies = [];

  for (const tmdbMovie of topMovies) {
    const detail = await fetchMovieDetail(tmdbMovie.id);
    const movie = convertTmdbMovie(tmdbMovie, detail);
    newMovies.push(movie);
  }

  // 合并：保留已审核的旧数据，添加新抓取的待审核数据
  const approvedIds = new Set(data.movies.map(m => m.id));
  const newPending = newMovies.filter(m => !approvedIds.has(m.id));

  data.pendingReview = [...data.pendingReview, ...newPending];
  data.lastFetch = new Date().toISOString();
  saveData(data);

  console.log(`[movie-tracker] 刷新完成: 获取 ${newMovies.length} 部, 新增待审核 ${newPending.length} 部`);
  return { fetched: newMovies.length, pending: data.pendingReview.length };
}

// 获取已审核的电影列表
function getApprovedMovies() {
  const data = loadData();
  return data.movies;
}

// 获取待审核的电影列表
function getPendingMovies() {
  const data = loadData();
  return data.pendingReview;
}

// 管理员审核通过
function approveMovie(movieId, overrides) {
  const data = loadData();
  const idx = data.pendingReview.findIndex(m => m.id === movieId);
  if (idx === -1) return null;

  const movie = data.pendingReview[idx];
  const finalMovie = overrides ? { ...movie, ...overrides } : movie;
  finalMovie.approved = true;
  finalMovie.approvedAt = new Date().toISOString();

  data.pendingReview.splice(idx, 1);
  data.movies.unshift(finalMovie);

  // 保留最多 30 部已审核电影
  if (data.movies.length > 30) {
    data.movies = data.movies.slice(0, 30);
  }

  saveData(data);
  return finalMovie;
}

// 管理员拒绝
function rejectMovie(movieId) {
  const data = loadData();
  data.pendingReview = data.pendingReview.filter(m => m.id !== movieId);
  saveData(data);
  return true;
}

// 更新电影数据（如 DNA 分析结果）
function updateMovie(movieId, updates) {
  const data = loadData();
  const movie = data.movies.find(m => m.id === movieId);
  if (!movie) return null;
  Object.assign(movie, updates);
  saveData(data);
  return movie;
}

// 获取排行榜
function getRanking() {
  const data = loadData();
  const movies = data.movies;

  const boxOfficeRank = [...movies]
    .filter(m => m.boxOffice > 0)
    .sort((a, b) => b.boxOffice - a.boxOffice)
    .slice(0, 10)
    .map((m, i) => ({ rank: i + 1, id: m.id, title: m.title, value: m.boxOffice, unit: '元' }));

  const socialRank = [...movies]
    .sort((a, b) => b.socialMentions - a.socialMentions)
    .slice(0, 10)
    .map((m, i) => ({ rank: i + 1, id: m.id, title: m.title, value: m.socialMentions, unit: '次' }));

  return { boxOfficeRank, socialRank };
}

module.exports = {
  refreshMovies,
  getApprovedMovies,
  getPendingMovies,
  approveMovie,
  rejectMovie,
  updateMovie,
  getRanking,
  loadData
};
```

- [ ] **Step 3: 验证模块加载**

```bash
cd /sessions/6a34f4e24a12d4bb62851742/workspace/zaojing-mvp && node -e "const mt = require('./server/movie-tracker'); console.log('approved:', mt.getApprovedMovies().length, 'pending:', mt.getPendingMovies().length, 'ranking:', JSON.stringify(mt.getRanking()).substring(0, 80))"
```
预期输出：`approved: 0 pending: 0 ranking: {"boxOfficeRank":[],"socialRank":[]}`

- [ ] **Step 4: 提交**

```bash
git add server/movie-tracker.js server/data/movies.json
git commit -m "feat: add movie tracker backend with TMDB integration"
```

---

## Task 3: 后端 API 路由

**Files:**
- Modify: `server/server.js`

- [ ] **Step 1: 在 server.js 中引入 movie-tracker 并添加路由**

在 `server.js` 文件顶部 `const aiService = require(...)` 之后添加：

```js
const movieTracker = require('./movie-tracker');
```

在现有路由区域末尾（最后一个 `app.` 路由之后）添加：

```js
// ========== 热门电影 API ==========

// 获取已审核的热门电影列表
app.get('/api/movies', (req, res) => {
  try {
    const movies = movieTracker.getApprovedMovies();
    if (movies.length === 0) {
      return res.json({ movies: [], fallback: true, message: '使用本地数据' });
    }
    res.json({ movies, fallback: false });
  } catch (error) {
    console.error('[电影列表错误]', error.message);
    res.status(500).json({ error: '获取电影列表失败' });
  }
});

// 获取电影详情
app.get('/api/movies/:id', (req, res) => {
  try {
    const movies = movieTracker.getApprovedMovies();
    const movie = movies.find(m => m.id === req.params.id);
    if (!movie) {
      return res.status(404).json({ error: '电影不存在' });
    }
    res.json(movie);
  } catch (error) {
    console.error('[电影详情错误]', error.message);
    res.status(500).json({ error: '获取电影详情失败' });
  }
});

// 获取热度排行榜
app.get('/api/movies/ranking', (req, res) => {
  try {
    const ranking = movieTracker.getRanking();
    res.json(ranking);
  } catch (error) {
    console.error('[排行榜错误]', error.message);
    res.status(500).json({ error: '获取排行榜失败' });
  }
});

// 触发电影风格 DNA 分析
app.post('/api/movies/:id/analyze-dna', apiRateLimit, async (req, res) => {
  try {
    const { id } = req.params;
    const movies = movieTracker.getApprovedMovies();
    const movie = movies.find(m => m.id === id);
    if (!movie) {
      return res.status(404).json({ error: '电影不存在' });
    }

    // 如果已有 DNA 数据，直接返回
    if (movie.styleDNA && movie.colors) {
      return res.json({ styleDNA: movie.styleDNA, colors: movie.colors, cached: true });
    }

    // 调用 AI 分析
    const result = await aiService.analyzeMovieDNA(movie);
    movieTracker.updateMovie(id, result);
    res.json({ ...result, cached: false });
  } catch (error) {
    console.error('[DNA分析错误]', error.message);
    res.status(500).json({ error: 'DNA分析失败，请稍后重试' });
  }
});

// 管理员：审核通过
app.post('/api/admin/movies/:id/approve', (req, res) => {
  try {
    const movie = movieTracker.approveMovie(req.params.id, req.body);
    if (!movie) {
      return res.status(404).json({ error: '待审核电影不存在' });
    }
    res.json(movie);
  } catch (error) {
    console.error('[审核错误]', error.message);
    res.status(500).json({ error: '审核操作失败' });
  }
});

// 管理员：拒绝
app.post('/api/admin/movies/:id/reject', (req, res) => {
  try {
    movieTracker.rejectMovie(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('[拒绝错误]', error.message);
    res.status(500).json({ error: '操作失败' });
  }
});

// 管理员：手动刷新热度数据
app.post('/api/admin/movies/refresh', async (req, res) => {
  try {
    const result = await movieTracker.refreshMovies();
    res.json(result);
  } catch (error) {
    console.error('[刷新错误]', error.message);
    res.status(500).json({ error: '刷新失败' });
  }
});
```

- [ ] **Step 2: 验证路由**

重启服务器后执行：
```bash
curl -s http://localhost:8127/api/movies | head -c 100
```
预期输出：`{"movies":[],"fallback":true,"message":"使用本地数据"}`

```bash
curl -s http://localhost:8127/api/movies/ranking
```
预期输出：`{"boxOfficeRank":[],"socialRank":[]}`

- [ ] **Step 3: 提交**

```bash
git add server/server.js
git commit -m "feat: add movie API routes (list, detail, ranking, DNA, admin)"
```

---

## Task 4: AI 服务 — 电影 DNA 分析

**Files:**
- Modify: `server/ai-service.js`

- [ ] **Step 1: 在 ai-service.js 中添加 analyzeMovieDNA 函数**

在 `module.exports` 之前添加：

```js
// ========== 电影风格 DNA 分析 ==========

async function analyzeMovieDNA(movie) {
  const volcKey = process.env.VOLCENGINE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // 无 API Key 时使用本地降级方案
  if (!volcKey && !openaiKey) {
    console.warn('[DNA分析] 无 AI API Key，使用本地降级');
    return localMovieDNA(movie);
  }

  try {
    // 1. 获取电影剧照
    let stills = [];
    if (movie.backdropUrl) {
      stills.push(movie.backdropUrl);
    }
    // 尝试从 TMDB 获取更多剧照
    if (movie.id.startsWith('tmdb-')) {
      const tmdbId = movie.id.replace('tmdb-', '');
      const tmdbStills = await searchTMDBImagesById(tmdbId);
      stills = [...stills, ...tmdbStills].slice(0, 5);
    }

    if (stills.length === 0) {
      console.warn('[DNA分析] 无剧照可用，使用本地降级');
      return localMovieDNA(movie);
    }

    // 2. 对每张剧照调用 Vision API 分析
    const dnaResults = [];
    const colorResults = [];

    for (const stillUrl of stills) {
      try {
        const base64 = await imageUrlToBase64(stillUrl);
        const result = await callVisionLLM(
          `Analyze this movie still and extract its visual style DNA. Return JSON with:
1. "styleDNA": object with 8 keys: colorTemperature (warm|cool|neutral), saturation (low|medium|high), contrast (low|medium|high), compositionType (symmetric|asymmetric|centered|dynamic), lightingType (natural|dramatic|low-key|high-key), scale (intimate|medium|monumental), pace (static|dynamic), texture (smooth|grainy|digital|painterly|handdrawn)
2. "colors": object with 6 keys: primary, secondary, accent, bg, text, textLight (all hex values)

Movie: ${movie.title} (${movie.enTitle})
Style description: ${movie.visualStyle || 'unknown'}`,
          base64
        );
        const parsed = JSON.parse(result);
        if (parsed.styleDNA) dnaResults.push(parsed.styleDNA);
        if (parsed.colors) colorResults.push(parsed.colors);
      } catch (e) {
        console.warn(`[DNA分析] 剧照分析失败:`, e.message);
      }
    }

    if (dnaResults.length === 0) {
      return localMovieDNA(movie);
    }

    // 3. 合并 DNA（取众数）
    const mergedDNA = mergeDNA(dnaResults);

    // 4. 合并颜色（取第一个有效结果）
    const mergedColors = colorResults[0] || extractColorsFromStyle(mergedDNA);

    // 5. 与 12 导演计算相似度
    const matchScores = {};
    for (const director of DIRECTORS || []) {
      if (director.styleDNA) {
        const score = calculateDNASimilarityLocal(mergedDNA, director.styleDNA);
        matchScores[director.id] = score;
      }
    }

    const sortedMatches = Object.entries(matchScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const matchedDirectorIds = sortedMatches.map(([id]) => id);
    const topMatchScores = {};
    sortedMatches.forEach(([id, score]) => { topMatchScores[id] = Math.round(score * 100) / 100; });

    // 6. 生成 stylePrompt
    const stylePrompt = generateMoviePrompt(mergedDNA, movie);

    return {
      styleDNA: mergedDNA,
      colors: mergedColors,
      matchedDirectorIds,
      matchScores: topMatchScores,
      stylePrompt,
      analyzedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('[DNA分析] 失败:', error.message);
    return localMovieDNA(movie);
  }
}

// 本地降级：根据电影标题/风格关键词推断 DNA
function localMovieDNA(movie) {
  // 尝试从 matchedDirectorIds 中借用 DNA
  if (movie.matchedDirectorIds && movie.matchedDirectorIds.length > 0) {
    const director = (DIRECTORS || []).find(d => d.id === movie.matchedDirectorIds[0]);
    if (director && director.styleDNA) {
      return {
        styleDNA: { ...director.styleDNA },
        colors: movie.colors || { ...director.colors },
        matchedDirectorIds: movie.matchedDirectorIds,
        matchScores: movie.matchScores || {},
        stylePrompt: movie.stylePrompt || director.promptCore,
        analyzedAt: new Date().toISOString(),
        fallback: true
      };
    }
  }

  // 默认 DNA
  return {
    styleDNA: { colorTemperature: 'neutral', saturation: 'medium', contrast: 'medium', compositionType: 'centered', lightingType: 'natural', scale: 'medium', pace: 'static', texture: 'smooth' },
    colors: { primary: '#6a8caf', secondary: '#9db4c0', accent: '#c9b458', bg: '#1a2332', text: '#e8e0c8', textLight: '#b8a878' },
    matchedDirectorIds: [],
    matchScores: {},
    stylePrompt: movie.stylePrompt || 'cinematic film still, dramatic lighting, professional composition',
    analyzedAt: new Date().toISOString(),
    fallback: true
  };
}

// 合并多个 DNA 结果（取众数）
function mergeDNA(dnaList) {
  const keys = ['colorTemperature', 'saturation', 'contrast', 'compositionType', 'lightingType', 'scale', 'pace', 'texture'];
  const result = {};
  for (const key of keys) {
    const counts = {};
    for (const dna of dnaList) {
      const val = dna[key];
      if (val) counts[val] = (counts[val] || 0) + 1;
    }
    result[key] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'medium';
  }
  return result;
}

// 根据 DNA 生成电影风格 prompt
function generateMoviePrompt(dna, movie) {
  const parts = [];
  parts.push(dna.colorTemperature === 'warm' ? 'warm color palette' : dna.colorTemperature === 'cool' ? 'cool color palette' : 'neutral color palette');
  parts.push(dna.saturation === 'high' ? 'high saturation' : dna.saturation === 'low' ? 'low saturation' : 'medium saturation');
  parts.push(dna.contrast === 'high' ? 'high contrast' : dna.contrast === 'low' ? 'low contrast' : 'medium contrast');
  parts.push(dna.lightingType === 'dramatic' ? 'dramatic lighting' : dna.lightingType === 'low-key' ? 'low-key lighting' : dna.lightingType === 'high-key' ? 'high-key lighting' : 'natural lighting');
  parts.push(dna.scale === 'monumental' ? 'monumental scale' : dna.scale === 'intimate' ? 'intimate scale' : 'medium scale');
  parts.push(dna.compositionType === 'symmetric' ? 'symmetric composition' : dna.compositionType === 'dynamic' ? 'dynamic composition' : dna.compositionType === 'centered' ? 'centered composition' : 'asymmetric composition');
  if (movie.visualStyle) parts.push(movie.visualStyle);
  if (movie.styleKeywords && movie.styleKeywords.length > 0) parts.push(movie.styleKeywords.join(', '));
  return parts.join(', ') + ', cinematic film still, professional cinematography';
}

// 本地 DNA 相似度计算（与 data.js 中的 calculateDNASimilarity 同逻辑）
function calculateDNASimilarityLocal(dnaA, dnaB) {
  const keys = ['colorTemperature', 'saturation', 'contrast', 'compositionType', 'lightingType', 'scale', 'pace', 'texture'];
  let matches = 0;
  for (const key of keys) {
    if (dnaA[key] === dnaB[key]) matches++;
  }
  return matches / keys.length;
}

// 从 DNA 推断默认色彩
function extractColorsFromStyle(dna) {
  if (dna.colorTemperature === 'warm') {
    return { primary: '#c9a45c', secondary: '#3a2a1a', accent: '#ff6b35', bg: '#1a0f05', text: '#f0e0c0', textLight: '#c9a96e' };
  } else if (dna.colorTemperature === 'cool') {
    return { primary: '#6a8caf', secondary: '#1a2a3a', accent: '#4a90d9', bg: '#0a0f1a', text: '#d0d8e0', textLight: '#8a9098' };
  }
  return { primary: '#8a8a8a', secondary: '#2a2a2a', accent: '#c0c0c0', bg: '#0a0a0a', text: '#e0e0e0', textLight: '#a0a0a0' };
}

// 通过 TMDB ID 获取电影剧照
async function searchTMDBImagesById(tmdbId) {
  if (!process.env.TMDB_API_KEY) return [];
  try {
    const url = `https://api.themoviedb.org/3/movie/${tmdbId}/images?api_key=${process.env.TMDB_API_KEY}&include_image_language=en,null`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    const backdrops = (data.backdrops || []).slice(0, 4);
    return backdrops.map(b => `https://image.tmdb.org/t/p/original${b.file_path}`);
  } catch (e) {
    console.warn('[DNA分析] TMDB 剧照获取失败:', e.message);
    return [];
  }
}

// 将图片 URL 转为 base64
async function imageUrlToBase64(url) {
  const resp = await fetch(url);
  const buffer = await resp.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
```

- [ ] **Step 2: 在 module.exports 中添加 analyzeMovieDNA**

将 `module.exports` 修改为包含 `analyzeMovieDNA`：

```js
module.exports = {
  analyzeEmotion,
  generateImage,
  generateCopy,
  agentCreate,
  analyzeImage,
  savePoster,
  getGallery,
  deletePoster,
  getReference,
  parseCustomStyle,
  analyzeMovieStyle,
  analyzeMovieDNA,
  blendStyles,
  recommendStyleByEmotion,
  searchTMDBImages,
  callLLM,
  callVisionLLM,
  DIRECTOR_PROMPTS,
  DIRECTOR_REFERENCES,
  EMOTION_TO_DNA
};
```

- [ ] **Step 3: 验证语法**

```bash
node --check /sessions/6a34f4e24a12d4bb62851742/workspace/zaojing-mvp/server/ai-service.js
```
预期：无输出（语法正确）

- [ ] **Step 4: 提交**

```bash
git add server/ai-service.js
git commit -m "feat: add analyzeMovieDNA function with Vision API + local fallback"
```

---

## Task 5: PosterEngine 扩展 — 支持 movieId

**Files:**
- Modify: `js/poster-engine.js`

- [ ] **Step 1: 修改 generate 函数支持 movieId 参数**

在 `generate` 函数中，将参数解构和导演查找部分修改为：

找到这段代码（约 1339-1353 行）：
```js
  async function generate(options) {
    const {
      text,
      directorId,
      moodTagId,
      format = 'vertical',
      showQuote = true,
      title: customTitle,
      quote: customQuote,
      quoteIndex,
      aiImageUrl,
      emotion
    } = options;

    const director = DIRECTORS.find(d => d.id === directorId) || DIRECTORS[0];
```

替换为：
```js
  async function generate(options) {
    const {
      text,
      directorId,
      movieId,              // 新增：电影 ID
      moodTagId,
      format = 'vertical',
      showQuote = true,
      title: customTitle,
      quote: customQuote,
      quoteIndex,
      aiImageUrl,
      emotion
    } = options;

    // 优先使用电影风格，其次导演风格
    let styleSource;
    if (movieId && window.MOVIE_DATA) {
      const movie = window.MOVIE_DATA.FALLBACK_MOVIES.find(m => m.id === movieId)
        || (window._serverMovies || []).find(m => m.id === movieId);
      if (movie) {
        styleSource = {
          id: movie.id,
          name: movie.title,
          colors: movie.colors,
          styleDNA: movie.styleDNA,
          fontFamily: movie.fontFamily || "'Noto Serif SC', serif",
          titleWeight: movie.titleWeight || 800,
          promptCore: movie.stylePrompt,
          quotes: movie.iconicQuotes || [],
          isMovie: true,
          movieRef: { id: movie.id, title: movie.title, posterUrl: movie.posterUrl, styleDNA: movie.styleDNA }
        };
      }
    }
    if (!styleSource) {
      const director = DIRECTORS.find(d => d.id === directorId) || DIRECTORS[0];
      styleSource = director;
    }
```

- [ ] **Step 2: 修改背景渲染逻辑**

找到背景渲染部分（约 1366-1380 行）：
```js
    // 1. 绘制背景（AI 生图 或 Canvas 风格）
    if (aiImageUrl) {
      try {
        const img = await loadImage(aiImageUrl);
        drawAIBackground(ctx, img, width, height);
      } catch (e) {
        console.warn('AI 图片加载失败，降级为 Canvas 背景:', e.message);
        const bgRenderer = bgRenderers[directorId];
        if (bgRenderer) { bgRenderer(ctx, width, height); }
        else { drawCustomBg(ctx, width, height, director.colors); }
      }
    } else {
      const bgRenderer = bgRenderers[directorId];
      if (bgRenderer) { bgRenderer(ctx, width, height); }
      else { drawCustomBg(ctx, width, height, director.colors); }
    }
```

替换为：
```js
    // 1. 绘制背景（AI 生图 或 Canvas 风格）
    if (aiImageUrl) {
      try {
        const img = await loadImage(aiImageUrl);
        drawAIBackground(ctx, img, width, height);
      } catch (e) {
        console.warn('AI 图片加载失败，降级为 Canvas 背景:', e.message);
        if (styleSource.isMovie) {
          drawCustomBg(ctx, width, height, styleSource.colors);
        } else {
          const bgRenderer = bgRenderers[styleSource.id];
          if (bgRenderer) { bgRenderer(ctx, width, height); }
          else { drawCustomBg(ctx, width, height, styleSource.colors); }
        }
      }
    } else {
      if (styleSource.isMovie) {
        drawCustomBg(ctx, width, height, styleSource.colors);
      } else {
        const bgRenderer = bgRenderers[styleSource.id];
        if (bgRenderer) { bgRenderer(ctx, width, height); }
        else { drawCustomBg(ctx, width, height, styleSource.colors); }
      }
    }
```

- [ ] **Step 3: 修改文字层和返回值**

找到文字层绘制部分（约 1389-1409 行）：
```js
    // 4. 绘制文字层
    const title = customTitle || extractTitle(text, moodTagId);
    let quote = '';
    if (showQuote) {
      if (customQuote) {
        quote = customQuote;
      } else if (typeof quoteIndex === 'number') {
        quote = getQuoteByIndex(directorId, quoteIndex);
      } else {
        quote = getRandomQuote(directorId);
      }
    }

    drawTextLayer(ctx, width, height, {
      title,
      quote,
      directorName: director.name,
      colors: director.colors,
      format,
      fontFamily: director.fontFamily,
      titleWeight: director.titleWeight
    });
```

替换为：
```js
    // 4. 绘制文字层
    const title = customTitle || extractTitle(text, moodTagId);
    let quote = '';
    if (showQuote) {
      if (customQuote) {
        quote = customQuote;
      } else if (styleSource.isMovie && styleSource.quotes && styleSource.quotes.length > 0) {
        // 电影金句
        quote = styleSource.quotes[Math.floor(Math.random() * styleSource.quotes.length)];
      } else if (typeof quoteIndex === 'number') {
        quote = getQuoteByIndex(styleSource.id, quoteIndex);
      } else {
        quote = getRandomQuote(styleSource.id);
      }
    }

    drawTextLayer(ctx, width, height, {
      title,
      quote,
      directorName: styleSource.name,
      colors: styleSource.colors,
      format,
      fontFamily: styleSource.fontFamily,
      titleWeight: styleSource.titleWeight
    });
```

找到返回值部分（约 1414-1424 行）：
```js
    return {
      dataUrl,
      title,
      quote,
      director: director.name,
      directorId: director.id,
      format: formatConfig.label,
      width,
      height,
      usedAI: !!aiImageUrl
    };
```

替换为：
```js
    return {
      dataUrl,
      title,
      quote,
      director: styleSource.name,
      directorId: styleSource.id,
      format: formatConfig.label,
      width,
      height,
      usedAI: !!aiImageUrl,
      movieRef: styleSource.movieRef || null
    };
```

- [ ] **Step 4: 验证语法**

```bash
node --check /sessions/6a34f4e24a12d4bb62851742/workspace/zaojing-mvp/js/poster-engine.js
```
预期：无输出

- [ ] **Step 5: 提交**

```bash
git add js/poster-engine.js
git commit -m "feat: extend PosterEngine to support movieId for movie-style posters"
```

---

## Task 6: AI Client 扩展 — 电影 API 方法

**Files:**
- Modify: `js/ai-client.js`

- [ ] **Step 1: 在 ai-client.js 的 IIFE 内添加电影相关方法**

在 `return` 语句之前添加：

```js
  // ========== 热门电影 API ==========

  async function getMovies() {
    const response = await fetch(API_BASE + '/api/movies');
    if (!response.ok) throw new Error('获取电影列表失败');
    return await response.json();
  }

  async function getMovieDetail(movieId) {
    const response = await fetch(API_BASE + '/api/movies/' + movieId);
    if (!response.ok) throw new Error('获取电影详情失败');
    return await response.json();
  }

  async function getMovieRanking() {
    const response = await fetch(API_BASE + '/api/movies/ranking');
    if (!response.ok) throw new Error('获取排行榜失败');
    return await response.json();
  }

  async function analyzeMovieDNA(movieId) {
    const response = await fetch(API_BASE + '/api/movies/' + movieId + '/analyze-dna', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '网络错误' }));
      throw new Error(err.error || 'DNA分析失败');
    }
    return await response.json();
  }

  async function generateMovieImage(options) {
    const { text, stylePrompt, negativePrompt, engine, size } = options;
    const response = await fetch(API_BASE + '/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, directorId: 'movie-custom', stylePrompt, negativePrompt, engine, size })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: '网络错误' }));
      throw new Error(err.error || '图片生成失败');
    }
    const result = await response.json();
    if (result.imageBase64) {
      return { dataUrl: 'data:image/png;base64,' + result.imageBase64, engine: result.engine };
    } else if (result.imageUrl) {
      return { dataUrl: result.imageUrl, engine: result.engine };
    }
    throw new Error('图片生成返回格式异常');
  }
```

- [ ] **Step 2: 在 return 语句中暴露新方法**

找到 `return {` 语句，添加新方法：

```js
  return {
    analyzeEmotion,
    generateImage,
    generateMovieImage,
    generateCopy,
    agentCreate,
    analyzeImage,
    getMovies,
    getMovieDetail,
    getMovieRanking,
    analyzeMovieDNA,
    savePoster,
    getGallery,
    deletePoster,
    getReference,
    parseCustomStyle,
    analyzeMovieStyle,
    blendStyles,
    recommendStyleByEmotion
  };
```

- [ ] **Step 3: 验证语法**

```bash
node --check /sessions/6a34f4e24a12d4bb62851742/workspace/zaojing-mvp/js/ai-client.js
```

- [ ] **Step 4: 提交**

```bash
git add js/ai-client.js
git commit -m "feat: add movie API methods to AIClient"
```

---

## Task 7: HTML 结构 — 电影列表页 + 详情面板

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 在导航栏添加"热门电影"入口**

找到导航栏区域（`<nav class="topbar">` 内部），在 logo 和 spacer 之间添加：

```html
<nav class="topbar" aria-label="主导航">
  <a href="showcase.html" class="nav-back">← 返回展示页</a>
  <div class="logo">造<span>境</span></div>
  <div class="nav-links">
    <button class="nav-link-btn" id="nav-to-movies">🎬 热门电影</button>
  </div>
  <div style="width:80px"></div>
</nav>
```

- [ ] **Step 2: 在输入页底部添加电影入口卡片**

在 `page-input` 的 `page-inner` 末尾，在"多人共创"和"我的电影墙"按钮之前添加：

```html
    <div class="input-actions">
      <button class="btn btn-outline btn-lg" id="btn-to-movies">
        <span class="btn-icon">🎬</span>
        <span>热门电影同风格</span>
        <span class="btn-badge" id="movies-badge">12部热映</span>
      </button>
      <button class="btn btn-outline" id="btn-to-cocreate">🎭 多人共创</button>
      <button class="btn btn-outline" id="btn-to-wall">🖼️ 我的电影墙</button>
    </div>
```

- [ ] **Step 3: 在 `</main>` 之前添加 page-movies 和详情面板**

```html
<!-- ========== 热门电影页 ========== -->
<div class="page" id="page-movies">
  <div class="movies-page-inner">

    <!-- Cinematic Hero -->
    <div class="movies-hero" id="movies-hero">
      <div class="movies-hero-bg" id="movies-hero-bg"></div>
      <div class="movies-hero-content">
        <span class="movies-hero-label">本周冠军</span>
        <h2 class="movies-hero-title" id="movies-hero-title">加载中...</h2>
        <p class="movies-hero-meta" id="movies-hero-meta"></p>
        <div class="movies-hero-heat">
          <div class="heat-bar"><div class="heat-bar-fill" id="movies-hero-heat-bar"></div></div>
          <span class="heat-text" id="movies-hero-heat-text">--</span>
        </div>
        <button class="btn btn-primary btn-lg movies-hero-cta" id="movies-hero-cta">✦ 生成同风格海报 →</button>
      </div>
    </div>

    <!-- 分类 Tab -->
    <div class="movies-tabs">
      <button class="movies-tab active" data-tab="active">正在热映</button>
      <button class="movies-tab" data-tab="upcoming">即将上映</button>
      <button class="movies-tab" data-tab="archived">口碑佳作</button>
    </div>

    <!-- 电影卡片横滑区 -->
    <div class="movies-carousel-wrapper">
      <button class="movies-carousel-btn movies-carousel-prev" id="movies-prev" aria-label="上一部">‹</button>
      <div class="movies-carousel" id="movies-carousel">
        <div class="movies-carousel-empty">加载中...</div>
      </div>
      <button class="movies-carousel-btn movies-carousel-next" id="movies-next" aria-label="下一部">›</button>
    </div>

    <!-- 排行榜 -->
    <div class="movies-rankings">
      <div class="ranking-card">
        <h3 class="ranking-title">🏆 票房榜</h3>
        <ol class="ranking-list" id="ranking-boxoffice"></ol>
      </div>
      <div class="ranking-card">
        <h3 class="ranking-title">💬 讨论榜</h3>
        <ol class="ranking-list" id="ranking-social"></ol>
      </div>
    </div>

    <!-- 返回按钮 -->
    <div class="movies-back">
      <button class="btn btn-outline" id="btn-movies-back">← 返回首页</button>
    </div>
  </div>
</div>

<!-- ========== 电影详情面板（全屏覆盖层） ========== -->
<div class="movie-detail-overlay" id="movie-detail-overlay" style="display:none" role="dialog" aria-modal="true" aria-labelledby="movie-detail-title">
  <div class="movie-detail-content">
    <button class="movie-detail-close" id="movie-detail-close" aria-label="关闭">✕</button>

    <div class="movie-detail-grid">
      <!-- 左列：海报 + 基础信息 -->
      <div class="movie-detail-left">
        <div class="movie-detail-poster" id="movie-detail-poster"></div>
        <div class="movie-detail-info">
          <h2 class="movie-detail-title" id="movie-detail-title"></h2>
          <p class="movie-detail-en-title" id="movie-detail-en-title"></p>
          <div class="movie-detail-meta" id="movie-detail-meta"></div>
          <div class="movie-detail-heat" id="movie-detail-heat"></div>
        </div>
      </div>

      <!-- 右列：DNA + 色彩 + 导演匹配 -->
      <div class="movie-detail-right">
        <div class="movie-detail-section">
          <h4>风格 DNA</h4>
          <canvas class="movie-dna-canvas" id="movie-dna-canvas" width="300" height="300"></canvas>
          <div class="movie-dna-compare">
            <label>对比导演：</label>
            <select id="movie-dna-compare-select" class="style-select"></select>
          </div>
        </div>

        <div class="movie-detail-section">
          <h4>色彩提取</h4>
          <div class="movie-color-palette" id="movie-color-palette"></div>
        </div>

        <div class="movie-detail-section">
          <h4>最相似导演</h4>
          <div class="movie-director-matches" id="movie-director-matches"></div>
        </div>
      </div>
    </div>

    <!-- 标志性场景 -->
    <div class="movie-detail-scenes" id="movie-detail-scenes"></div>

    <!-- CTA 按钮 -->
    <div class="movie-detail-actions">
      <button class="btn btn-primary btn-lg" id="movie-detail-generate">✦ 生成同风格海报 →</button>
      <button class="btn btn-outline" id="movie-detail-share">🔗 分享</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: 提交**

```bash
git add index.html
git commit -m "feat: add movies page HTML structure + detail overlay"
```

---

## Task 8: 电影模块逻辑

**Files:**
- Create: `js/movie-module.js`

- [ ] **Step 1: 创建 movie-module.js**

```js
/**
 * 造境 ZaoJing — 热门电影模块 v1.0
 * 电影列表渲染 + 详情面板 + DNA 雷达图 + 生成流程
 */

const MovieModule = (function() {

  // ========== 模块状态 ==========
  const state = {
    movies: [],
    serverMovies: [],
    currentTab: 'active',
    currentMovie: null,
    selectedMovieId: null,
    ranking: { boxOfficeRank: [], socialRank: [] }
  };

  // ========== 工具函数 ==========
  function $(id) { return document.getElementById(id); }

  function formatBoxOffice(amount) {
    if (amount >= 100000000) return (amount / 100000000).toFixed(1) + '亿';
    if (amount >= 10000) return (amount / 10000).toFixed(0) + '万';
    return amount.toString();
  }

  function formatMentions(count) {
    if (count >= 10000000) return (count / 10000000).toFixed(1) + '千万';
    if (count >= 10000) return (count / 10000).toFixed(0) + '万';
    return count.toString();
  }

  function getHeatColor(score) {
    if (score >= 90) return '#e74c3c';
    if (score >= 70) return '#e67e22';
    if (score >= 50) return '#f1c40f';
    return '#3498db';
  }

  function getHeatLabel(score) {
    if (score >= 90) return '社交爆表';
    if (score >= 70) return '高热';
    if (score >= 50) return '上升';
    return '新晋';
  }

  // ========== 初始化 ==========
  async function init() {
    bindEvents();
    await loadMovies();
  }

  function bindEvents() {
    // 导航
    $('nav-to-movies').onclick = () => navigateToMovies();
    $('btn-to-movies').onclick = () => navigateToMovies();
    $('btn-movies-back').onclick = () => {
      if (window.App) App.navigate('input');
      else document.querySelector('.page.active')?.classList.remove('active');
      $('page-input').classList.add('active');
    };

    // Tab 切换
    document.querySelectorAll('.movies-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.movies-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentTab = tab.dataset.tab;
        renderCarousel();
      };
    });

    // 横滑按钮
    $('movies-prev').onclick = () => {
      $('movies-carousel').scrollBy({ left: -440, behavior: 'smooth' });
    };
    $('movies-next').onclick = () => {
      $('movies-carousel').scrollBy({ left: 440, behavior: 'smooth' });
    };

    // Hero CTA
    $('movies-hero-cta').onclick = () => {
      const featured = state.movies.find(m => m.featured) || state.movies[0];
      if (featured) openMovieDetail(featured.id);
    };

    // 详情面板
    $('movie-detail-close').onclick = closeMovieDetail;
    $('movie-detail-overlay').onclick = (e) => {
      if (e.target === $('movie-detail-overlay')) closeMovieDetail();
    };
    $('movie-detail-generate').onclick = () => {
      if (state.currentMovie) selectMovieForGeneration(state.currentMovie.id);
    };
    $('movie-detail-share').onclick = () => {
      if (window.toast) toast('请截图后分享');
    };

    // DNA 对比下拉
    $('movie-dna-compare-select').onchange = (e) => {
      if (state.currentMovie) drawDNARadar(state.currentMovie, e.target.value);
    };

    // Escape 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('movie-detail-overlay').style.display !== 'none') {
        closeMovieDetail();
      }
    });
  }

  // ========== 加载电影数据 ==========
  async function loadMovies() {
    // 先用本地 fallback 数据
    state.movies = window.MOVIE_DATA ? MOVIE_DATA.FALLBACK_MOVIES : [];

    // 尝试从后端获取
    try {
      const result = await AIClient.getMovies();
      if (result.movies && result.movies.length > 0) {
        state.serverMovies = result.movies;
        // 合并：后端数据优先，补充本地不存在的
        const serverIds = new Set(result.movies.map(m => m.id));
        const localOnly = state.movies.filter(m => !serverIds.has(m.id));
        state.movies = [...result.movies, ...localOnly];
      }
    } catch (e) {
      console.warn('[电影模块] 后端数据获取失败，使用本地数据:', e.message);
    }

    // 获取排行榜
    try {
      state.ranking = await AIClient.getMovieRanking();
    } catch (e) {
      // 本地排行榜
      state.ranking = generateLocalRanking();
    }

    // 更新 badge
    const activeCount = state.movies.filter(m => m.status === 'active').length;
    const badge = $('movies-badge');
    if (badge) badge.textContent = activeCount + '部热映';

    renderHero();
    renderCarousel();
    renderRankings();
  }

  function generateLocalRanking() {
    const sorted = [...state.movies];
    return {
      boxOfficeRank: sorted.filter(m => m.boxOffice > 0).sort((a, b) => b.boxOffice - a.boxOffice).slice(0, 10).map((m, i) => ({ rank: i + 1, id: m.id, title: m.title, value: m.boxOffice })),
      socialRank: sorted.sort((a, b) => b.socialMentions - a.socialMentions).slice(0, 10).map((m, i) => ({ rank: i + 1, id: m.id, title: m.title, value: m.socialMentions }))
    };
  }

  // ========== 渲染 Hero ==========
  function renderHero() {
    const featured = state.movies.find(m => m.featured) || state.movies[0];
    if (!featured) return;

    $('movies-hero-title').textContent = featured.title;
    $('movies-hero-meta').textContent = `导演 ${featured.director} · 票房 ${formatBoxOffice(featured.boxOffice)}`;

    const heatBar = $('movies-hero-heat-bar');
    heatBar.style.width = featured.heatScore + '%';
    heatBar.style.background = `linear-gradient(90deg, ${getHeatColor(featured.heatScore)}, var(--miya))`;

    $('movies-hero-heat-text').textContent = `热度 ${featured.heatScore}/100 · ${getHeatLabel(featured.heatScore)}`;

    // 背景
    const heroBg = $('movies-hero-bg');
    if (featured.backdropUrl) {
      heroBg.style.backgroundImage = `url(${featured.backdropUrl})`;
    } else {
      // 用电影 colors 生成渐变背景
      const c = featured.colors;
      heroBg.style.background = `linear-gradient(135deg, ${c.bg}, ${c.primary}88, ${c.secondary}88)`;
    }
  }

  // ========== 渲染电影卡片横滑 ==========
  function renderCarousel() {
    const carousel = $('movies-carousel');
    const filtered = state.movies.filter(m => m.status === state.currentTab);

    if (filtered.length === 0) {
      carousel.innerHTML = '<div class="movies-carousel-empty">暂无电影</div>';
      return;
    }

    carousel.innerHTML = filtered.map(movie => {
      const heatColor = getHeatColor(movie.heatScore);
      const bgStyle = movie.posterUrl
        ? `background-image: url(${movie.posterUrl})`
        : `background: linear-gradient(135deg, ${movie.colors.bg}, ${movie.colors.primary}88)`;
      return `
        <div class="movie-card" data-movie-id="${movie.id}" tabindex="0" role="button" aria-label="${movie.title}">
          <div class="movie-card-bg" style="${bgStyle}"></div>
          <div class="movie-card-overlay"></div>
          <div class="movie-card-content">
            <span class="movie-card-heat" style="color:${heatColor}">● 热度${movie.heatScore}</span>
            <h4 class="movie-card-title">${movie.title}</h4>
            <p class="movie-card-meta">${movie.director}</p>
          </div>
        </div>
      `;
    }).join('');

    // 绑定卡片点击
    carousel.querySelectorAll('.movie-card').forEach(card => {
      card.onclick = () => openMovieDetail(card.dataset.movieId);
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openMovieDetail(card.dataset.movieId);
        }
      };
    });
  }

  // ========== 渲染排行榜 ==========
  function renderRankings() {
    const boList = $('ranking-boxoffice');
    const socialList = $('ranking-social');

    if (state.ranking.boxOfficeRank.length === 0) {
      boList.innerHTML = '<li class="ranking-empty">暂无数据</li>';
    } else {
      boList.innerHTML = state.ranking.boxOfficeRank.map(item => `
        <li class="ranking-item" data-movie-id="${item.id}">
          <span class="ranking-rank rank-${item.rank <= 3 ? item.rank : 'normal'}">${item.rank}</span>
          <span class="ranking-name">${item.title}</span>
          <span class="ranking-value">${formatBoxOffice(item.value)}</span>
        </li>
      `).join('');
    }

    if (state.ranking.socialRank.length === 0) {
      socialList.innerHTML = '<li class="ranking-empty">暂无数据</li>';
    } else {
      socialList.innerHTML = state.ranking.socialRank.map(item => `
        <li class="ranking-item" data-movie-id="${item.id}">
          <span class="ranking-rank rank-${item.rank <= 3 ? item.rank : 'normal'}">${item.rank}</span>
          <span class="ranking-name">${item.title}</span>
          <span class="ranking-value">${formatMentions(item.value)}</span>
        </li>
      `).join('');
    }

    // 排行榜点击跳转
    document.querySelectorAll('.ranking-item').forEach(item => {
      item.onclick = () => {
        if (item.dataset.movieId) openMovieDetail(item.dataset.movieId);
      };
    });
  }

  // ========== 电影详情面板 ==========
  function openMovieDetail(movieId) {
    const movie = state.movies.find(m => m.id === movieId);
    if (!movie) return;

    state.currentMovie = movie;

    // 基础信息
    $('movie-detail-title').textContent = movie.title;
    $('movie-detail-en-title').textContent = movie.enTitle || '';
    $('movie-detail-meta').innerHTML = `导演 ${movie.director} · 上映 ${movie.releaseDate} · 票房 ${formatBoxOffice(movie.boxOffice)}`;
    $('movie-detail-heat').innerHTML = `<span style="color:${getHeatColor(movie.heatScore)}">● 热度 ${movie.heatScore}/100 · ${getHeatLabel(movie.heatScore)}</span>`;

    // 海报
    const posterEl = $('movie-detail-poster');
    if (movie.posterUrl) {
      posterEl.style.backgroundImage = `url(${movie.posterUrl})`;
    } else {
      const c = movie.colors;
      posterEl.style.background = `linear-gradient(135deg, ${c.bg}, ${c.primary}, ${c.secondary})`;
    }

    // DNA 雷达图
    drawDNARadar(movie, '');

    // DNA 对比下拉
    const select = $('movie-dna-compare-select');
    select.innerHTML = '<option value="">不对比</option>' +
      (movie.matchedDirectorIds || []).map(id => {
        const d = DIRECTORS.find(dir => dir.id === id);
        return d ? `<option value="${id}">${d.name} (${Math.round((movie.matchScores[id] || 0) * 100)}%)</option>` : '';
      }).join('');

    // 色彩提取
    const palette = $('movie-color-palette');
    if (movie.colors) {
      palette.innerHTML = Object.entries(movie.colors).map(([key, hex]) => `
        <div class="color-swatch" title="${key}: ${hex}">
          <div class="color-swatch-color" style="background:${hex}"></div>
          <span class="color-swatch-hex">${hex}</span>
        </div>
      `).join('');
    } else {
      palette.innerHTML = '<p class="movie-detail-empty">暂无色彩数据</p>';
    }

    // 导演匹配
    const matches = $('movie-director-matches');
    if (movie.matchedDirectorIds && movie.matchedDirectorIds.length > 0) {
      matches.innerHTML = movie.matchedDirectorIds.map(id => {
        const d = DIRECTORS.find(dir => dir.id === id);
        const score = movie.matchScores[id] || 0;
        return d ? `
          <div class="director-match-item">
            <span class="director-match-name">${d.name}</span>
            <div class="director-match-bar"><div class="director-match-fill" style="width:${score * 100}%"></div></div>
            <span class="director-match-score">${Math.round(score * 100)}%</span>
          </div>
        ` : '';
      }).join('');
    } else {
      matches.innerHTML = '<p class="movie-detail-empty">暂无匹配数据</p>';
    }

    // 标志性场景
    const scenes = $('movie-detail-scenes');
    if (movie.signatureScenes && movie.signatureScenes.length > 0) {
      scenes.innerHTML = '<h4>标志性场景</h4><div class="movie-scenes-list">' +
        movie.signatureScenes.map(scene => `<div class="movie-scene-item">${scene}</div>`).join('') +
        '</div>';
    } else {
      scenes.innerHTML = '';
    }

    // 显示面板
    $('movie-detail-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeMovieDetail() {
    $('movie-detail-overlay').style.display = 'none';
    document.body.style.overflow = '';
    state.currentMovie = null;
  }

  // ========== DNA 雷达图 ==========
  function drawDNARadar(movie, compareDirectorId) {
    const canvas = $('movie-dna-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 40;

    ctx.clearRect(0, 0, w, h);

    const dimensions = [
      { key: 'colorTemperature', label: '色温' },
      { key: 'saturation',       label: '饱和' },
      { key: 'contrast',         label: '对比' },
      { key: 'compositionType',  label: '构图' },
      { key: 'lightingType',     label: '光影' },
      { key: 'scale',            label: '尺度' },
      { key: 'pace',             label: '节奏' },
      { key: 'texture',          label: '质感' }
    ];

    const valueMaps = {
      colorTemperature: { cool: 0.2, neutral: 0.5, warm: 0.8 },
      saturation: { low: 0.2, medium: 0.5, high: 0.8 },
      contrast: { low: 0.2, medium: 0.5, high: 0.8 },
      compositionType: { symmetric: 0.2, centered: 0.4, asymmetric: 0.6, dynamic: 0.8 },
      lightingType: { natural: 0.2, high-key: 0.4, low-key: 0.6, dramatic: 0.8 },
      scale: { intimate: 0.2, medium: 0.5, monumental: 0.8 },
      pace: { static: 0.2, dynamic: 0.8 },
      texture: { smooth: 0.2, digital: 0.4, grainy: 0.6, painterly: 0.8, handdrawn: 0.9 }
    };

    const n = dimensions.length;
    const angleStep = (Math.PI * 2) / n;

    // 绘制网格
    ctx.strokeStyle = 'rgba(245,240,232,0.1)';
    ctx.lineWidth = 1;
    for (let r = 1; r <= 4; r++) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const angle = i * angleStep - Math.PI / 2;
        const x = cx + Math.cos(angle) * (radius * r / 4);
        const y = cy + Math.sin(angle) * (radius * r / 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 绘制轴线
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.strokeStyle = 'rgba(245,240,232,0.08)';
      ctx.stroke();
    }

    // 绘制电影 DNA
    if (movie.styleDNA) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const dim = dimensions[i];
        const val = valueMaps[dim.key][movie.styleDNA[dim.key]] || 0.5;
        const angle = i * angleStep - Math.PI / 2;
        const x = cx + Math.cos(angle) * (radius * val);
        const y = cy + Math.sin(angle) * (radius * val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(127,196,171,0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(127,196,171,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 绘制对比导演 DNA
    if (compareDirectorId) {
      const director = DIRECTORS.find(d => d.id === compareDirectorId);
      if (director && director.styleDNA) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const dim = dimensions[i];
          const val = valueMaps[dim.key][director.styleDNA[dim.key]] || 0.5;
          const angle = i * angleStep - Math.PI / 2;
          const x = cx + Math.cos(angle) * (radius * val);
          const y = cy + Math.sin(angle) * (radius * val);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(245,240,232,0.05)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(245,240,232,0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 绘制标签
    ctx.font = '11px "Noto Sans SC", sans-serif';
    ctx.fillStyle = 'rgba(245,240,232,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const angle = i * angleStep - Math.PI / 2;
      const labelX = cx + Math.cos(angle) * (radius + 20);
      const labelY = cy + Math.sin(angle) * (radius + 20);
      ctx.fillText(dimensions[i].label, labelX, labelY);
    }
  }

  // ========== 选择电影进入生成流程 ==========
  function selectMovieForGeneration(movieId) {
    state.selectedMovieId = movieId;
    closeMovieDetail();

    // 跳转到输入页
    const inputPage = $('page-input');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    inputPage.classList.add('active');

    // 显示电影标签
    showMovieTag(movieId);

    if (window.toast) toast('已选择电影风格，输入文字后生成海报');
  }

  function showMovieTag(movieId) {
    const movie = state.movies.find(m => m.id === movieId);
    if (!movie) return;

    let tag = $('movie-style-tag');
    if (!tag) {
      tag = document.createElement('div');
      tag.id = 'movie-style-tag';
      tag.className = 'movie-style-tag';
      const hero = $('page-input').querySelector('.input-hero');
      if (hero) hero.appendChild(tag);
    }

    const c = movie.colors;
    tag.innerHTML = `
      <div class="movie-tag-poster" style="background:${c.primary}"></div>
      <div class="movie-tag-info">
        <span class="movie-tag-title">🎬 ${movie.title}</span>
        <span class="movie-tag-style">${movie.visualStyle}</span>
      </div>
      <button class="movie-tag-remove" onclick="MovieModule.clearSelectedMovie()">✕</button>
    `;
    tag.style.display = 'flex';
  }

  function clearSelectedMovie() {
    state.selectedMovieId = null;
    const tag = $('movie-style-tag');
    if (tag) tag.style.display = 'none';
  }

  // ========== 导航 ==========
  function navigateToMovies() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $('page-movies').classList.add('active');
    if (state.movies.length === 0) loadMovies();
  }

  function getSelectedMovie() {
    if (!state.selectedMovieId) return null;
    return state.movies.find(m => m.id === state.selectedMovieId);
  }

  function refreshMovies() {
    return loadMovies();
  }

  return {
    init,
    navigateToMovies,
    openMovieDetail,
    selectMovieForGeneration,
    getSelectedMovie,
    clearSelectedMovie,
    refreshMovies
  };
})();
```

- [ ] **Step 2: 验证语法**

```bash
node --check /sessions/6a34f4e24a12d4bb62851742/workspace/zaojing-mvp/js/movie-module.js
```

- [ ] **Step 3: 提交**

```bash
git add js/movie-module.js
git commit -m "feat: add movie module with list, detail, DNA radar, generation flow"
```

---

## Task 9: CSS 样式

**Files:**
- Modify: `css/app.css`

- [ ] **Step 1: 在 app.css 末尾添加电影模块样式**

```css
/* ========== 热门电影模块 ========== */

/* 导航入口 */
.nav-links{display:flex;gap:8px;align-items:center}
.nav-link-btn{padding:6px 14px;border-radius:8px;border:1px solid var(--line);background:var(--bg-2);color:var(--ink-dim);font-size:.78rem;cursor:pointer;transition:border-color .2s,color .2s;min-height:36px;font-family:inherit}
.nav-link-btn:hover{border-color:var(--miya);color:var(--miya)}

/* 输入页电影入口 */
.btn-badge{display:inline-block;padding:2px 8px;border-radius:10px;background:var(--miya);color:var(--bg);font-size:.68rem;font-weight:600;margin-left:6px}
.btn-icon{margin-right:4px}

/* 电影列表页 */
.movies-page-inner{max-width:1200px;margin:0 auto;padding:0 20px 40px}

/* Cinematic Hero */
.movies-hero{position:relative;width:calc(100% + 40px);margin-left:-20px;margin-right:-20px;height:50vh;min-height:360px;overflow:hidden;border-radius:0 0 20px 20px}
.movies-hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:brightness(.6)}
.movies-hero-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(to top,var(--bg) 10%,rgba(11,10,9,.5) 50%,transparent 100%)}
.movies-hero-content{position:absolute;bottom:40px;left:40px;right:40px;z-index:1}
.movies-hero-label{display:inline-block;padding:4px 12px;border-radius:12px;background:rgba(127,196,171,.2);color:var(--miya);font-size:.74rem;font-weight:600;margin-bottom:12px;backdrop-filter:blur(4px)}
.movies-hero-title{font-family:'Noto Serif SC',serif;font-size:2.5rem;font-weight:900;color:var(--ink);margin:0 0 8px;line-height:1.2;text-shadow:0 2px 20px rgba(0,0,0,.6)}
.movies-hero-meta{font-size:.9rem;color:var(--ink-dim);margin:0 0 16px}
.movies-hero-heat{display:flex;align-items:center;gap:12px;margin-bottom:20px}
.heat-bar{flex:1;max-width:300px;height:6px;border-radius:3px;background:var(--bg-3);overflow:hidden}
.heat-bar-fill{height:100%;border-radius:3px;transition:width .6s var(--ease)}
.heat-text{font-size:.82rem;color:var(--ink-dim);white-space:nowrap}
.movies-hero-cta{box-shadow:0 4px 24px rgba(127,196,171,.3)}

/* 分类 Tab */
.movies-tabs{display:flex;gap:8px;margin:32px 0 20px}
.movies-tab{padding:8px 18px;border-radius:20px;border:1px solid var(--line);background:var(--bg-2);color:var(--ink-mute);font-size:.84rem;cursor:pointer;transition:border-color .2s,color .2s,background .2s;min-height:38px;font-family:inherit}
.movies-tab.active{border-color:var(--miya);color:var(--miya);background:rgba(127,196,171,.1)}
.movies-tab:hover{border-color:var(--miya);color:var(--ink-dim)}

/* 横滑区 */
.movies-carousel-wrapper{display:flex;align-items:center;gap:12px;margin-bottom:40px}
.movies-carousel{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-ms-overflow-style:none;flex:1;padding-bottom:8px}
.movies-carousel::-webkit-scrollbar{display:none}
.movies-carousel-btn{flex-shrink:0;width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--bg-2);color:var(--ink-dim);font-size:1.4rem;cursor:pointer;transition:border-color .2s,color .2s;display:flex;align-items:center;justify-content:center;min-height:40px}
.movies-carousel-btn:hover{border-color:var(--miya);color:var(--miya)}
.movies-carousel-empty{padding:40px;text-align:center;color:var(--ink-mute);width:100%}

/* 电影卡片 */
.movie-card{flex-shrink:0;width:200px;height:300px;border-radius:12px;overflow:hidden;position:relative;cursor:pointer;scroll-snap-align:start;transition:transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s}
.movie-card:hover,.movie-card:focus-visible{transform:translateY(-4px) scale(1.03);box-shadow:0 12px 40px rgba(0,0,0,.5);outline:none}
.movie-card-bg{position:absolute;inset:0;background-size:cover;background-position:center}
.movie-card-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.85) 20%,transparent 60%)}
.movie-card-content{position:absolute;bottom:0;left:0;right:0;padding:14px}
.movie-card-heat{font-size:.72rem;font-weight:600;display:block;margin-bottom:4px}
.movie-card-title{font-size:.92rem;font-weight:700;color:var(--ink);margin:0 0 2px;line-height:1.3}
.movie-card-meta{font-size:.72rem;color:var(--ink-mute);margin:0}

/* 排行榜 */
.movies-rankings{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:40px}
.ranking-card{background:var(--bg-2);border:1px solid var(--line);border-radius:12px;padding:20px}
.ranking-title{font-size:1rem;color:var(--ink);margin:0 0 16px}
.ranking-list{list-style:none;padding:0;margin:0;counter-reset:none}
.ranking-item{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);cursor:pointer;transition:background .2s;border-radius:6px;padding-left:4px;padding-right:4px}
.ranking-item:hover{background:var(--bg-3)}
.ranking-item:last-child{border-bottom:none}
.ranking-rank{flex-shrink:0;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.74rem;font-weight:700;font-family:'JetBrains Mono',monospace}
.rank-1{background:linear-gradient(135deg,#ffd700,#ffaa00);color:#1a1a0a}
.rank-2{background:linear-gradient(135deg,#c0c0c0,#a0a0a0);color:#1a1a1a}
.rank-3{background:linear-gradient(135deg,#cd7f32,#a0522d);color:#fff}
.rank-normal{background:var(--bg-3);color:var(--ink-mute)}
.ranking-name{flex:1;font-size:.84rem;color:var(--ink-dim)}
.ranking-value{font-size:.82rem;color:var(--ink-mute);font-family:'JetBrains Mono',monospace}
.ranking-empty{text-align:center;color:var(--ink-mute);padding:20px;font-size:.84rem}

.movies-back{text-align:center;padding:20px}

/* ========== 电影详情面板 ========== */
.movie-detail-overlay{position:fixed;inset:0;z-index:100;background:rgba(11,10,9,.92);backdrop-filter:blur(20px);display:flex;align-items:center;justify-content:center;overflow-y:auto;animation:movieDetailIn .3s cubic-bezier(.22,1,.36,1)}
@keyframes movieDetailIn{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
.movie-detail-content{max-width:900px;width:100%;margin:40px 20px;padding:32px;position:relative}
.movie-detail-close{position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;background:var(--bg-3);border:1px solid var(--line);color:var(--ink-dim);font-size:1.1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:border-color .2s,color .2s;z-index:1}
.movie-detail-close:hover{border-color:var(--miya);color:var(--miya)}

.movie-detail-grid{display:grid;grid-template-columns:300px 1fr;gap:32px;margin-bottom:24px}
.movie-detail-left{display:flex;flex-direction:column;gap:16px}
.movie-detail-poster{width:300px;height:450px;border-radius:12px;background-size:cover;background-position:center;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.movie-detail-title{font-family:'Noto Serif SC',serif;font-size:1.8rem;font-weight:900;color:var(--ink);margin:0}
.movie-detail-en-title{font-size:.86rem;color:var(--ink-mute);margin:4px 0 12px}
.movie-detail-meta{font-size:.84rem;color:var(--ink-dim);line-height:1.6}
.movie-detail-heat{font-size:.84rem;margin-top:8px}

.movie-detail-right{display:flex;flex-direction:column;gap:24px}
.movie-detail-section h4{font-size:.92rem;color:var(--ink);margin:0 0 12px}
.movie-dna-canvas{display:block;margin:0 auto}
.movie-dna-compare{margin-top:12px;display:flex;align-items:center;gap:8px}
.movie-dna-compare label{font-size:.78rem;color:var(--ink-mute)}

.movie-color-palette{display:flex;gap:8px;flex-wrap:wrap}
.color-swatch{display:flex;flex-direction:column;align-items:center;gap:4px}
.color-swatch-color{width:48px;height:48px;border-radius:8px;border:1px solid var(--line);transition:transform .2s}
.color-swatch-color:hover{transform:scale(1.1)}
.color-swatch-hex{font-size:.66rem;color:var(--ink-mute);font-family:'JetBrains Mono',monospace}

.movie-director-matches{display:flex;flex-direction:column;gap:10px}
.director-match-item{display:flex;align-items:center;gap:10px}
.director-match-name{flex-shrink:0;width:60px;font-size:.82rem;color:var(--ink-dim)}
.director-match-bar{flex:1;height:6px;border-radius:3px;background:var(--bg-3);overflow:hidden}
.director-match-fill{height:100%;border-radius:3px;background:var(--miya);transition:width .4s var(--ease)}
.director-match-score{flex-shrink:0;width:40px;text-align:right;font-size:.78rem;color:var(--ink-mute);font-family:'JetBrains Mono',monospace}

.movie-detail-scenes{margin-bottom:24px}
.movie-detail-scenes h4{font-size:.92rem;color:var(--ink);margin:0 0 12px}
.movie-scenes-list{display:flex;gap:12px;flex-wrap:wrap}
.movie-scene-item{padding:8px 16px;border-radius:8px;background:var(--bg-3);border:1px solid var(--line);font-size:.82rem;color:var(--ink-dim)}

.movie-detail-actions{display:flex;gap:12px;justify-content:center}
.movie-detail-empty{color:var(--ink-mute);font-size:.84rem;padding:12px 0}

/* 电影风格标签（输入页） */
.movie-style-tag{display:flex;align-items:center;gap:10px;padding:8px 14px;border-radius:10px;border:1px solid var(--miya);background:rgba(127,196,171,.08);margin-bottom:16px}
.movie-tag-poster{width:32px;height:32px;border-radius:6px;flex-shrink:0}
.movie-tag-info{display:flex;flex-direction:column;gap:2px;flex:1}
.movie-tag-title{font-size:.84rem;font-weight:600;color:var(--miya)}
.movie-tag-style{font-size:.72rem;color:var(--ink-mute)}
.movie-tag-remove{width:24px;height:24px;border-radius:50%;border:none;background:transparent;color:var(--ink-mute);cursor:pointer;font-size:.9rem;display:flex;align-items:center;justify-content:center}
.movie-tag-remove:hover{color:var(--ink)}

/* 响应式 */
@media (max-width:768px){
  .movies-hero{height:40vh;min-height:300px}
  .movies-hero-content{bottom:24px;left:20px;right:20px}
  .movies-hero-title{font-size:1.8rem}
  .movie-card{width:160px;height:240px}
  .movies-rankings{grid-template-columns:1fr}
  .movie-detail-grid{grid-template-columns:1fr}
  .movie-detail-poster{width:100%;height:300px}
  .movie-detail-content{padding:20px;margin:20px}
}
@media (max-width:480px){
  .movies-hero{height:35vh}
  .movies-hero-title{font-size:1.4rem}
  .movie-card{width:140px;height:210px}
  .movies-rankings{grid-template-columns:1fr}
  .movie-detail-actions{flex-direction:column}
}
```

- [ ] **Step 2: 提交**

```bash
git add css/app.css
git commit -m "feat: add movie module CSS styles (hero, carousel, detail, radar)"
```

---

## Task 10: App 集成

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: 在 App.init() 中初始化 MovieModule**

找到 `init` 函数中的事件绑定区域末尾（在 `// 键盘快捷键` 之前），添加：

```js
    // 初始化热门电影模块
    if (window.MovieModule) {
      MovieModule.init();
    }
```

- [ ] **Step 2: 在 startGeneration 中支持电影风格**

找到 `startGeneration` 函数中组装 `PosterEngine.generate` 参数的部分，在 `directorId` 参数之后添加 `movieId`：

在 generate 调用中找到：
```js
      const result = await PosterEngine.generate({
        text: state.inputText,
        directorId: directorId,
        moodTagId: state.moodTagId,
```

修改为：
```js
      // 检查是否选了电影
      const selectedMovie = window.MovieModule ? MovieModule.getSelectedMovie() : null;

      const result = await PosterEngine.generate({
        text: state.inputText,
        directorId: directorId,
        movieId: selectedMovie ? selectedMovie.id : undefined,
        moodTagId: state.moodTagId,
```

- [ ] **Step 3: 在结果页展示电影灵感来源**

找到 `showResultPage` 函数中展示结果的部分，在展示 `poster-img` 之后添加电影来源信息：

```js
      // 如果有电影来源，显示灵感来源面板
      if (result.movieRef) {
        const refEl = $('movie-inspiration') || (() => {
          const el = document.createElement('div');
          el.id = 'movie-inspiration';
          el.className = 'movie-inspiration-panel';
          $('poster-single').appendChild(el);
          return el;
        })();
        const ref = result.movieRef;
        const movie = window.MovieModule ? MovieModule.state.movies.find(m => m.id === ref.id) : null;
        refEl.innerHTML = `
          <div class="inspiration-label">灵感来源</div>
          <div class="inspiration-movie">${ref.title}</div>
          ${movie ? `<div class="inspiration-style">${movie.visualStyle}</div>` : ''}
        `;
        refEl.style.display = 'block';
      }
```

- [ ] **Step 4: 在生成中页步骤文案中支持电影**

找到 `startGeneration` 函数中的步骤文案更新部分，修改为：

```js
      // 更新步骤文案
      const selectedMovie = window.MovieModule ? MovieModule.getSelectedMovie() : null;
      const movieName = selectedMovie ? `《${selectedMovie.title}》` : '';
      const steps = [
        `正在解析${movieName}视觉风格...`,
        '调配色彩与光影...',
        '渲染画面...',
        '添加文字与金句...'
      ];
```

- [ ] **Step 5: 验证语法**

```bash
node --check /sessions/6a34f4e24a12d4bb62851742/workspace/zaojing-mvp/js/app.js
```

- [ ] **Step 6: 提交**

```bash
git add js/app.js
git commit -m "feat: integrate movie module into app (init, generation, result display)"
```

---

## Task 11: 浏览器全流程验证

- [ ] **Step 1: 重启服务器**

```bash
cd /sessions/6a34f4e24a12d4bb62851742/workspace/zaojing-mvp && lsof -ti:8127 | xargs kill -9 2>/dev/null; sleep 1 && node server/server.js &
```

- [ ] **Step 2: 验证页面加载**

在浏览器中打开 `http://localhost:8127/index.html?v=movies1`，确认：
- 导航栏出现"🎬 热门电影"按钮
- 输入页底部出现"热门电影同风格"入口卡片
- 控制台无报错

- [ ] **Step 3: 验证电影列表页**

点击"热门电影"按钮，确认：
- Hero 区域显示本周冠军电影（哪吒2）
- 热度条显示正确
- "正在热映"tab 显示电影卡片
- 排行榜显示票房和讨论度排名
- 点击卡片打开详情面板

- [ ] **Step 4: 验证详情面板**

在详情面板中确认：
- 电影标题、导演、票房信息正确
- DNA 雷达图正确渲染（8 维度多边形）
- 色彩提取显示 6 个色块
- 导演匹配显示进度条
- 标志性场景显示
- 点击"生成同风格海报"跳转到输入页
- 输入页顶部显示电影风格标签

- [ ] **Step 5: 验证生成流程**

在输入页输入文字，点击"选择导演 →"，选择任意导演，生成海报，确认：
- 生成中页步骤文案包含电影名
- 结果页显示生成的海报
- 结果页显示"灵感来源"面板
- 海报风格与电影视觉风格一致

- [ ] **Step 6: 验证 API 端点**

```bash
curl -s http://localhost:8127/api/movies | python3 -m json.tool | head -5
curl -s http://localhost:8127/api/movies/ranking | python3 -m json.tool | head -5
curl -s http://localhost:8127/api/movies/nezha2-2025 | python3 -m json.tool | head -5
```

- [ ] **Step 7: 验证响应式**

调整浏览器窗口大小，确认：
- 桌面端：Hero 50vh，卡片 200×300，双列排行榜，双列详情
- 平板端：Hero 40vh，卡片 160×240，单列排行榜
- 移动端：Hero 35vh，卡片 140×210，单列详情，按钮纵向排列

- [ ] **Step 8: 最终提交**

```bash
git add -A
git commit -m "feat: complete hot movies module phase 1 — list, detail, DNA, generation"
```

---

## Self-Review

### Spec 覆盖检查

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 电影数据结构（含 DNA、colors、热度） | Task 1 |
| 热度数据抓取（TMDB + 管理员审核） | Task 2 |
| API 端点（7 个） | Task 3 |
| 电影 DNA 分析（Vision API + fallback） | Task 4 |
| PosterEngine 支持 movieId | Task 5 |
| AI Client 电影 API 方法 | Task 6 |
| HTML 结构（page-movies + 详情面板） | Task 7 |
| 电影模块逻辑（列表/详情/雷达图/生成） | Task 8 |
| CSS 样式（影院级 UI） | Task 9 |
| App 集成（init/生成/结果展示） | Task 10 |
| 浏览器全流程验证 | Task 11 |

### 占位符扫描

无 TBD/TODO，所有步骤包含完整代码。

### 类型一致性

- `movieId` 参数在 Task 5（PosterEngine）、Task 6（AIClient）、Task 10（App）中一致使用
- `MovieModule.getSelectedMovie()` 在 Task 8 定义、Task 10 调用，签名一致
- `styleSource` 在 Task 5 中统一替换 `director` 变量，所有引用已更新
- `movieRef` 在 Task 5 返回值中定义、Task 10 结果页中消费，字段名一致
