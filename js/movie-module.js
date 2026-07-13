/**
 * 造境 ZaoJing — 热门电影模块 v1.0
 * 电影列表渲染 + 详情面板 + DNA 雷达图 + 生成流程
 */

import { DIRECTORS } from './data';
import { FALLBACK_MOVIES } from './movie-data.js';
import * as AIClient from './ai-client';
import * as PosterEngine from './poster-engine';
import { escapeHtml, sanitizeColor, safeRevokeUrl } from './utils/sanitize.js';
import {
  DNA_DIMENSIONS as dims,
  DNA_VALUE_MAPS as valMaps,
  dnaToValues,
  drawDNAGrid,
  drawDNALabels,
} from './utils/dna.js';
import { logger } from './utils/logger.js';
import { lazyLoadAll } from './utils/lazy-load.js';
import { $, toast, openModal, closeModal, state as appState } from './shared.js';
import { HEAT_WARM_THRESHOLD, HEAT_HOT_THRESHOLD, HEAT_EXTREME_THRESHOLD } from './utils/constants.js';

// ========== 依赖注入：向 PosterEngine 注入 getServerMovies ==========
// 打破 movie-module ↔ poster-engine 的循环依赖：poster-engine 不再静态
// import getServerMovies，而是在此处通过 setter 注入实现。
// getServerMovies 是函数声明（hoisted），可在模块顶层直接引用。
PosterEngine.setGetServerMovies(getServerMovies);

// ========== 模块状态 ==========
const state = {
  movies: [],
  serverMovies: [],
  currentTab: 'active',
  currentMovie: null,
  selectedMovieId: null,
  ranking: { boxOfficeRank: [], socialRank: [] },
  // Phase 2
  swapDirectorId: null,
  swapRatio: 0.5,
  customDNA: null,
  customColors: null,
  customPrompt: null,
  swapLabel: null,
  blindBoxCombo: null,
  quoteCardDataUrl: null,
  quoteCardFormat: 'square',
  // Phase 3
  selectedScene: null,
  scenePosterDataUrl: null,
  comicStripDataUrl: null,
  comicSceneCount: 3,
  // Phase 4
  memeDataUrl: null,
  memeType: 'dialogue',
  guessDataUrl: null,
  guessLevel: 2,
  challengeData: null,
};

// ========== 服务器电影数据访问 ==========
// 提供 ES Module 方式访问 serverMovies，替代 window._serverMovies 全局变量
function getServerMovies() {
  return state.serverMovies;
}

// ========== 工具函数 ==========

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
  if (score >= HEAT_EXTREME_THRESHOLD) return '#e74c3c';
  if (score >= HEAT_HOT_THRESHOLD) return '#e67e22';
  if (score >= HEAT_WARM_THRESHOLD) return '#f1c40f';
  return '#3498db';
}

function getHeatLabel(score) {
  if (score >= HEAT_EXTREME_THRESHOLD) return '社交爆表';
  if (score >= HEAT_HOT_THRESHOLD) return '高热';
  if (score >= HEAT_WARM_THRESHOLD) return '上升';
  return '新晋';
}

// ========== 初始化 ==========
let _eventsBound = false;

async function init() {
  bindEvents();
  await loadMovies();
  window.__movieModule = {
    state,
    getSelectedMovie,
    clearSelection: clearSelectedMovie,
    selectMovieForGeneration,
  };
  window.__movieData = state.movies;
}

function bindEvents() {
  // 防止重复绑定事件监听器
  if (_eventsBound) return;
  _eventsBound = true;

  // 事件委托：处理 data-action 属性的动态元素（替代内联 onclick）
  document.addEventListener('click', (e) => {
    const action = e.target?.closest?.('[data-action]')?.dataset?.action;
    if (!action) return;
    if (action === 'clear-movie') {
      clearSelectedMovie();
    } else if (action === 'remove-scene') {
      e.target.closest('.comic-scene-row')?.remove();
    }
  });

  // 导航
  $('nav-to-movies').onclick = () => navigateToMovies();
  $('btn-to-movies').onclick = () => navigateToMovies();
  $('btn-movies-back').onclick = () => {
    document.dispatchEvent(new CustomEvent('zaojing:navigate', { detail: { page: 'input' } }));
  };

  // Tab 切换
  document.querySelectorAll('.movies-tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('.movies-tab').forEach((t) => t.classList.remove('active'));
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

  // Hero CTA - 直接选择本周冠军电影进入生成流程
  $('movies-hero-cta').onclick = () => {
    const featured = state.movies.find((m) => m.featured) || state.movies[0];
    if (featured) selectMovieForGeneration(featured.id);
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
    toast('请截图后分享');
  };

  // Phase 2: 换导演
  $('movie-detail-swap-director').onclick = () => {
    if (state.currentMovie) openDirectorSwap(state.currentMovie.id);
  };
  $('director-swap-close').onclick = closeDirectorSwap;
  $('director-swap-modal').onclick = (e) => {
    if (e.target === $('director-swap-modal')) closeDirectorSwap();
  };
  // swap-ratio 滑块使用 RAF 节流，避免拖拽时频繁重绘 Canvas
  let swapPreviewRafId = null;
  $('swap-ratio').oninput = () => {
    if (state.swapDirectorId && state.currentMovie) {
      if (swapPreviewRafId) return;
      swapPreviewRafId = requestAnimationFrame(() => {
        swapPreviewRafId = null;
        updateSwapPreview();
      });
    }
  };
  $('btn-swap-generate').onclick = generateSwappedPoster;

  // ========== 创意工具弹窗 Tab 切换 ==========
  document.querySelectorAll('.creative-tab').forEach((btn) => {
    btn.onclick = () => switchCreativeTab(btn.dataset.creativeTab);
  });
  // zj:close 事件 — 清理当前活跃 tab 的资源
  const creativeModalEl = document.querySelector('zj-modal[modal-id="creative-modal"]');
  if (creativeModalEl) {
    creativeModalEl.addEventListener('zj:close', () => {
      const activeTab = document.querySelector('.creative-tab.active');
      if (activeTab) {
        switch (activeTab.dataset.creativeTab) {
          case 'quote':
            closeQuoteCard();
            break;
          case 'scene':
            closeSceneRecreate();
            break;
          case 'comic':
            closeComicStrip();
            break;
          case 'meme':
            closeCharacterMeme();
            break;
          case 'guess':
            closeGuessPoster();
            break;
        }
      }
    });
  }

  // Phase 2: 金句卡
  $('movie-detail-quote-card').onclick = () => {
    if (state.currentMovie) openQuoteCardGenerator(state.currentMovie.id);
  };
  $('btn-quote-square').onclick = () => generateQuoteCard('square');
  $('btn-quote-vertical').onclick = () => generateQuoteCard('vertical');
  $('btn-quote-download').onclick = downloadQuoteCard;

  // Phase 2: 盲盒
  $('btn-open-blindbox').onclick = openBlindBox;
  $('btn-blindbox-generate').onclick = generateBlindBoxPoster;
  $('btn-blindbox-reroll').onclick = openBlindBox;

  // Phase 2: DNA 滑块
  $('btn-reset-dna').onclick = () => {
    if (state.currentMovie) initDNASliders(state.currentMovie);
  };
  $('btn-apply-custom-dna').onclick = applyCustomDNA;

  // Phase 3: H2 名场面重绘
  $('movie-detail-scene').onclick = () => {
    if (state.currentMovie) openSceneRecreate(state.currentMovie.id);
  };
  $('btn-scene-generate').onclick = generateScenePoster;
  $('btn-scene-download').onclick = downloadScenePoster;

  // Phase 3: D4 连环画
  $('movie-detail-comic').onclick = () => {
    if (state.currentMovie) openComicStrip(state.currentMovie.id);
  };
  $('btn-comic-add-scene').onclick = addComicScene;
  $('btn-comic-generate').onclick = generateComicStripPoster;
  $('btn-comic-download').onclick = downloadComicStrip;

  // Phase 3: D6 情绪推荐
  $('btn-emotion-rec').onclick = recommendMoviesByEmotion;
  $('emotion-rec-text').onkeydown = (e) => {
    if (e.key === 'Enter') recommendMoviesByEmotion();
  };
  document.querySelectorAll('.emotion-chip').forEach((chip) => {
    chip.onclick = () => {
      $('emotion-rec-text').value = chip.dataset.emotion;
      recommendMoviesByEmotion();
    };
  });

  // Phase 4: X1 角色二创
  $('movie-detail-meme').onclick = () => {
    if (state.currentMovie) openCharacterMeme(state.currentMovie.id);
  };
  document.querySelectorAll('.meme-type-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.meme-type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });
  $('btn-meme-generate').onclick = generateMemePoster;
  $('btn-meme-download').onclick = downloadMemePoster;

  // Phase 4: X4 竞猜海报
  $('movie-detail-guess').onclick = () => {
    if (state.currentMovie) openGuessPoster(state.currentMovie.id);
  };
  document.querySelectorAll('.guess-level-btn').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.guess-level-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });
  $('btn-guess-generate').onclick = generateGuessPoster;
  $('btn-guess-reveal').onclick = revealGuessAnswer;
  $('btn-guess-download').onclick = downloadGuessPoster;

  // Phase 4: H3 挑战赛
  $('btn-join-challenge').onclick = joinChallenge;

  // Phase 4: H6 赛季面板
  document.querySelectorAll('.season-tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('.season-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      renderSeason(tab.dataset.season);
    };
  });

  // DNA 对比下拉
  $('movie-dna-compare-select').onchange = (e) => {
    if (state.currentMovie) drawDNARadar(state.currentMovie, e.target.value);
  };

  // Escape 关闭弹窗（从最上层开始检查）
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modals = [
      { id: 'guess-poster-modal', close: closeGuessPoster },
      { id: 'character-meme-modal', close: closeCharacterMeme },
      { id: 'comic-strip-modal', close: closeComicStrip },
      { id: 'scene-recreate-modal', close: closeSceneRecreate },
      { id: 'quote-card-modal', close: closeQuoteCard },
      { id: 'director-swap-modal', close: closeDirectorSwap },
      { id: 'movie-detail-overlay', close: closeMovieDetail },
    ];
    for (const m of modals) {
      const el = $(m.id);
      if (el && el.style.display !== 'none') {
        m.close();
        break;
      }
    }
  });
}

