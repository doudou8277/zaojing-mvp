/**
 * 预告片模块
 * 从 app.js 提取 — 负责电影预告片模拟播放
 */
import { $, state, toast, escapeHtml, openModal, closeModal, openResultToolsModal } from '../shared.js';
import { DIRECTORS } from '../data.js';

function playTrailer() {
  const current = state.posterResults[state.currentPosterIndex];
  if (!current) {
    toast('暂无海报信息');
    return;
  }

  const director = DIRECTORS.find((d) => d.id === current.directorId);
  const title = state.currentTitle || current.title || '无题';
  const directorName = director ? director.name : '未知导演';
  const quote = current.quote || '';
  const emotion = state.emotionAnalysis ? state.emotionAnalysis.primaryEmotion : '治愈';
  const keywords =
    state.emotionAnalysis && state.emotionAnalysis.keywords
      ? state.emotionAnalysis.keywords
      : director
        ? director.keywords
        : ['光影', '情绪', '故事'];
  const inputText = (state.inputText || '').substring(0, 20);

  openResultToolsModal('trailer');
  const sceneEl = $('trailer-scene');
  const progressBar = $('trailer-progress-bar');

  const scenes = [
    {
      duration: 2500,
      render: () => `
        <div class="scene-text scene-fade-in">
          <div class="scene-subtitle">${escapeHtml(directorName)}出品</div>
        </div>
      `,
    },
    {
      duration: 3000,
      render: () => `
        <div class="scene-text scene-fade-in">
          <div class="scene-quote">${escapeHtml(inputText || '一个关于情绪的故事')}</div>
        </div>
      `,
    },
    {
      duration: 3000,
      render: () => {
        const kwHtml = keywords
          .slice(0, 4)
          .map(
            (kw, i) =>
              `<div class="scene-subtitle" style="opacity:0;animation:trailerFadeIn .6s var(--ease) ${i * 0.4}s forwards">${escapeHtml(kw)}</div>`
          )
          .join('');
        return `
          <div class="scene-text">
            ${kwHtml}
          </div>
        `;
      },
    },
    {
      duration: 3000,
      render: () => `
        <div class="scene-text scene-fade-in">
          <div class="scene-title">${escapeHtml(title)}</div>
          <div class="scene-subtitle">${escapeHtml(emotion)}</div>
        </div>
      `,
    },
    {
      duration: 3000,
      render: () => `
        <div class="scene-text scene-fade-in">
          <div class="scene-quote">${escapeHtml(quote || '光影之间，情绪流转')}</div>
          <div class="scene-director">— ${escapeHtml(directorName)}</div>
        </div>
      `,
    },
    {
      duration: 2500,
      render: () => `
        <div class="scene-text scene-zoom">
          <div class="scene-title">${escapeHtml(title)}</div>
          <div class="scene-coming">即将上映</div>
          <div class="scene-director">导演：${escapeHtml(directorName)}</div>
        </div>
      `,
    },
  ];

  let currentScene = 0;

  function renderScene(index) {
    if (index >= scenes.length) {
      progressBar.style.width = '100%';
      return;
    }
    const scene = scenes[index];
    sceneEl.innerHTML = scene.render();
    progressBar.style.width = ((index + 1) / scenes.length) * 100 + '%';

    if (state.trailerTimer) clearTimeout(state.trailerTimer);

    state.trailerTimer = setTimeout(() => {
      currentScene++;
      renderScene(currentScene);
    }, scene.duration);
  }

  progressBar.style.width = '0%';
  currentScene = 0;
  renderScene(0);
}

function closeTrailer() {
  closeModal('result-tools-modal');
  if (state.trailerTimer) {
    clearTimeout(state.trailerTimer);
    state.trailerTimer = null;
  }
}

function skipTrailer() {
  if (state.trailerTimer) {
    clearTimeout(state.trailerTimer);
  }
  const sceneEl = $('trailer-scene');
  const progressBar = $('trailer-progress-bar');

  const current = state.posterResults[state.currentPosterIndex];
  const director = DIRECTORS.find((d) => d.id === current.directorId);
  const title = state.currentTitle || current.title || '无题';
  const directorName = director ? director.name : '未知导演';

  sceneEl.innerHTML = `
    <div class="scene-text scene-zoom">
      <div class="scene-title">${escapeHtml(title)}</div>
      <div class="scene-coming">即将上映</div>
      <div class="scene-director">导演：${escapeHtml(directorName)}</div>
    </div>
  `;
  progressBar.style.width = '100%';
}

export { playTrailer, closeTrailer, skipTrailer };
