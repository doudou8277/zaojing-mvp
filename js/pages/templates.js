/**
 * 造境 ZaoJing — 模板系统模块
 * 预设模板库 + 用户自定义模板（localStorage 持久化）
 */
import { $, state, toast, navigate, escapeHtml, logger } from '../shared.js';
import { DIRECTORS, POSTER_TEMPLATES, TEMPLATE_CATEGORIES } from '../data.js';

// ========== 常量 ==========
const STORAGE_KEY = 'zaojing_user_templates';
const MAX_USER_TEMPLATES = 30;

// ========== 模块状态 ==========
let _currentCategory = 'all';
let _onApplyCallback = null;

/**
 * 初始化模板模块
 * @param {Object} deps
 * @param {Function} [deps.onApply] - 模板应用后的回调（通常为进入导演页）
 */
export function setupTemplatesPage({ onApply } = {}) {
  _onApplyCallback = onApply || null;
}

// ========== 用户模板持久化 ==========

/**
 * 从 localStorage 加载用户模板
 * @returns {PosterTemplate[]}
 */
export function loadUserTemplates() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => t && t.id && t.text && t.directorId);
  } catch (e) {
    logger.warn('加载用户模板失败:', e);
    return [];
  }
}

/**
 * 保存用户模板到 localStorage
 * @param {PosterTemplate[]} templates
 */
function saveUserTemplates(templates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    logger.warn('保存用户模板失败:', e);
    toast('模板保存失败，存储空间可能不足');
  }
}

/**
 * 将当前海报配置保存为用户模板
 * @param {Object} [customName] - 自定义模板名称
 * @returns {PosterTemplate|null}
 */
export function saveAsTemplate(customName) {
  if (!state.inputText || !state.inputText.trim()) {
    toast('请先生成海报后再保存为模板');
    return null;
  }

  const userTemplates = loadUserTemplates();
  if (userTemplates.length >= MAX_USER_TEMPLATES) {
    toast(`用户模板最多 ${MAX_USER_TEMPLATES} 个，请先删除旧模板`);
    return null;
  }

  const directorId = state.selectedDirectorIds[0] || 'miyazaki';
  const director = DIRECTORS.find((d) => d.id === directorId);
  const name = customName || `${director ? director.name : ''}·${state.inputText.substring(0, 10)}`;

  const template = {
    id: 'user-tpl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name: name,
    icon: 'bookmark',
    text: state.inputText.trim(),
    directorId: directorId,
    format: state.posterFormat || 'vertical',
    moodTagId: state.moodTagId || undefined,
    category: 'custom',
    createdAt: Date.now(),
    source: 'user',
  };

  userTemplates.unshift(template);
  saveUserTemplates(userTemplates);
  toast('模板已保存到我的模板库');
  return template;
}

/**
 * 删除用户模板
 * @param {string} id
 */
export function deleteUserTemplate(id) {
  const userTemplates = loadUserTemplates();
  const filtered = userTemplates.filter((t) => t.id !== id);
  if (filtered.length === userTemplates.length) {
    toast('未找到该模板');
    return;
  }
  saveUserTemplates(filtered);
  toast('模板已删除');
  // 重新渲染
  renderTemplateGrid();
}

// ========== 打开 / 关闭弹窗 ==========

export function openTemplateModal() {
  navigate('template');
  _currentCategory = 'all';
  renderCategoryTabs();
  renderTemplateGrid();
}

export function closeTemplateModal() {
  navigate('input');
}

// ========== 渲染 ==========

function renderCategoryTabs() {
  const container = $('template-categories');
  if (!container) return;
  container.innerHTML = '';

  TEMPLATE_CATEGORIES.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'template-cat-btn' + (_currentCategory === cat.id ? ' active' : '');
    btn.dataset.category = cat.id;
    btn.innerHTML = `<svg class="ico"><use href="#i-${cat.icon}"/></svg> ${cat.label}`;
    btn.addEventListener('click', () => {
      _currentCategory = cat.id;
      renderCategoryTabs();
      renderTemplateGrid();
    });
    container.appendChild(btn);
  });
}

function renderTemplateGrid() {
  const container = $('template-grid');
  if (!container) return;
  container.innerHTML = '';

  // 合并预设 + 用户模板
  const userTemplates = loadUserTemplates();
  const allTemplates = [...userTemplates, ...POSTER_TEMPLATES];

  // 按分类过滤
  const filtered =
    _currentCategory === 'all'
      ? allTemplates
      : allTemplates.filter(
          (t) => t.category === _currentCategory || (_currentCategory === 'custom' && t.source === 'user')
        );

  if (filtered.length === 0) {
    container.innerHTML = '<div class="template-empty">暂无模板，生成海报后可保存为模板</div>';
    return;
  }

  filtered.forEach((template) => {
    const director = DIRECTORS.find((d) => d.id === template.directorId);
    const directorName = director ? director.name : template.directorId;
    const card = document.createElement('div');
    card.className = 'template-card' + (template.source === 'user' ? ' user-template' : '');
    card.innerHTML = `
      <div class="template-card-header">
        <span class="template-emoji"><svg class="ico"><use href="#i-${template.icon}"/></svg></span>
        <span class="template-name">${escapeHtml(template.name)}</span>
        ${template.source === 'user' ? '<span class="template-badge">我的</span>' : ''}
      </div>
      <div class="template-text">${escapeHtml(template.text)}</div>
      <div class="template-meta">
        <span class="template-director">${escapeHtml(directorName)}</span>
        <span class="template-format">${escapeHtml(template.format)}</span>
      </div>
      <div class="template-actions">
        <button class="btn btn-primary btn-sm template-apply-btn">使用此模板</button>
        ${template.source === 'user' ? `<button class="btn btn-ghost btn-sm template-delete-btn" data-id="${template.id}">删除</button>` : ''}
      </div>
    `;

    // 应用模板
    card.querySelector('.template-apply-btn').addEventListener('click', () => applyTemplate(template));

    // 删除用户模板
    const deleteBtn = card.querySelector('.template-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('确定删除这个模板吗？')) {
          deleteUserTemplate(deleteBtn.dataset.id);
        }
      });
    }

    container.appendChild(card);
  });
}

// ========== 应用模板 ==========

/**
 * 应用模板：填入输入文字、导演、版式、心情标签，然后进入导演页
 * @param {PosterTemplate} template
 */
export function applyTemplate(template) {
  // 填入状态
  state.inputText = template.text;
  state.selectedDirectorIds = [template.directorId];
  state.posterFormat = template.format;
  state.moodTagId = template.moodTagId || null;
  state.emotionAnalysis = null;
  state.imageEmotionAnalysis = null;

  // 更新输入框
  const textarea = $('input-text');
  if (textarea) {
    textarea.value = template.text;
    const charCount = $('char-count');
    if (charCount) charCount.textContent = `${template.text.length}/200`;
  }

  // 更新心情标签选中状态
  document.querySelectorAll('.mood-tag').forEach((tag) => {
    tag.classList.toggle('selected', tag.dataset.id === template.moodTagId);
  });

  closeTemplateModal();
  toast(`已应用模板「${template.name}」`);

  // 调用回调（进入导演页）
  if (typeof _onApplyCallback === 'function') {
    _onApplyCallback();
  } else {
    navigate('directors');
  }
}

/**
 * 从结果页保存当前配置为模板
 */
export function saveCurrentAsTemplate() {
  const name = prompt('给这个模板起个名字：', '');
  if (name === null) return; // 用户取消
  saveAsTemplate(name || undefined);
}