// ========== 加载电影数据 ==========
async function loadMovies() {
  // 先用本地 fallback 数据并立即渲染，避免「加载中...」永久停留
  state.movies = FALLBACK_MOVIES;
  state.ranking = generateLocalRanking();
  renderHero();
  renderCarousel();
  renderRankings();

  // 带超时的 fetch 包装（10 秒超时）
  const fetchWithTimeout = (promise, ms = 10000) =>
    Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时')), ms))]);

  // 并行请求电影列表与排行榜（两者无依赖关系），用 allSettled 保证单个失败不影响另一个
  const [moviesOutcome, rankingOutcome] = await Promise.allSettled([
    fetchWithTimeout(AIClient.getMovies()),
    fetchWithTimeout(AIClient.getMovieRanking()),
  ]);

  // 处理电影列表：失败时保持本地 fallback 数据
  if (moviesOutcome.status === 'fulfilled') {
    const result = moviesOutcome.value;
    if (result.movies && result.movies.length > 0) {
      state.serverMovies = result.movies;
      // 合并：后端数据优先，补充本地不存在的
      const serverIds = new Set(result.movies.map((m) => m.id));
      const localOnly = state.movies.filter((m) => !serverIds.has(m.id));
      state.movies = [...result.movies, ...localOnly];
      renderCarousel(); // 用后端数据重新渲染
    }
  } else {
    logger.warn('[电影模块] 后端数据获取失败，使用本地数据:', moviesOutcome.reason?.message);
    // 显示离线模式提示
    const heroSub = $('movies-hero-subtitle');
    if (heroSub) heroSub.textContent = '（离线模式，展示精选数据）';
  }

  // 处理排行榜：失败或为空时使用本地排行榜
  if (rankingOutcome.status === 'fulfilled') {
    const ranking = rankingOutcome.value;
    if (ranking && ranking.boxOfficeRank && ranking.boxOfficeRank.length > 0) {
      state.ranking = ranking;
    } else {
      state.ranking = generateLocalRanking();
    }
  } else {
    state.ranking = generateLocalRanking();
  }

  // 更新 badge
  const activeCount = state.movies.filter((m) => m.status === 'active').length;
  const badge = $('movies-badge');
  if (badge) badge.textContent = activeCount + '部热映';

  renderRankings();
  loadChallenge();
  loadSeason();

  // 从全局 state 恢复电影选择状态
  if (appState.selectedMovieId) {
    state.selectedMovieId = appState.selectedMovieId;
    state.customDNA = appState.movieCustomDNA || null;
    state.customColors = appState.movieCustomColors || null;
    state.customPrompt = appState.movieCustomPrompt || null;
    state.swapLabel = appState.movieSwapLabel || null;

    const movie = state.movies.find((m) => m.id === appState.selectedMovieId);
    if (movie) {
      const inputPage = $('page-input');
      if (inputPage && inputPage.classList.contains('active')) {
        showMovieTag(appState.selectedMovieId, appState.movieSwapLabel || undefined);
      }
    }
  }
}

function generateLocalRanking() {
  const sorted = [...state.movies];
  return {
    boxOfficeRank: sorted
      .filter((m) => m.boxOffice > 0)
      .sort((a, b) => b.boxOffice - a.boxOffice)
      .slice(0, 10)
      .map((m, i) => ({ rank: i + 1, id: m.id, title: m.title, value: m.boxOffice })),
    socialRank: sorted
      .sort((a, b) => b.socialMentions - a.socialMentions)
      .slice(0, 10)
      .map((m, i) => ({ rank: i + 1, id: m.id, title: m.title, value: m.socialMentions })),
  };
}

// ========== 渲染 Hero ==========
function renderHero() {
  const featured = state.movies.find((m) => m.featured) || state.movies[0];
  if (!featured) return;

  $('movies-hero-title').textContent = featured.title;
  $('movies-hero-meta').textContent = `导演 ${featured.director} · 票房 ${formatBoxOffice(featured.boxOffice)}`;

  const heatBar = $('movies-hero-heat-bar');
  heatBar.style.width = featured.heatScore + '%';
  heatBar.style.background = `linear-gradient(90deg, ${getHeatColor(featured.heatScore)}, var(--miya))`;

  $('movies-hero-heat-text').textContent = `热度 ${featured.heatScore}/100 · ${getHeatLabel(featured.heatScore)}`;

  // 背景图
  const heroBg = $('movies-hero-bg');
  if (featured.backdropUrl) {
    heroBg.style.backgroundImage = `url(${featured.backdropUrl})`;
  } else {
    const c = featured.colors || {};
    const bgColor = sanitizeColor(c.bg, '#1a1a1a');
    const primaryColor = sanitizeColor(c.primary, '#c41e3a');
    const secondaryColor = sanitizeColor(c.secondary, '#2c3e50');
    heroBg.style.background = `linear-gradient(135deg, ${bgColor}, ${primaryColor}88, ${secondaryColor}88)`;
  }

  // 海报
  const heroPoster = $('movies-hero-poster');
  if (featured.posterUrl) {
    heroPoster.style.backgroundImage = `url(${featured.posterUrl})`;
  } else {
    const c = featured.colors || {};
    const bgColor = sanitizeColor(c.bg, '#1a1a1a');
    const primaryColor = sanitizeColor(c.primary, '#c41e3a');
    heroPoster.style.background = `linear-gradient(135deg, ${bgColor}, ${primaryColor})`;
  }
}

