/**
 * 造境 ZaoJing — 热点话题联动页面模块
 * 提供热搜弹窗：平台切换、话题列表、一键选用为创作灵感
 */

import { $, state, toast, escapeHtml, logger, navigate } from '../shared.js';
import { HOT_PLATFORMS, fetchHotTopics, formatHotValue, getCategoryColor, topicToPrompt } from '../utils/hot-topics.js';

// ========== 依赖注入 ==========
let _onTopicSelect = null;

/**
 * 初始化热点话题模块
 * @param {Object} deps
 * @param {Function} [deps.onTopicSelect] - 选中话题后的回调
 */
export function setupHotTopicsPage({ onTopicSelect } = {}) {
  _onTopicSelect = onTopicSelect || null;
}

// ========== 状态 ==========
let _currentPlatform = 'weibo';
let _allTopics = {};
let _isLoading = false;

// ========== 弹窗管理 ==========

/**
 * 打开热点话题弹窗
 */
export async function openHotTopicsModal() {
  navigate('hot-topics');
  _currentPlatform = 'weibo';

  // 渲染平台标签
  renderPlatformTabs();

  // 加载话题数据
  await loadAndRenderTopics();
}

/**
 * 关闭热点话题弹窗
 */
export function closeHotTopicsModal() {
  navigate('input');
}

// ========== 渲染 ==========

/**
 * 渲染平台切换标签
 */
function renderPlatformTabs() {
  const tabsEl = $('hot-topics-tabs');
  if (!tabsEl) return;

  tabsEl.innerHTML = HOT_PLATFORMS.map(
    (p) => `
    <button class="hot-platform-tab ${p.id === _currentPlatform ? 'active' : ''}"
            data-platform="${p.id}"
            style="${p.id === _currentPlatform ? `border-color:${p.color};color:${p.color}` : ''}">
      <svg class="ico"><use href="#i-${p.icon}"/></svg> ${p.label}
    </button>
  `
  ).join('');

  // 绑定切换
  tabsEl.querySelectorAll('.hot-platform-tab').forEach((tab) => {
    tab.onclick = () => {
      _currentPlatform = tab.dataset.platform;
      renderPlatformTabs();
      renderTopicList();
    };
  });
}

/**
 * 加载并渲染话题列表
 */
async function loadAndRenderTopics() {
  if (_isLoading) return;
  _isLoading = true;

  const listEl = $('hot-topics-list');
  if (!listEl) {
    _isLoading = false;
    return;
  }

  listEl.innerHTML =
    '<div class="hot-topics-loading"><svg class="ico"><use href="#i-flame"/></svg> 正在获取最新热搜...</div>';

  try {
    _allTopics = await fetchHotTopics();
    renderTopicList();
  } catch (e) {
    logger.warn('[hot-topics] 加载失败:', e.message);
    listEl.innerHTML = '<div class="hot-topics-empty">加载失败，请稍后重试</div>';
  } finally {
    _isLoading = false;
  }
}

/**
 * 渲染话题列表
 */
function renderTopicList() {
  const listEl = $('hot-topics-list');
  if (!listEl) return;

  const topics = _allTopics[_currentPlatform] || [];
  if (topics.length === 0) {
    listEl.innerHTML = '<div class="hot-topics-empty">暂无数据</div>';
    return;
  }

  listEl.innerHTML = topics
    .map((topic, i) => {
      const rankColor = i < 3 ? ['#e74c3c', '#e67e22', '#f1c40f'][i] : '#95a5a6';
      const catColor = getCategoryColor(topic.category);
      return `
      <div class="hot-topic-item" data-index="${i}">
        <div class="hot-topic-rank" style="color:${rankColor}">${topic.rank || i + 1}</div>
        <div class="hot-topic-content">
          <div class="hot-topic-title">${escapeHtml(topic.title)}</div>
          <div class="hot-topic-meta">
            ${topic.category ? `<span class="hot-topic-cat" style="background:${catColor}20;color:${catColor}">${escapeHtml(topic.category)}</span>` : ''}
            <span class="hot-topic-hot"><svg class="ico"><use href="#i-flame"/></svg> ${formatHotValue(topic.hot)}</span>
          </div>
        </div>
        <button class="hot-topic-use" data-index="${i}">选用</button>
      </div>
    `;
    })
    .join('');

  // 绑定选用按钮
  listEl.querySelectorAll('.hot-topic-use').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      const topicList = _allTopics[_currentPlatform] || [];
      const topic = topicList[idx];
      if (!topic) return;
      selectTopic({ ...topic, platform: _currentPlatform });
    };
  });

  // 整行点击也可选用
  listEl.querySelectorAll('.hot-topic-item').forEach((item) => {
    item.onclick = () => {
      const idx = parseInt(item.dataset.index, 10);
      const topicList = _allTopics[_currentPlatform] || [];
      const topic = topicList[idx];
      if (!topic) return;
      selectTopic({ ...topic, platform: _currentPlatform });
    };
  });
}

/**
 * 选用话题，填入输入框并关闭弹窗
 * @param {Object} topic
 */
function selectTopic(topic) {
  const prompt = topicToPrompt(topic);
  const textarea = $('input-text');
  if (textarea) {
    textarea.value = prompt;
    textarea.dispatchEvent(new Event('input'));
    textarea.focus();
  }
  state.inputText = prompt;

  const platformInfo = HOT_PLATFORMS.find((p) => p.id === topic.platform);
  toast(`已选用「${topic.title}」作为创作灵感`);

  closeHotTopicsModal();

  if (typeof _onTopicSelect === 'function') {
    _onTopicSelect(topic);
  }
}

/**
 * 刷新热搜数据
 */
export async function refreshHotTopics() {
  _allTopics = {};
  await loadAndRenderTopics();
  toast('热搜已刷新');
}

export default {
  setupHotTopicsPage,
  openHotTopicsModal,
  closeHotTopicsModal,
  refreshHotTopics,
};
