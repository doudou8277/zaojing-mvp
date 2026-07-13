/**
 * 共创页模块
 * 从 app.js 提取 — 负责多人共创功能
 */
import { $, state, toast, navigate, escapeHtml } from '../shared.js';
import { logger } from '../utils/logger.js';
import { createModuleBoundary } from '../utils/error-boundary.js';
import * as AIClient from '../ai-client';
import { EMOTION_SPECTRUM } from '../data.js';

const cocreateBoundary = createModuleBoundary('Cocreate');
const COCREATE_AVATARS = ['clapper', 'masks', 'palette', 'camera', 'mic', 'music', 'edit', 'sparkles'];

let _initDirectorsPage = null;

function setupCocreatePage({ initDirectorsPage }) {
  _initDirectorsPage = initDirectorsPage;
}

function initCocreatePage() {
  state.cocreateContributors = [];
  state.cocreateAnalysis = null;

  const inputsEl = $('cocreate-inputs');
  if (inputsEl) inputsEl.innerHTML = '';

  addCocreateInput('创作者1', '');
  addCocreateInput('创作者2', '');
  addCocreateInput('创作者3', '');

  $('cocreate-summary').style.display = 'none';
  $('btn-cocreate-generate').style.display = 'none';
  $('btn-cocreate-analyze').style.display = 'inline-flex';

  navigate('cocreate');
}

function addCocreateInput(name, text) {
  const inputsEl = $('cocreate-inputs');
  if (!inputsEl) return;

  const index = state.cocreateContributors.length;
  const avatar = COCREATE_AVATARS[index % COCREATE_AVATARS.length];
  const contributorName = name || `创作者${index + 1}`;

  const item = document.createElement('div');
  item.className = 'cocreate-input-item';

  item.innerHTML = `
    <div class="cocreate-avatar"><svg class="ico ico-lg"><use href="#i-${avatar}"/></svg></div>
    <div class="cocreate-input-wrap">
      <div class="cocreate-input-name">${escapeHtml(contributorName)}</div>
      <textarea class="cocreate-input-field" placeholder="写下一句心情或故事…" maxlength="100" rows="2">${escapeHtml(text || '')}</textarea>
    </div>
    <button class="cocreate-remove" title="移除">×</button>
  `;

  const removeBtn = item.querySelector('.cocreate-remove');
  removeBtn.addEventListener('click', () => {
    const items = inputsEl.querySelectorAll('.cocreate-input-item');
    if (items.length <= 1) {
      toast('至少保留一位创作者');
      return;
    }
    item.remove();
    inputsEl.querySelectorAll('.cocreate-input-item').forEach((el, i) => {
      const nameEl = el.querySelector('.cocreate-input-name');
      if (nameEl) nameEl.textContent = `创作者${i + 1}`;
      const avatarEl = el.querySelector('.cocreate-avatar');
      if (avatarEl)
        avatarEl.innerHTML = `<svg class="ico ico-lg"><use href="#i-${COCREATE_AVATARS[i % COCREATE_AVATARS.length]}"/></svg>`;
    });
  });

  inputsEl.appendChild(item);
  state.cocreateContributors.push({ name: contributorName, text: text || '' });
}

async function analyzeCocreate() {
  const inputsEl = $('cocreate-inputs');
  if (!inputsEl) return;

  const fields = inputsEl.querySelectorAll('.cocreate-input-field');
  const texts = [];
  fields.forEach((f) => {
    const t = f.value.trim();
    if (t) texts.push(t);
  });

  if (texts.length === 0) {
    toast('请至少输入一句心情或故事');
    return;
  }

  const mergedText = texts.join('；');
  const analyzeBtn = $('btn-cocreate-analyze');
  analyzeBtn.textContent = 'AI 分析中…';
  analyzeBtn.disabled = true;

  let analysis = null;

  if (state.aiHealthStatus) {
    analysis = await cocreateBoundary.run(
      () => AIClient.analyzeEmotion(mergedText, null),
      (err) => {
        logger.warn('AI 分析失败，使用本地分析:', err.message);
        return null;
      }
    );
  }

  if (!analysis) {
    const emotionKeys = Object.keys(EMOTION_SPECTRUM);
    const randomEmotion = emotionKeys[Math.floor(Math.random() * emotionKeys.length)];
    const config = EMOTION_SPECTRUM[randomEmotion];
    analysis = {
      primaryEmotion: randomEmotion,
      intensity: Math.floor(Math.random() * 4) + 6,
      keywords: config.keywords,
      summary: `这是 ${texts.length} 位创作者的情绪融合。${randomEmotion}是主导情绪，交织着${config.keywords.join('、')}的意象。每个人的故事在这里相遇，汇成一部共同的电影。`,
    };
  }

  state.cocreateAnalysis = analysis;

  $('cocreate-emotion').textContent = analysis.primaryEmotion || '融合';

  const keywordsEl = $('cocreate-keywords');
  keywordsEl.innerHTML = '';
  const keywords = analysis.keywords || [];
  keywords.forEach((kw) => {
    const tag = document.createElement('span');
    tag.className = 'summary-keyword';
    tag.textContent = kw;
    keywordsEl.appendChild(tag);
  });

  $('cocreate-text').textContent =
    analysis.summary || `${texts.length} 位创作者的情绪已融合，主导情绪为${analysis.primaryEmotion}。`;

  $('cocreate-summary').style.display = 'block';
  $('btn-cocreate-generate').style.display = 'inline-flex';
  $('btn-cocreate-analyze').style.display = 'none';

  analyzeBtn.textContent = 'AI 融合分析 →';
  analyzeBtn.disabled = false;

  toast('AI 融合分析完成');
}

function generateCocreatePoster() {
  if (!state.cocreateAnalysis) {
    toast('请先进行 AI 融合分析');
    return;
  }

  const inputsEl = $('cocreate-inputs');
  const fields = inputsEl.querySelectorAll('.cocreate-input-field');
  const texts = [];
  fields.forEach((f) => {
    const t = f.value.trim();
    if (t) texts.push(t);
  });
  const mergedText = texts.join('；') || '多人共创的故事';

  state.emotionAnalysis = state.cocreateAnalysis;
  state.inputText = mergedText;
  state.selectedDirectorIds = [];

  if (typeof _initDirectorsPage === 'function') _initDirectorsPage();
  navigate('directors');
  toast('共创内容已就绪，请选择导演');
}

export { setupCocreatePage, initCocreatePage, addCocreateInput, analyzeCocreate, generateCocreatePoster };