// ========== 渲染电影卡片横滑 ==========
function renderCarousel() {
  const carousel = $('movies-carousel');
  const filtered = state.movies.filter((m) => m.status === state.currentTab);

  if (filtered.length === 0) {
    carousel.innerHTML = '<div class="movies-carousel-empty">暂无电影</div>';
    return;
  }

  carousel.innerHTML = filtered
    .map((movie) => {
      const heatColor = getHeatColor(movie.heatScore);
      const heatBg =
        movie.heatScore >= HEAT_EXTREME_THRESHOLD
          ? 'rgba(231,76,60,.9)'
          : movie.heatScore >= HEAT_HOT_THRESHOLD
            ? 'rgba(230,126,34,.9)'
            : movie.heatScore >= HEAT_WARM_THRESHOLD
              ? 'rgba(241,196,15,.9)'
              : 'rgba(52,152,219,.9)';
      const c = movie.colors || {};
      const cardBgColor = sanitizeColor(c.bg, '#1a1a1a');
      const cardPrimaryColor = sanitizeColor(c.primary, '#c41e3a');
      const posterStyle = movie.posterUrl
        ? ''
        : `background: linear-gradient(135deg, ${cardBgColor}, ${cardPrimaryColor}88)`;
      const lazyAttr = movie.posterUrl ? ` data-src="${escapeHtml(movie.posterUrl)}"` : '';
      return `
        <div class="movie-card" data-movie-id="${movie.id}" tabindex="0" role="button" aria-label="${escapeHtml(movie.title)}">
          <div class="movie-card-bg" style="${posterStyle}"${lazyAttr}></div>
          <div class="movie-card-overlay"></div>
          <span class="movie-card-heat-badge" style="background:${heatBg}">热度 ${movie.heatScore}</span>
          <div class="movie-card-content">
            <h3 class="movie-card-title">${escapeHtml(movie.title)}</h3>
            <p class="movie-card-meta">${escapeHtml(movie.director)}</p>
          </div>
        </div>
      `;
    })
    .join('');

  // 绑定卡片点击
  carousel.querySelectorAll('.movie-card').forEach((card) => {
    card.onclick = () => openMovieDetail(card.dataset.movieId);
    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMovieDetail(card.dataset.movieId);
      }
    };
  });

  // 扫描电影卡片中的懒加载背景图
  lazyLoadAll();
}

// ========== 渲染排行榜 ==========
function renderRankings() {
  const boList = $('ranking-boxoffice');
  const socialList = $('ranking-social');

  function getPosterThumb(movieId) {
    const movie = state.movies.find((m) => m.id === movieId);
    if (movie && movie.posterUrl) {
      return `<div class="ranking-poster" data-src="${escapeHtml(movie.posterUrl)}"></div>`;
    }
    if (movie) {
      const c = movie.colors || {};
      const thumbBg = sanitizeColor(c.bg, '#1a1a1a');
      const thumbPrimary = sanitizeColor(c.primary, '#c41e3a');
      return `<div class="ranking-poster" style="background:linear-gradient(135deg,${thumbBg},${thumbPrimary})"></div>`;
    }
    return '<div class="ranking-poster"></div>';
  }

  if (state.ranking.boxOfficeRank.length === 0) {
    boList.innerHTML = '<li class="ranking-empty">暂无数据</li>';
  } else {
    boList.innerHTML = state.ranking.boxOfficeRank
      .map(
        (item) => `
        <li class="ranking-item" data-movie-id="${item.id}">
          <span class="ranking-rank rank-${item.rank <= 3 ? item.rank : 'normal'}">${item.rank}</span>
          ${getPosterThumb(item.id)}
          <span class="ranking-name">${escapeHtml(item.title)}</span>
          <span class="ranking-value">${formatBoxOffice(item.value)}</span>
        </li>
      `
      )
      .join('');
  }

  if (state.ranking.socialRank.length === 0) {
    socialList.innerHTML = '<li class="ranking-empty">暂无数据</li>';
  } else {
    socialList.innerHTML = state.ranking.socialRank
      .map(
        (item) => `
        <li class="ranking-item" data-movie-id="${item.id}">
          <span class="ranking-rank rank-${item.rank <= 3 ? item.rank : 'normal'}">${item.rank}</span>
          ${getPosterThumb(item.id)}
          <span class="ranking-name">${escapeHtml(item.title)}</span>
          <span class="ranking-value">${formatMentions(item.value)}</span>
        </li>
      `
      )
      .join('');
  }

  // 排行榜点击跳转
  document.querySelectorAll('.ranking-item').forEach((item) => {
    item.onclick = () => {
      if (item.dataset.movieId) openMovieDetail(item.dataset.movieId);
    };
  });

  // 扫描排行榜中的懒加载海报缩略图
  lazyLoadAll();
}

// ========== 电影详情面板 ==========
function openMovieDetail(movieId) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;

  state.currentMovie = movie;

  // 基础信息
  $('movie-detail-title').textContent = movie.title;
  $('movie-detail-en-title').textContent = movie.enTitle || '';
  $('movie-detail-meta').innerHTML =
    `导演 ${escapeHtml(movie.director)} · 上映 ${escapeHtml(movie.releaseDate)} · 票房 ${formatBoxOffice(movie.boxOffice)}`;
  $('movie-detail-heat').innerHTML =
    `<span style="color:${getHeatColor(movie.heatScore)}">● 热度 ${Number(movie.heatScore)}/100 · ${getHeatLabel(movie.heatScore)}</span>`;

  // 海报
  const posterEl = $('movie-detail-poster');
  if (movie.posterUrl) {
    posterEl.style.backgroundImage = `url(${movie.posterUrl})`;
  } else {
    const c = movie.colors || {};
    const detailBg = sanitizeColor(c.bg, '#1a1a1a');
    const detailPrimary = sanitizeColor(c.primary, '#c41e3a');
    const detailSecondary = sanitizeColor(c.secondary, '#2c3e50');
    posterEl.style.background = `linear-gradient(135deg, ${detailBg}, ${detailPrimary}, ${detailSecondary})`;
  }

  // DNA 雷达图
  drawDNARadar(movie, '');

  // DNA 对比下拉
  const select = $('movie-dna-compare-select');
  select.innerHTML =
    '<option value="">不对比</option>' +
    (movie.matchedDirectorIds || [])
      .map((id) => {
        const d = DIRECTORS.find((dir) => dir.id === id);
        return d
          ? `<option value="${escapeHtml(id)}">${escapeHtml(d.name)} (${Math.round((movie.matchScores[id] || 0) * 100)}%)</option>`
          : '';
      })
      .join('');

  // 色彩提取
  const palette = $('movie-color-palette');
  if (movie.colors) {
    palette.innerHTML = Object.entries(movie.colors)
      .map(([key, hex]) => {
        const safeHex = sanitizeColor(String(hex), '#1a1a1a');
        return `
        <div class="color-swatch" title="${escapeHtml(key)}: ${escapeHtml(safeHex)}">
          <div class="color-swatch-color" style="background:${safeHex}"></div>
          <span class="color-swatch-hex">${escapeHtml(safeHex)}</span>
        </div>
      `;
      })
      .join('');
  } else {
    palette.innerHTML = '<p class="movie-detail-empty">暂无色彩数据</p>';
  }

  // 导演匹配
  const matches = $('movie-director-matches');
  if (movie.matchedDirectorIds && movie.matchedDirectorIds.length > 0) {
    matches.innerHTML = movie.matchedDirectorIds
      .map((id) => {
        const d = DIRECTORS.find((dir) => dir.id === id);
        const score = movie.matchScores[id] || 0;
        return d
          ? `
          <div class="director-match-item">
            <span class="director-match-name">${escapeHtml(d.name)}</span>
            <div class="director-match-bar"><div class="director-match-fill" style="width:${score * 100}%"></div></div>
            <span class="director-match-score">${Math.round(score * 100)}%</span>
          </div>
        `
          : '';
      })
      .join('');
  } else {
    matches.innerHTML = '<p class="movie-detail-empty">暂无匹配数据</p>';
  }

  // 标志性场景
  const scenes = $('movie-detail-scenes');
  if (movie.signatureScenes && movie.signatureScenes.length > 0) {
    scenes.innerHTML =
      '<h3>标志性场景</h3><div class="movie-scenes-list">' +
      movie.signatureScenes.map((scene) => `<div class="movie-scene-item">${escapeHtml(scene)}</div>`).join('') +
      '</div>';
  } else {
    scenes.innerHTML = '';
  }

  // 初始化 DNA 滑块
  initDNASliders(movie);

  // 显示面板
  openModal('movie-detail-overlay');
  document.body.style.overflow = 'hidden';
}

function closeMovieDetail() {
  closeModal('movie-detail-overlay');
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

  const n = dims.length;
  const angleStep = (Math.PI * 2) / n;

  // 绘制网格
  drawDNAGrid(ctx, cx, cy, radius, n, angleStep);

  // 绘制电影 DNA
  if (movie.styleDNA) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const dim = dims[i];
      const val = valMaps[dim.key][movie.styleDNA[dim.key]] || 0.5;
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
    const director = DIRECTORS.find((d) => d.id === compareDirectorId);
    if (director && director.styleDNA) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const dim = dims[i];
        const val = valMaps[dim.key][director.styleDNA[dim.key]] || 0.5;
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
    ctx.fillText(dims[i].label, labelX, labelY);
  }
}

