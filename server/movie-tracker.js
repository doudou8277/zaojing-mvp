/**
 * 造境 ZaoJing — 热门电影热度追踪模块
 * 从 TMDB API 获取热门电影数据，计算热度分数，支持管理员审核
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_FILE = path.join(__dirname, 'data', 'movies.json');
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 读取本地数据（带内存缓存，避免每次 API 调用都读文件）
// 说明：此处保留同步 I/O（fs.statSync / fs.readFileSync）是刻意为之——
//   1) loadData 被 getApprovedMovies / getPendingMovies / getRanking 等同步函数直接调用，
//      改为 async 将迫使所有调用方及上层路由处理函数级联 await，影响面过大；
//   2) 已通过 mtime 缓存优化：仅在文件 mtime 变化时才执行 readFileSync，
//      命中缓存时只发生一次轻量的 statSync，热路径上几乎无磁盘读；
//   3) 单测通过 vi.spyOn(fs, 'statSync'/'readFileSync') 验证行为，改为 fs.promises 会破坏现有测试。
let _cachedData = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 30 * 1000; // 30 秒缓存

function loadData() {
  // 如果有缓存且文件未修改，直接返回缓存
  if (_cachedData) {
    try {
      const stats = fs.statSync(DATA_FILE);
      if (stats.mtimeMs === _cacheTimestamp) {
        return _cachedData;
      }
    } catch (e) {
      // 文件可能被删除，继续重新加载
      logger.debug({ err: e.message }, '[movie-tracker] statSync 失败，将重新加载文件');
    }
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    _cachedData = JSON.parse(raw);
    try {
      _cacheTimestamp = fs.statSync(DATA_FILE).mtimeMs;
    } catch (e) {
      // 更新缓存时间戳失败不影响功能（文件可能刚被写入）
      logger.debug({ err: e.message }, '[movie-tracker] 更新缓存时间戳失败');
    }
    return _cachedData;
  } catch (e) {
    _cachedData = { movies: [], lastFetch: null, pendingReview: [] };
    return _cachedData;
  }
}

// 保存本地数据（串行化写入 + 原子重命名，防止并发数据损坏与半写文件）
let _writeQueue = Promise.resolve();
function saveData(data) {
  _writeQueue = _writeQueue
    .then(() => {
      // 先写入临时文件，再原子重命名为目标文件
      // 确保其他读取方永远不会看到半写入的 JSON
      const tmpFile = DATA_FILE + '.tmp';
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpFile, DATA_FILE); // 原子重命名
      // 更新内存缓存
      _cachedData = data;
      try {
        _cacheTimestamp = fs.statSync(DATA_FILE).mtimeMs;
      } catch (e) {
        // 更新缓存时间戳失败不影响功能
        logger.debug({ err: e.message }, '[movie-tracker] 保存后更新缓存时间戳失败');
      }
    })
    .catch((e) => {
      logger.error({ err: e.message }, '[movie-tracker] 保存数据失败');
      // 防止一次写入失败阻塞后续写入
    });
  return _writeQueue;
}

// 从 TMDB 获取本周热门电影
async function fetchTrendingMovies() {
  if (!TMDB_API_KEY) {
    logger.warn('[movie-tracker] TMDB_API_KEY 未配置，跳过抓取');
    return [];
  }

  try {
    const url = `${TMDB_BASE}/trending/movie/week?api_key=${TMDB_API_KEY}&language=zh-CN`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`TMDB API 返回 ${resp.status}`);
    const data = await resp.json();
    return data.results || [];
  } catch (e) {
    logger.error({ err: e.message }, '[movie-tracker] TMDB 抓取失败');
    return [];
  }
}

// 获取电影详情（含票房）
async function fetchMovieDetail(tmdbId) {
  if (!TMDB_API_KEY) return null;
  try {
    const url = `${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=zh-CN&append_to_response=images,credits`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    logger.error({ tmdbId, err: e.message }, '[movie-tracker] 获取电影详情失败');
    return null;
  }
}

// 计算热度分数 (0-100)
function calculateHeatScore(movie) {
  // 票房分数 (40%)
  const boxOffice = movie.revenue || 0;
  const boxScore = boxOffice > 0 ? Math.min(100, Math.log10(boxOffice / 1000000) * 12) : 0;

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
  const posterUrl = tmdbMovie.poster_path ? `${TMDB_IMG_BASE}/w500${tmdbMovie.poster_path}` : '';
  const backdropUrl = tmdbMovie.backdrop_path ? `${TMDB_IMG_BASE}/original${tmdbMovie.backdrop_path}` : '';

  return {
    id: `tmdb-${tmdbMovie.id}`,
    title: tmdbMovie.title || tmdbMovie.original_title || '',
    enTitle: tmdbMovie.original_title || '',
    director:
      detail && detail.credits && detail.credits.crew
        ? (detail.credits.crew.find((c) => c.job === 'Director') || {}).name || '未知'
        : '未知',
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
    styleDNA: null,
    colors: null,
    matchedDirectorIds: [],
    matchScores: {},
    stylePrompt: '',
    negativePrompt: 'low quality, blurry, text, watermark, deformed',
    fontFamily: "'Noto Serif SC', serif",
    titleWeight: 800,
    status: tmdbMovie.release_date && new Date(tmdbMovie.release_date) > new Date() ? 'upcoming' : 'active',
    featured: false,
    approved: false,
  };
}

// 执行一次完整的热度数据刷新
async function refreshMovies() {
  logger.info('[movie-tracker] 开始刷新热门电影数据...');
  const data = loadData();

  const trending = await fetchTrendingMovies();
  if (trending.length === 0) {
    logger.warn('[movie-tracker] 未获取到热门电影数据');
    return { fetched: 0, pending: data.pendingReview.length };
  }

  const topMovies = trending.slice(0, 20);
  const newMovies = [];

  // 并行获取电影详情，限制并发数为 5，避免触发 TMDB 接口限流。
  // fetchMovieDetail 内部已 try/catch 并在失败时返回 null，因此 Promise.all 不会因单个失败而 reject；
  // 通过下标映射保持详情与 trending 电影的对应顺序。
  const DETAIL_BATCH_SIZE = 5;
  for (let i = 0; i < topMovies.length; i += DETAIL_BATCH_SIZE) {
    const batch = topMovies.slice(i, i + DETAIL_BATCH_SIZE);
    const details = await Promise.all(batch.map((m) => fetchMovieDetail(m.id)));
    for (let j = 0; j < batch.length; j++) {
      newMovies.push(convertTmdbMovie(batch[j], details[j]));
    }
  }

  const approvedIds = new Set(data.movies.map((m) => m.id));
  const newPending = newMovies.filter((m) => !approvedIds.has(m.id));

  data.pendingReview = [...data.pendingReview, ...newPending];
  data.lastFetch = new Date().toISOString();
  saveData(data);

  logger.info({ fetched: newMovies.length, pending: newPending.length }, '[movie-tracker] 刷新完成');
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
  const idx = data.pendingReview.findIndex((m) => m.id === movieId);
  if (idx === -1) return null;

  const movie = data.pendingReview[idx];
  const finalMovie = overrides ? { ...movie, ...overrides } : movie;
  finalMovie.approved = true;
  finalMovie.approvedAt = new Date().toISOString();

  data.pendingReview.splice(idx, 1);
  data.movies.unshift(finalMovie);

  if (data.movies.length > 30) {
    data.movies = data.movies.slice(0, 30);
  }

  saveData(data);
  return finalMovie;
}

// 管理员拒绝
function rejectMovie(movieId) {
  const data = loadData();
  data.pendingReview = data.pendingReview.filter((m) => m.id !== movieId);
  saveData(data);
  return true;
}

// 更新电影数据（如 DNA 分析结果）
function updateMovie(movieId, updates) {
  const data = loadData();
  const movie = data.movies.find((m) => m.id === movieId);
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
    .filter((m) => m.boxOffice > 0)
    .sort((a, b) => b.boxOffice - a.boxOffice)
    .slice(0, 10)
    .map((m, i) => ({ rank: i + 1, id: m.id, title: m.title, value: m.boxOffice, unit: '元' }));

  const socialRank = [...movies]
    .sort((a, b) => b.socialMentions - a.socialMentions)
    .slice(0, 10)
    .map((m, i) => ({ rank: i + 1, id: m.id, title: m.title, value: m.socialMentions, unit: '次' }));

  return { boxOfficeRank, socialRank };
}

/**
 * 等待写入队列完成（用于优雅关闭）
 * _writeQueue 是一个串行化的 Promise 链，await 它即可确保所有待写入任务完成
 */
async function flushQueue() {
  await _writeQueue;
}

module.exports = {
  refreshMovies,
  getApprovedMovies,
  getPendingMovies,
  approveMovie,
  rejectMovie,
  updateMovie,
  getRanking,
  loadData,
  flushQueue,
};