// ========== 选择电影进入生成流程 ==========
function selectMovieForGeneration(movieId) {
  const movie = state.movies.find((m) => m.id === movieId);
  state.selectedMovieId = movieId;
  state.customDNA = null;
  state.customColors = null;
  state.customPrompt = movie ? movie.stylePrompt : null;
  state.swapLabel = null;

  appState.selectedMovieId = movieId;
  appState.movieCustomDNA = null;
  appState.movieCustomColors = movie ? { ...movie.colors } : null;
  appState.movieCustomPrompt = movie ? movie.stylePrompt : null;
  appState.movieSwapLabel = null;

  closeMovieDetail();

  const inputPage = $('page-input');
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  inputPage.classList.add('active');

  showMovieTag(movieId);
  updateDirectorsBadge(movie);

  toast('已选择电影风格，输入文字后生成海报');
}

function updateDirectorsBadge(movie) {
  const badge = $('movie-style-badge');
  const titleEl = $('badge-movie-title');
  if (!badge || !titleEl) return;
  if (movie) {
    titleEl.textContent = `《${movie.title}》`;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function showMovieTag(movieId, label) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;

  let tag = $('movie-style-tag');
  if (!tag) {
    tag = document.createElement('div');
    tag.id = 'movie-style-tag';
    tag.className = 'movie-style-tag';
    const hero = $('page-input').querySelector('.input-hero');
    if (hero) hero.appendChild(tag);
  }

  const c = movie.colors || {};
  const displayLabel = label || movie.title;
  const tagBgColor = sanitizeColor(c.primary, '#c41e3a');
  const posterStyle = movie.posterUrl
    ? `background-image:url(${escapeHtml(movie.posterUrl)});background-size:cover;background-position:center`
    : `background:${tagBgColor}`;
  tag.innerHTML = `
      <div class="movie-tag-poster" style="${posterStyle}"></div>
      <div class="movie-tag-info">
        <span class="movie-tag-title">${escapeHtml(displayLabel)}</span>
        <span class="movie-tag-style">${escapeHtml(movie.visualStyle)}</span>
      </div>
      <button class="movie-tag-remove" data-action="clear-movie">✕</button>
    `;
  tag.style.display = 'flex';
}

function clearSelectedMovie() {
  state.selectedMovieId = null;
  state.customDNA = null;
  state.customColors = null;
  state.customPrompt = null;
  state.swapLabel = null;

  appState.selectedMovieId = null;
  appState.movieCustomDNA = null;
  appState.movieCustomColors = null;
  appState.movieCustomPrompt = null;
  appState.movieSwapLabel = null;

  const tag = $('movie-style-tag');
  if (tag) tag.style.display = 'none';

  const dirBadge = $('movie-style-badge');
  if (dirBadge) dirBadge.style.display = 'none';
}

// clearSelection 是 clearSelectedMovie 的别名（供外部调用）
function clearSelection() {
  clearSelectedMovie();
}

// ========== 导航 ==========
function navigateToMovies() {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $('page-movies').classList.add('active');
  if (state.movies.length === 0) loadMovies();
}

function getSelectedMovie() {
  const movieId = state.selectedMovieId || appState.selectedMovieId;
  if (!movieId) return null;
  return state.movies.find((m) => m.id === movieId);
}

function refreshMovies() {
  return loadMovies();
}

// ========== Phase 2: H4 如果换导演 ==========
function openDirectorSwap(movieId) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;

  state.swapDirectorId = null;
  state.swapRatio = 0.5;

  // 渲染导演选择网格
  const grid = $('director-swap-grid');
  grid.innerHTML = DIRECTORS.map(
    (d) => `
      <div class="swap-director-card" data-director-id="${d.id}" tabindex="0" role="button">
        <div class="swap-director-avatar" style="background:${d.colors.primary}"></div>
        <span class="swap-director-name">${escapeHtml(d.name)}</span>
      </div>
    `
  ).join('');

  grid.querySelectorAll('.swap-director-card').forEach((card) => {
    card.onclick = () => selectDirectorForSwap(card.dataset.directorId);
    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectDirectorForSwap(card.dataset.directorId);
      }
    };
  });

  $('director-swap-preview').style.display = 'none';
  openModal('director-swap-modal');
}

function closeDirectorSwap() {
  closeModal('director-swap-modal');
  state.swapDirectorId = null;
}

function selectDirectorForSwap(directorId) {
  state.swapDirectorId = directorId;
  document.querySelectorAll('.swap-director-card').forEach((c) => {
    c.classList.toggle('selected', c.dataset.directorId === directorId);
  });
  $('director-swap-preview').style.display = 'flex';
  updateSwapPreview();
}

function updateSwapPreview() {
  const movie = state.currentMovie;
  const director = DIRECTORS.find((d) => d.id === state.swapDirectorId);
  if (!movie || !director) return;

  state.swapRatio = parseInt($('swap-ratio').value) / 100;

  // 融合 DNA
  const blendedDNA = PosterEngine.blendDNAs(movie.styleDNA, director.styleDNA, state.swapRatio);
  const blendedColors = PosterEngine.blendColors(movie.colors, director.colors, state.swapRatio);

  // 绘制融合 DNA 雷达图
  drawSwapDNARadar(movie.styleDNA, director.styleDNA, blendedDNA);

  // 显示信息
  $('swap-info').innerHTML = `
      <div class="swap-combo-title">如果 <span class="swap-director-name">${escapeHtml(director.name)}</span> 拍《${escapeHtml(movie.title)}》</div>
      <div class="swap-blend-info">风格融合度 ${Math.round(state.swapRatio * 100)}% 导演 / ${Math.round((1 - state.swapRatio) * 100)}% 电影</div>
      <div class="swap-color-preview">
        ${Object.entries(blendedColors)
          .map(([k, hex]) => {
            const safeHex = sanitizeColor(String(hex), '#1a1a1a');
            return `<div class="swap-color-dot" style="background:${safeHex}" title="${escapeHtml(k)}: ${escapeHtml(safeHex)}"></div>`;
          })
          .join('')}
      </div>
    `;
}

function drawSwapDNARadar(movieDNA, directorDNA, blendedDNA) {
  const canvas = $('swap-dna-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width,
    h = canvas.height,
    cx = w / 2,
    cy = h / 2;
  const radius = Math.min(w, h) / 2 - 35;
  ctx.clearRect(0, 0, w, h);

  const n = dims.length,
    angleStep = (Math.PI * 2) / n;

  // 网格
  drawDNAGrid(ctx, cx, cy, radius, n, angleStep);

  function drawDNA(dna, fill, stroke, dash) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = valMaps[dims[i].key][dna[dims[i].key]] || 0.5;
      const a = i * angleStep - Math.PI / 2;
      const x = cx + Math.cos(a) * (radius * v),
        y = cy + Math.sin(a) * (radius * v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = dash ? 1.5 : 2;
    if (dash) ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawDNA(movieDNA, null, 'rgba(127,196,171,0.3)', true);
  drawDNA(directorDNA, null, 'rgba(245,240,232,0.2)', true);
  drawDNA(blendedDNA, 'rgba(127,196,171,0.2)', 'rgba(127,196,171,0.9)', false);

  // 标签
  ctx.font = '10px "Noto Sans SC", sans-serif';
  ctx.fillStyle = 'rgba(245,240,232,0.5)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a = i * angleStep - Math.PI / 2;
    ctx.fillText(dims[i].label, cx + Math.cos(a) * (radius + 18), cy + Math.sin(a) * (radius + 18));
  }
}

function generateSwappedPoster() {
  const movie = state.currentMovie;
  const director = DIRECTORS.find((d) => d.id === state.swapDirectorId);
  if (!movie || !director) return;

  const blendedDNA = PosterEngine.blendDNAs(movie.styleDNA, director.styleDNA, state.swapRatio);
  const blendedColors = PosterEngine.blendColors(movie.colors, director.colors, state.swapRatio);
  const blendedPrompt = PosterEngine.blendPrompts(movie.stylePrompt, director.promptCore, state.swapRatio);
  const swapLabel = `如果${director.name}拍《${movie.title}》`;

  state.selectedMovieId = movie.id;
  state.customDNA = blendedDNA;
  state.customColors = blendedColors;
  state.customPrompt = blendedPrompt;
  state.swapLabel = swapLabel;

  appState.selectedMovieId = movie.id;
  appState.movieCustomDNA = { ...blendedDNA };
  appState.movieCustomColors = { ...blendedColors };
  appState.movieCustomPrompt = blendedPrompt;
  appState.movieSwapLabel = swapLabel;

  closeDirectorSwap();
  closeMovieDetail();

  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $('page-input').classList.add('active');
  showMovieTag(movie.id, swapLabel);
  updateDirectorsBadgeWithLabel(swapLabel);
  toast(`已选择：${swapLabel}`);
}

function updateDirectorsBadgeWithLabel(label) {
  const badge = $('movie-style-badge');
  const titleEl = $('badge-movie-title');
  if (!badge || !titleEl) return;
  if (label) {
    titleEl.textContent = `「${label}」`;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ========== Phase 2: H7 电影金句卡 ==========
// ========== 创意工具弹窗：打开 + Tab 切换 ==========
function openCreativeModal(tab) {
  openModal('creative-modal');
  switchCreativeTab(tab);
}

function switchCreativeTab(tab) {
  document.querySelectorAll('.creative-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.creativeTab === tab);
  });
  document.querySelectorAll('.creative-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.creativePanel === tab);
  });
}

function openQuoteCardGenerator(movieId) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie || !movie.iconicQuotes || movie.iconicQuotes.length === 0) {
    toast('该电影暂无金句数据');
    return;
  }

  const list = $('quote-list');
  list.innerHTML = movie.iconicQuotes
    .map(
      (q, i) => `
      <div class="quote-item ${i === 0 ? 'selected' : ''}" data-quote-index="${i}" tabindex="0" role="button">
        <span class="quote-mark">"</span>
        <span class="quote-text">${escapeHtml(q)}</span>
      </div>
    `
    )
    .join('');

  list.querySelectorAll('.quote-item').forEach((item) => {
    item.onclick = () => {
      list.querySelectorAll('.quote-item').forEach((i) => i.classList.remove('selected'));
      item.classList.add('selected');
      generateQuoteCard(state.quoteCardFormat);
    };
  });

  $('quote-card-preview').style.display = 'none';
  openCreativeModal('quote');
}

function closeQuoteCard() {
  closeModal('creative-modal');
  safeRevokeUrl(state.quoteCardDataUrl);
  state.quoteCardDataUrl = null;
}

async function generateQuoteCard(format) {
  const movie = state.currentMovie;
  if (!movie) return;

  state.quoteCardFormat = format || 'square';
  const selected = $('quote-list').querySelector('.quote-item.selected');
  if (!selected) return;
  const quoteIndex = parseInt(selected.dataset.quoteIndex);
  const quote = movie.iconicQuotes[quoteIndex];

  try {
    const result = await PosterEngine.generateQuoteCard({
      quote,
      movieTitle: movie.title,
      movieEnTitle: movie.enTitle,
      colors: movie.colors,
      fontFamily: movie.fontFamily,
      format: state.quoteCardFormat,
    });

    safeRevokeUrl(state.quoteCardDataUrl);
    state.quoteCardDataUrl = result.dataUrl;
    $('quote-card-img').src = result.dataUrl;
    $('quote-card-preview').style.display = 'block';

    // 更新按钮状态
    $('btn-quote-square').classList.toggle('active', state.quoteCardFormat === 'square');
    $('btn-quote-vertical').classList.toggle('active', state.quoteCardFormat === 'vertical');
  } catch (e) {
    logger.error('[金句卡] 生成失败:', e);
    toast('金句卡生成失败');
  }
}

function downloadQuoteCard() {
  if (!state.quoteCardDataUrl) {
    toast('请先生成金句卡');
    return;
  }
  const movie = state.currentMovie;
  const a = document.createElement('a');
  a.href = state.quoteCardDataUrl;
  a.download = `${movie ? movie.title : 'movie'}-quote-card.png`;
  a.click();
}

// ========== Phase 2: D3 导演盲盒 ==========
function openBlindBox() {
  const result = $('blindbox-result');
  const card = $('blindbox-card');
  const reveal = $('blindbox-reveal');
  const detail = $('blindbox-detail');

  card.style.display = 'none';
  result.style.display = 'block';
  detail.style.display = 'none';

  // 开盒动画
  reveal.innerHTML =
    '<div class="blindbox-anim"><svg class="ico"><use href="#i-clapper"/></svg><svg class="ico"><use href="#i-sparkles"/></svg><svg class="ico"><use href="#i-film"/></svg><svg class="ico"><use href="#i-palette"/></svg><svg class="ico"><use href="#i-sparkles"/></svg></div>';
  reveal.className = 'blindbox-reveal animating';

  setTimeout(() => {
    // 随机选择
    const randomDirector = DIRECTORS[Math.floor(Math.random() * DIRECTORS.length)];
    const randomMovie = state.movies[Math.floor(Math.random() * state.movies.length)];
    if (!randomDirector || !randomMovie) return;

    state.blindBoxCombo = { director: randomDirector, movie: randomMovie };

    // 融合 DNA
    const blendedDNA = PosterEngine.blendDNAs(randomMovie.styleDNA, randomDirector.styleDNA, 0.5);
    const blendedColors = PosterEngine.blendColors(randomMovie.colors, randomDirector.colors, 0.5);

    reveal.style.display = 'none';
    detail.style.display = 'flex';
    detail.style.flexDirection = 'column';
    detail.style.alignItems = 'center';
    detail.style.gap = '16px';

    $('blindbox-combo').innerHTML = `
        <div class="blindbox-combo-title">惊喜组合</div>
        <div class="blindbox-combo-names">
          <span class="combo-movie">${escapeHtml(randomMovie.title)}</span>
          <span class="combo-x">×</span>
          <span class="combo-director">${escapeHtml(randomDirector.name)}</span>
        </div>
        <div class="blindbox-combo-style">${escapeHtml(randomMovie.visualStyle)} + ${escapeHtml(randomDirector.styleName || randomDirector.name + '风格')}</div>
        <div class="blindbox-color-dots">
          ${Object.entries(blendedColors)
            .map(([k, hex]) => {
              const safeHex = sanitizeColor(String(hex), '#1a1a1a');
              return `<div class="swap-color-dot" style="background:${safeHex}"></div>`;
            })
            .join('')}
        </div>
      `;

    // 绘制 DNA
    drawBlindBoxDNA(randomMovie.styleDNA, randomDirector.styleDNA, blendedDNA);
  }, 1500);
}

function drawBlindBoxDNA(movieDNA, directorDNA, blendedDNA) {
  const canvas = $('blindbox-dna-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width,
    h = canvas.height,
    cx = w / 2,
    cy = h / 2;
  const radius = Math.min(w, h) / 2 - 30;
  ctx.clearRect(0, 0, w, h);

  const n = dims.length,
    angleStep = (Math.PI * 2) / n;

  drawDNAGrid(ctx, cx, cy, radius, n, angleStep);

  // 融合 DNA
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const v = valMaps[dims[i].key][blendedDNA[dims[i].key]] || 0.5;
    const a = i * angleStep - Math.PI / 2;
    const x = cx + Math.cos(a) * (radius * v),
      y = cy + Math.sin(a) * (radius * v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(127,196,171,0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(127,196,171,0.9)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '9px "Noto Sans SC", sans-serif';
  ctx.fillStyle = 'rgba(245,240,232,0.5)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a = i * angleStep - Math.PI / 2;
    ctx.fillText(dims[i].label, cx + Math.cos(a) * (radius + 15), cy + Math.sin(a) * (radius + 15));
  }
}

function generateBlindBoxPoster() {
  if (!state.blindBoxCombo) return;
  const { director, movie } = state.blindBoxCombo;

  const blendedDNA = PosterEngine.blendDNAs(movie.styleDNA, director.styleDNA, 0.5);
  const blendedColors = PosterEngine.blendColors(movie.colors, director.colors, 0.5);
  const blendedPrompt = PosterEngine.blendPrompts(movie.stylePrompt, director.promptCore, 0.5);
  const blindLabel = `盲盒：${director.name} × 《${movie.title}》`;

  state.selectedMovieId = movie.id;
  state.customDNA = blendedDNA;
  state.customColors = blendedColors;
  state.customPrompt = blendedPrompt;
  state.swapLabel = blindLabel;

  appState.selectedMovieId = movie.id;
  appState.movieCustomDNA = { ...blendedDNA };
  appState.movieCustomColors = { ...blendedColors };
  appState.movieCustomPrompt = blendedPrompt;
  appState.movieSwapLabel = blindLabel;

  $('blindbox-result').style.display = 'none';
  $('blindbox-card').style.display = 'flex';

  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $('page-input').classList.add('active');
  showMovieTag(movie.id, blindLabel);
  updateDirectorsBadgeWithLabel(blindLabel);
  toast(`盲盒组合：${director.name} × 《${movie.title}》`);
}

// ========== Phase 2: D2 风格参数微调 ==========
function initDNASliders(movie) {
  const sliderList = $('dna-slider-list');
  const dims = [
    { key: 'colorTemperature', label: '色温', options: ['cool', 'neutral', 'warm'], labels: ['冷', '中', '暖'] },
    { key: 'saturation', label: '饱和度', options: ['low', 'medium', 'high'], labels: ['低', '中', '高'] },
    { key: 'contrast', label: '对比度', options: ['low', 'medium', 'high'], labels: ['低', '中', '高'] },
    {
      key: 'compositionType',
      label: '构图',
      options: ['symmetric', 'centered', 'asymmetric', 'dynamic'],
      labels: ['对称', '居中', '不对称', '动态'],
    },
    {
      key: 'lightingType',
      label: '光影',
      options: ['natural', 'high-key', 'low-key', 'dramatic'],
      labels: ['自然', '高调', '低调', '戏剧'],
    },
    { key: 'scale', label: '尺度', options: ['intimate', 'medium', 'monumental'], labels: ['亲密', '中等', '宏大'] },
    { key: 'pace', label: '节奏', options: ['static', 'dynamic'], labels: ['静态', '动态'] },
    {
      key: 'texture',
      label: '质感',
      options: ['smooth', 'digital', 'grainy', 'painterly', 'handdrawn'],
      labels: ['平滑', '数字', '颗粒', '绘画', '手绘'],
    },
  ];

  const currentDNA = movie.styleDNA || {};
  state.customDNA = { ...currentDNA };

  sliderList.innerHTML = dims
    .map((dim) => {
      const currentVal = currentDNA[dim.key] || dim.options[0];
      const currentIdx = dim.options.indexOf(currentVal);
      return `
        <div class="dna-slider-row" data-dim="${escapeHtml(dim.key)}">
          <label class="dna-slider-label">${escapeHtml(dim.label)}</label>
          <div class="dna-slider-options">
            ${dim.options
              .map(
                (opt, i) => `
              <button class="dna-option-btn ${i === currentIdx ? 'active' : ''}" data-value="${escapeHtml(opt)}">${escapeHtml(dim.labels[i])}</button>
            `
              )
              .join('')}
          </div>
        </div>
      `;
    })
    .join('');

  // 绑定按钮
  sliderList.querySelectorAll('.dna-slider-row').forEach((row) => {
    const dimKey = row.dataset.dim;
    row.querySelectorAll('.dna-option-btn').forEach((btn) => {
      btn.onclick = () => {
        row.querySelectorAll('.dna-option-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.customDNA[dimKey] = btn.dataset.value;
        // 实时更新雷达图
        if (state.currentMovie) {
          drawDNARadar({ ...state.currentMovie, styleDNA: state.customDNA }, '');
        }
      };
    });
  });

  $('movie-dna-sliders').style.display = 'block';
}

function applyCustomDNA() {
  if (!state.currentMovie || !state.customDNA) return;
  const movie = state.currentMovie;
  const customLabel = `自定义风格 · ${movie.title}`;

  state.selectedMovieId = movie.id;
  state.customDNA = { ...state.customDNA };
  state.customColors = movie.colors;
  state.customPrompt = movie.stylePrompt;
  state.swapLabel = customLabel;

  appState.selectedMovieId = movie.id;
  appState.movieCustomDNA = { ...state.customDNA };
  appState.movieCustomColors = { ...movie.colors };
  appState.movieCustomPrompt = movie.stylePrompt;
  appState.movieSwapLabel = customLabel;

  closeMovieDetail();

  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $('page-input').classList.add('active');
  showMovieTag(movie.id, customLabel);
  updateDirectorsBadgeWithLabel(customLabel);
  toast('已应用自定义风格，输入文字后生成海报');
}

// ========== Phase 3: H2 名场面重绘 ==========
function openSceneRecreate(movieId) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;

  if (!movie.signatureScenes || movie.signatureScenes.length === 0) {
    toast('该电影暂无标志性场景数据');
    return;
  }

  state.selectedScene = null;
  safeRevokeUrl(state.scenePosterDataUrl);
  state.scenePosterDataUrl = null;

  const list = $('scene-list');
  list.innerHTML = movie.signatureScenes
    .map(
      (scene, i) => `
      <div class="scene-item ${i === 0 ? 'selected' : ''}" data-scene-index="${i}" tabindex="0" role="button">
        <span class="scene-num">${i + 1}</span>
        <span class="scene-text">${escapeHtml(scene)}</span>
      </div>
    `
    )
    .join('');

  list.querySelectorAll('.scene-item').forEach((item) => {
    item.onclick = () => {
      list.querySelectorAll('.scene-item').forEach((i) => i.classList.remove('selected'));
      item.classList.add('selected');
      state.selectedScene = movie.signatureScenes[parseInt(item.dataset.sceneIndex)];
      $('scene-input-area').style.display = 'block';
      $('scene-preview').style.display = 'none';
      $('scene-description').value = '';
      $('scene-custom-title').value = '';
    };
  });

  // 默认选第一个
  state.selectedScene = movie.signatureScenes[0];
  $('scene-input-area').style.display = 'block';
  $('scene-preview').style.display = 'none';
  openCreativeModal('scene');
}

function closeSceneRecreate() {
  closeModal('creative-modal');
  state.selectedScene = null;
  state.scenePosterDataUrl = null;
}

async function generateScenePoster() {
  const movie = state.currentMovie;
  if (!movie || !state.selectedScene) return;

  const description = $('scene-description').value.trim();
  if (!description) {
    toast('请输入场景描述');
    return;
  }

  const customTitle = $('scene-custom-title').value.trim();

  try {
    const result = await PosterEngine.generateSceneRecreation({
      sceneDescription: description,
      movieId: movie.id,
      movieTitle: movie.title,
      originalScene: state.selectedScene,
      colors: movie.colors,
      fontFamily: movie.fontFamily,
      stylePrompt: movie.stylePrompt,
      styleDNA: movie.styleDNA,
      customTitle: customTitle || undefined,
      format: 'vertical',
    });

    safeRevokeUrl(state.scenePosterDataUrl);
    state.scenePosterDataUrl = result.dataUrl;
    $('scene-preview-img').src = result.dataUrl;
    $('scene-preview').style.display = 'flex';
    $('scene-input-area').style.display = 'none';
  } catch (e) {
    logger.error('[名场面] 生成失败:', e);
    toast('名场面重绘失败');
  }
}

function downloadScenePoster() {
  if (!state.scenePosterDataUrl) return;
  const movie = state.currentMovie;
  const a = document.createElement('a');
  a.href = state.scenePosterDataUrl;
  a.download = `${movie ? movie.title : 'movie'}-scene.png`;
  a.click();
}

// ========== Phase 3: D4 海报连环画 ==========
function openComicStrip(movieId) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;

  // 重置为 3 个场景
  state.comicSceneCount = 3;
  const container = $('comic-scenes');
  container.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    container.appendChild(createComicSceneRow(i));
  }

  $('comic-preview').style.display = 'none';
  openCreativeModal('comic');
}

function createComicSceneRow(index) {
  const row = document.createElement('div');
  row.className = 'comic-scene-row';
  row.dataset.scene = index;
  row.innerHTML = `
      <span class="comic-scene-num">${index + 1}</span>
      <input type="text" class="comic-scene-title" placeholder="场景标题（如：${escapeHtml(['相遇', '冲突', '结局', '余韵'][index] || '场景' + (index + 1))}）">
      <textarea class="comic-scene-text" placeholder="描述这个场景..." rows="2"></textarea>
      ${index >= 3 ? '<button class="btn-comic-remove" data-action="remove-scene">✕</button>' : ''}
    `;
  return row;
}

function addComicScene() {
  const container = $('comic-scenes');
  const count = container.children.length;
  if (count >= 4) {
    toast('最多 4 个场景');
    return;
  }
  container.appendChild(createComicSceneRow(count));
  state.comicSceneCount = count + 1;
}

function closeComicStrip() {
  closeModal('creative-modal');
  safeRevokeUrl(state.comicStripDataUrl);
  state.comicStripDataUrl = null;
}

async function generateComicStripPoster() {
  const movie = state.currentMovie;
  if (!movie) return;

  const rows = $('comic-scenes').querySelectorAll('.comic-scene-row');
  const scenes = [];
  rows.forEach((row) => {
    const title = row.querySelector('.comic-scene-title').value.trim();
    const text = row.querySelector('.comic-scene-text').value.trim();
    if (text) scenes.push({ title: title || `场景 ${scenes.length + 1}`, text });
  });

  if (scenes.length < 2) {
    toast('至少需要 2 个场景');
    return;
  }

  try {
    const result = await PosterEngine.generateComicStrip({
      scenes,
      movieId: movie.id,
      colors: movie.colors,
      fontFamily: movie.fontFamily,
      stylePrompt: movie.stylePrompt,
    });

    safeRevokeUrl(state.comicStripDataUrl);
    state.comicStripDataUrl = result.dataUrl;
    $('comic-preview-img').src = result.dataUrl;
    $('comic-preview').style.display = 'flex';
  } catch (e) {
    logger.error('[连环画] 生成失败:', e);
    toast('连环画生成失败');
  }
}

function downloadComicStrip() {
  if (!state.comicStripDataUrl) return;
  const movie = state.currentMovie;
  const a = document.createElement('a');
  a.href = state.comicStripDataUrl;
  a.download = `${movie ? movie.title : 'movie'}-comic-strip.png`;
  a.click();
}

// ========== Phase 3: D6 情绪推荐电影 ==========
function recommendMoviesByEmotion() {
  const text = $('emotion-rec-text').value.trim();
  if (!text) {
    toast('请输入你的心情');
    return;
  }

  // 情绪关键词映射到 DNA 维度
  const emotionMap = {
    孤独: { colorTemperature: 'cool', saturation: 'low', contrast: 'low', pace: 'static' },
    温暖: { colorTemperature: 'warm', saturation: 'medium', contrast: 'low', pace: 'static' },
    热血: { colorTemperature: 'warm', saturation: 'high', contrast: 'high', pace: 'dynamic' },
    悲伤: { colorTemperature: 'cool', saturation: 'low', contrast: 'medium', pace: 'static' },
    快乐: { colorTemperature: 'warm', saturation: 'high', contrast: 'medium', pace: 'dynamic' },
    紧张: { colorTemperature: 'neutral', saturation: 'medium', contrast: 'high', pace: 'dynamic' },
    宁静: { colorTemperature: 'cool', saturation: 'low', contrast: 'low', pace: 'static' },
    愤怒: { colorTemperature: 'warm', saturation: 'high', contrast: 'high', pace: 'dynamic' },
    怀旧: { colorTemperature: 'warm', saturation: 'low', contrast: 'medium', pace: 'static' },
    神秘: { colorTemperature: 'cool', saturation: 'medium', contrast: 'high', pace: 'dynamic' },
  };

  // 查找匹配的情绪
  let targetDNA = null;
  for (const [keyword, dna] of Object.entries(emotionMap)) {
    if (text.includes(keyword)) {
      targetDNA = dna;
      break;
    }
  }

  // 如果没有精确匹配，用通用映射
  if (!targetDNA) {
    if (['开心', '高兴', '兴奋'].some((k) => text.includes(k))) {
      targetDNA = emotionMap['快乐'];
    } else if (['难过', '伤心', '哭'].some((k) => text.includes(k))) {
      targetDNA = emotionMap['悲伤'];
    } else if (['怕', '恐惧', '害怕'].some((k) => text.includes(k))) {
      targetDNA = emotionMap['紧张'];
    } else {
      targetDNA = { colorTemperature: 'neutral', saturation: 'medium', contrast: 'medium', pace: 'dynamic' };
    }
  }

  // 计算每部电影的匹配度
  // 复用顶部导入的 valMaps（DNA_VALUE_MAPS），避免本地重复定义造成变量遮蔽
  const scored = state.movies
    .map((movie) => {
      if (!movie.styleDNA) return { movie, score: 0 };
      let diff = 0,
        count = 0;
      Object.keys(targetDNA).forEach((key) => {
        const movieVal = valMaps[key][movie.styleDNA[key]] || 0.5;
        const targetVal = valMaps[key][targetDNA[key]] || 0.5;
        diff += Math.abs(movieVal - targetVal);
        count++;
      });
      const score = count > 0 ? Math.round((1 - diff / count) * 100) : 0;
      return { movie, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // 渲染结果
  const results = $('emotion-rec-results');
  results.innerHTML = scored
    .map((item, i) => {
      const m = item.movie;
      const heatColor = getHeatColor(m.heatScore);
      return `
        <div class="emotion-rec-card" data-movie-id="${escapeHtml(m.id)}">
          <div class="emotion-rec-rank">${i + 1}</div>
          <div class="emotion-rec-info">
            <span class="emotion-rec-movie-title">${escapeHtml(m.title)}</span>
            <span class="emotion-rec-movie-meta">${escapeHtml(m.director)} · ${escapeHtml(m.visualStyle)}</span>
          </div>
          <div class="emotion-rec-score-bar">
            <div class="emotion-rec-score-fill" style="width:${item.score}%;background:${heatColor}"></div>
          </div>
          <span class="emotion-rec-score-text">${item.score}%</span>
        </div>
      `;
    })
    .join('');

  results.style.display = 'block';

  // 绑定点击
  results.querySelectorAll('.emotion-rec-card').forEach((card) => {
    card.onclick = () => openMovieDetail(card.dataset.movieId);
  });
}

// ========== Phase 4: X1 角色二创 ==========
function openCharacterMeme(movieId) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;
  safeRevokeUrl(state.memeDataUrl);
  state.memeDataUrl = null;
  state.memeType = 'dialogue';
  $('meme-character-name').value = '';
  $('meme-text').value = '';
  $('meme-preview').style.display = 'none';
  document.querySelectorAll('.meme-type-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('.meme-type-btn[data-type="dialogue"]').classList.add('active');
  openCreativeModal('meme');
}

function closeCharacterMeme() {
  closeModal('creative-modal');
  safeRevokeUrl(state.memeDataUrl);
  state.memeDataUrl = null;
}

async function generateMemePoster() {
  const movie = state.currentMovie;
  if (!movie) return;
  const characterName = $('meme-character-name').value.trim();
  const memeText = $('meme-text').value.trim();
  if (!characterName || !memeText) {
    toast('请输入角色名和二创内容');
    return;
  }
  const activeBtn = document.querySelector('.meme-type-btn.active');
  state.memeType = activeBtn ? activeBtn.dataset.type : 'dialogue';

  try {
    const result = await PosterEngine.generateCharacterMeme({
      movieId: movie.id,
      characterName,
      memeText,
      memeType: state.memeType,
      colors: movie.colors,
      fontFamily: movie.fontFamily,
    });
    safeRevokeUrl(state.memeDataUrl);
    state.memeDataUrl = result.dataUrl;
    $('meme-preview-img').src = result.dataUrl;
    $('meme-preview').style.display = 'flex';
  } catch (e) {
    logger.error('[角色二创] 生成失败:', e);
    toast('角色二创生成失败');
  }
}

function downloadMemePoster() {
  if (!state.memeDataUrl) return;
  const movie = state.currentMovie;
  const a = document.createElement('a');
  a.href = state.memeDataUrl;
  a.download = `${movie ? movie.title : 'movie'}-meme.png`;
  a.click();
}

// ========== Phase 4: X4 竞猜海报 ==========
function openGuessPoster(movieId) {
  const movie = state.movies.find((m) => m.id === movieId);
  if (!movie) return;
  safeRevokeUrl(state.guessDataUrl);
  state.guessDataUrl = null;
  state.guessLevel = 2;
  $('guess-preview').style.display = 'none';
  $('guess-answer').style.display = 'none';
  document.querySelectorAll('.guess-level-btn').forEach((b) => b.classList.remove('active'));
  document.querySelector('.guess-level-btn[data-level="2"]').classList.add('active');
  openCreativeModal('guess');
}

function closeGuessPoster() {
  closeModal('creative-modal');
  safeRevokeUrl(state.guessDataUrl);
  state.guessDataUrl = null;
}

async function generateGuessPoster() {
  const movie = state.currentMovie;
  if (!movie) return;
  const activeBtn = document.querySelector('.guess-level-btn.active');
  state.guessLevel = activeBtn ? parseInt(activeBtn.dataset.level) : 2;

  try {
    const result = await PosterEngine.generateGuessPoster({
      movieId: movie.id,
      colors: movie.colors,
      fontFamily: movie.fontFamily,
      stylePrompt: movie.stylePrompt,
      hintLevel: state.guessLevel,
    });
    safeRevokeUrl(state.guessDataUrl);
    state.guessDataUrl = result.dataUrl;
    $('guess-preview-img').src = result.dataUrl;
    $('guess-preview').style.display = 'flex';
    $('guess-answer').style.display = 'none';
    $('guess-answer-text').textContent = movie.title;
  } catch (e) {
    logger.error('[竞猜海报] 生成失败:', e);
    toast('竞猜海报生成失败');
  }
}

function revealGuessAnswer() {
  $('guess-answer').style.display = 'flex';
}

function downloadGuessPoster() {
  if (!state.guessDataUrl) return;
  const a = document.createElement('a');
  a.href = state.guessDataUrl;
  a.download = 'guess-the-movie.png';
  a.click();
}

// ========== Phase 4: H3 每周挑战赛 ==========
function loadChallenge() {
  // 本地模拟挑战赛数据
  const themes = [
    { name: '赛博朋克之夜', desc: '用霓虹光影诠释未来都市的孤独', movieHint: '银翼杀手风格' },
    { name: '水墨江湖', desc: '东方水墨美学遇上武侠豪情', movieHint: '张艺谋风格' },
    { name: '末日余晖', desc: '废墟之上最后一抹暖阳', movieHint: '麦卡锡风格' },
    { name: '童年记忆', desc: '用温暖色调重现记忆中的夏天', movieHint: '宫崎骏风格' },
  ];
  const weekIdx = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % themes.length;
  const theme = themes[weekIdx];
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + (7 - deadline.getDay()));

  state.challengeData = {
    theme,
    deadline,
    participants: 128 + Math.floor(Math.random() * 200),
    works: 56 + Math.floor(Math.random() * 100),
    leaderboard: [
      { rank: 1, name: '光影魔术手', score: 985, works: 12 },
      { rank: 2, name: '胶片诗人', score: 920, works: 10 },
      { rank: 3, name: '色彩炼金术', score: 880, works: 8 },
      { rank: 4, name: '构图大师', score: 820, works: 9 },
      { rank: 5, name: '情绪捕手', score: 780, works: 7 },
    ],
  };

  $('challenge-theme-name').textContent = theme.name;
  $('challenge-theme-desc').textContent = theme.desc;
  $('challenge-deadline').textContent = `截止：${deadline.getMonth() + 1}月${deadline.getDate()}日`;
  $('challenge-participants').textContent = state.challengeData.participants;
  $('challenge-works').textContent = state.challengeData.works;

  const lbList = $('challenge-lb-list');
  lbList.innerHTML = state.challengeData.leaderboard
    .map(
      (item) => `
      <div class="challenge-lb-item">
        <span class="challenge-lb-rank rank-${item.rank <= 3 ? item.rank : 'normal'}">${item.rank}</span>
        <span class="challenge-lb-name">${escapeHtml(item.name)}</span>
        <span class="challenge-lb-works">${item.works}件作品</span>
        <span class="challenge-lb-score">${item.score}分</span>
      </div>
    `
    )
    .join('');
}

function joinChallenge() {
  if (!state.challengeData) loadChallenge();
  const theme = state.challengeData.theme;
  toast(`已加入「${theme.name}」挑战！输入文字开始创作`);

  // 跳转到输入页
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  $('page-input').classList.add('active');

  // 显示挑战标签
  let tag = $('movie-style-tag');
  if (!tag) {
    tag = document.createElement('div');
    tag.id = 'movie-style-tag';
    tag.className = 'movie-style-tag';
    const hero = $('page-input').querySelector('.input-hero');
    if (hero) hero.appendChild(tag);
  }
  tag.innerHTML = `
      <div class="movie-tag-poster" style="background:var(--miya)"></div>
      <div class="movie-tag-info">
        <span class="movie-tag-title"><svg class="ico"><use href="#i-trophy"/></svg> 挑战赛：${theme.name}</span>
        <span class="movie-tag-style">${theme.desc}</span>
      </div>
      <button class="movie-tag-remove" data-action="clear-movie">✕</button>
    `;
  tag.style.display = 'flex';
}

// ========== Phase 4: H6 赛季面板 ==========
function loadSeason() {
  renderSeason('current');
}

function renderSeason(tab) {
  if (tab === 'current') {
    const now = new Date();
    const seasonEnd = new Date(now.getFullYear(), 8, 1); // 9月1日结束
    const daysLeft = Math.ceil((seasonEnd - now) / (24 * 60 * 60 * 1000));

    $('season-name').textContent = `${now.getFullYear()} 夏季赛`;
    $('season-remaining').textContent = `${daysLeft} 天`;
    $('season-my-rank').textContent = '未参与';
    $('season-my-score').textContent = '0';

    const rewards = [
      { rank: '冠军', reward: '限定金色徽章 + 1000积分', desc: '赛季总积分第1名' },
      { rank: '前三', reward: '稀有徽章 + 500积分', desc: '赛季总积分前3名' },
      { rank: '前十', reward: '精选徽章 + 300积分', desc: '赛季总积分前10名' },
      { rank: '参与奖', reward: '参与徽章 + 50积分', desc: '至少提交3件作品' },
    ];

    $('season-reward-list').innerHTML = rewards
      .map(
        (r) => `
        <div class="season-reward-item">
          <span class="season-reward-rank">${escapeHtml(r.rank)}</span>
          <span class="season-reward-name">${escapeHtml(r.reward)}</span>
          <span class="season-reward-desc">${escapeHtml(r.desc)}</span>
        </div>
      `
      )
      .join('');
  } else {
    const history = [
      { name: '2026 春季赛', champion: '光影魔术手', participants: 856 },
      { name: '2025 冬季赛', champion: '胶片诗人', participants: 1024 },
      { name: '2025 秋季赛', champion: '色彩炼金术', participants: 732 },
    ];

    $('season-body').innerHTML = `
        <div class="season-history-list">
          ${history
            .map(
              (s) => `
            <div class="season-history-item">
              <div class="season-history-info">
                <span class="season-history-name">${escapeHtml(s.name)}</span>
                <span class="season-history-champion"><svg class="ico"><use href="#i-trophy"/></svg> 冠军：${escapeHtml(s.champion)}</span>
                <span class="season-history-participants">${s.participants} 人参与</span>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `;
  }
}

export {
  init,
  state,
  getServerMovies,
  navigateToMovies,
  openMovieDetail,
  closeMovieDetail,
  selectMovieForGeneration,
  getSelectedMovie,
  clearSelectedMovie,
  refreshMovies,
  openDirectorSwap,
  selectDirectorForSwap,
  closeDirectorSwap,
  generateSwappedPoster,
  openQuoteCardGenerator,
  closeQuoteCard,
  generateQuoteCard,
  downloadQuoteCard,
  openBlindBox,
  generateBlindBoxPoster,
  initDNASliders,
  applyCustomDNA,
  openSceneRecreate,
  closeSceneRecreate,
  generateScenePoster,
  downloadScenePoster,
  openComicStrip,
  closeComicStrip,
  addComicScene,
  generateComicStripPoster,
  downloadComicStrip,
  recommendMoviesByEmotion,
  openCharacterMeme,
  closeCharacterMeme,
  generateMemePoster,
  downloadMemePoster,
  openGuessPoster,
  closeGuessPoster,
  generateGuessPoster,
  revealGuessAnswer,
  downloadGuessPoster,
  loadChallenge,
  joinChallenge,
  loadSeason,
  renderSeason,
};
