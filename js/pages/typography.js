/**
 * 造境 ZaoJing — 自定义字体与排版设置页面模块
 * 提供字体选择、自定义字体上传、排版参数调整
 */

import { $, toast, escapeHtml, logger } from '../shared.js';
import {
  PRESET_FONTS,
  FONT_WEIGHTS,
  LETTER_SPACING_OPTIONS,
  DEFAULT_TYPOGRAPHY_CONFIG,
  loadTypographyConfig,
  saveTypographyConfig,
  resetTypographyConfig,
  loadPresetFont,
  loadFontFromFile,
  getLoadedCustomFonts,
  removeCustomFont,
  getPresetFont,
  getEffectiveFontFamily,
  getCategoryLabel,
} from '../utils/font-manager.js';

// ========== 依赖注入 ==========
let _onConfigChange = null;
let _currentConfig = null;

/**
 * 初始化排版设置模块
 * @param {Object} deps
 * @param {Function} [deps.onConfigChange] - 配置变更回调
 */
export function setupTypographyPage({ onConfigChange } = {}) {
  _onConfigChange = onConfigChange || null;
  _currentConfig = loadTypographyConfig();
}

/**
 * 获取当前排版配置
 * @returns {Object}
 */
export function getTypographyConfig() {
  if (!_currentConfig) {
    _currentConfig = loadTypographyConfig();
  }
  return { ..._currentConfig };
}

// ========== 弹窗管理 ==========

/**
 * 打开排版设置弹窗
 */
export function openTypographyModal() {
  const modalEl = $('typography-modal');
  if (!modalEl) return;

  _currentConfig = loadTypographyConfig();
  modalEl.style.display = 'flex';

  renderFontGrid();
  renderTypographyControls();
  renderCustomFontsList();
  bindTypographyEvents();
}

/**
 * 关闭排版设置弹窗
 */
export function closeTypographyModal() {
  closeModal('result-tools-modal');
}

// ========== 渲染 ==========

/**
 * 渲染预设字体网格
 */
function renderFontGrid() {
  const gridEl = $('typography-font-grid');
  if (!gridEl) return;

  gridEl.innerHTML = PRESET_FONTS.map((font) => `
    <div class="typography-font-card ${_currentConfig.fontId === font.id ? 'selected' : ''}"
         data-font-id="${font.id}">
      <div class="typography-font-preview" style="font-family: ${font.fontFamily}">
        ${escapeHtml(font.preview)}
      </div>
      <div class="typography-font-name">${escapeHtml(font.name)}</div>
      <div class="typography-font-cat">${escapeHtml(getCategoryLabel(font.category))}</div>
      <div class="typography-font-desc">${escapeHtml(font.description)}</div>
    </div>
  `).join('');

  // 绑定点击
  gridEl.querySelectorAll('.typography-font-card').forEach((card) => {
    card.onclick = () => {
      const fontId = card.dataset.fontId;
      const font = getPresetFont(fontId);
      if (!font) return;

      // 加载字体（按需注入 Google Fonts link）
      loadPresetFont(fontId);

      // 更新配置
      _currentConfig.fontId = fontId;
      _currentConfig.fontFamily = font.fontFamily;
      _currentConfig.customFontFamily = null; // 切换预设时清除自定义
      _currentConfig.customFontName = null;

      // 更新选中状态
      gridEl.querySelectorAll('.typography-font-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');

      // 更新预览
      updatePreview();
      saveAndNotify();
    };
  });
}

/**
 * 渲染排版控制项
 */
function renderTypographyControls() {
  // 启用开关
  const toggle = $('typography-enabled-toggle');
  if (toggle) toggle.checked = _currentConfig.enabled;

  // 字重选择
  const weightSelect = $('typography-title-weight');
  if (weightSelect) {
    weightSelect.innerHTML = FONT_WEIGHTS.map((w) =>
      `<option value="${w.value}" ${w.value === _currentConfig.titleWeight ? 'selected' : ''}>${w.label}</option>`
    ).join('');
  }

  // 字间距选择
  const spacingSelect = $('typography-letter-spacing');
  if (spacingSelect) {
    spacingSelect.innerHTML = LETTER_SPACING_OPTIONS.map((s) =>
      `<option value="${s.value}" ${s.value === _currentConfig.letterSpacing ? 'selected' : ''}>${s.label}</option>`
    ).join('');
  }

  // 标题字号缩放
  const titleSizeSlider = $('typography-title-size');
  const titleSizeVal = $('typography-title-size-val');
  if (titleSizeSlider) {
    titleSizeSlider.value = Math.round(_currentConfig.titleSizeScale * 100);
  }
  if (titleSizeVal) {
    titleSizeVal.textContent = Math.round(_currentConfig.titleSizeScale * 100) + '%';
  }

  // 金句字号缩放
  const quoteSizeSlider = $('typography-quote-size');
  const quoteSizeVal = $('typography-quote-size-val');
  if (quoteSizeSlider) {
    quoteSizeSlider.value = Math.round(_currentConfig.quoteSizeScale * 100);
  }
  if (quoteSizeVal) {
    quoteSizeVal.textContent = Math.round(_currentConfig.quoteSizeScale * 100) + '%';
  }

  updatePreview();
}

/**
 * 渲染已加载的自定义字体列表
 */
function renderCustomFontsList() {
  const listEl = $('typography-custom-fonts-list');
  if (!listEl) return;

  const customFonts = getLoadedCustomFonts();
  if (customFonts.length === 0) {
    listEl.innerHTML = '<div class="typography-no-custom">暂未上传自定义字体</div>';
    return;
  }

  listEl.innerHTML = customFonts.map((f) => `
    <div class="typography-custom-font-item">
      <span class="typography-custom-font-name" style="font-family: '${f.family}'">${escapeHtml(f.name)}</span>
      <button class="btn btn-ghost btn-sm typography-custom-font-use" data-family="${escapeHtml(f.family)}">使用</button>
      <button class="btn btn-ghost btn-sm typography-custom-font-remove" data-family="${escapeHtml(f.family)}">移除</button>
    </div>
  `).join('');

  // 绑定使用按钮
  listEl.querySelectorAll('.typography-custom-font-use').forEach((btn) => {
    btn.onclick = () => {
      const family = btn.dataset.family;
      _currentConfig.customFontFamily = family;
      _currentConfig.customFontName = family.replace(/^ZJCustom_/, '');
      _currentConfig.fontId = 'custom';

      // 取消预设字体选中
      const gridEl = $('typography-font-grid');
      if (gridEl) {
        gridEl.querySelectorAll('.typography-font-card').forEach((c) => c.classList.remove('selected'));
      }

      updatePreview();
      saveAndNotify();
      toast(`已切换为自定义字体：${family.replace(/^ZJCustom_/, '')}`);
    };
  });

  // 绑定移除按钮
  listEl.querySelectorAll('.typography-custom-font-remove').forEach((btn) => {
    btn.onclick = () => {
      const family = btn.dataset.family;
      removeCustomFont(family);

      // 如果当前正在使用该字体，回退到默认
      if (_currentConfig.customFontFamily === family) {
        _currentConfig.customFontFamily = null;
        _currentConfig.customFontName = null;
        _currentConfig.fontId = 'noto-serif-sc';
        _currentConfig.fontFamily = '"Noto Serif SC", serif';
      }

      renderCustomFontsList();
      updatePreview();
      saveAndNotify();
      toast('自定义字体已移除');
    };
  });
}

/**
 * 更新预览
 */
function updatePreview() {
  const previewEl = $('typography-preview');
  if (!previewEl) return;

  const fontFamily = getEffectiveFontFamily(_currentConfig);
  const weight = _currentConfig.titleWeight || 700;
  const letterSpacing = _currentConfig.letterSpacing || 0;
  const titleScale = _currentConfig.titleSizeScale || 1.0;

  previewEl.innerHTML = `
    <div class="typography-preview-title"
         style="font-family: ${fontFamily}; font-weight: ${weight}; letter-spacing: ${letterSpacing}px; font-size: ${1.8 * titleScale}rem">
      造境 · 电影海报
    </div>
    <div class="typography-preview-quote"
         style="font-family: ${fontFamily}; letter-spacing: ${letterSpacing}px">
      「每一帧都是一封情书」
    </div>
  `;
}

// ========== 事件绑定 ==========

function bindTypographyEvents() {
  // 启用开关
  const toggle = $('typography-enabled-toggle');
  if (toggle) {
    toggle.onchange = () => {
      _currentConfig.enabled = toggle.checked;
      saveAndNotify();
    };
  }

  // 字重
  const weightSelect = $('typography-title-weight');
  if (weightSelect) {
    weightSelect.onchange = () => {
      _currentConfig.titleWeight = parseInt(weightSelect.value, 10);
      updatePreview();
      saveAndNotify();
    };
  }

  // 字间距
  const spacingSelect = $('typography-letter-spacing');
  if (spacingSelect) {
    spacingSelect.onchange = () => {
      _currentConfig.letterSpacing = parseInt(spacingSelect.value, 10);
      updatePreview();
      saveAndNotify();
    };
  }

  // 标题字号缩放
  const titleSizeSlider = $('typography-title-size');
  if (titleSizeSlider) {
    titleSizeSlider.oninput = () => {
      const val = parseInt(titleSizeSlider.value, 10);
      _currentConfig.titleSizeScale = val / 100;
      const valEl = $('typography-title-size-val');
      if (valEl) valEl.textContent = val + '%';
      updatePreview();
    };
    titleSizeSlider.onchange = () => saveAndNotify();
  }

  // 金句字号缩放
  const quoteSizeSlider = $('typography-quote-size');
  if (quoteSizeSlider) {
    quoteSizeSlider.oninput = () => {
      const val = parseInt(quoteSizeSlider.value, 10);
      _currentConfig.quoteSizeScale = val / 100;
      const valEl = $('typography-quote-size-val');
      if (valEl) valEl.textContent = val + '%';
      updatePreview();
    };
    quoteSizeSlider.onchange = () => saveAndNotify();
  }

  // 自定义字体上传
  const fontInput = $('typography-font-input');
  if (fontInput) {
    fontInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const result = await loadFontFromFile(file);
        toast(`字体「${result.name}」上传成功`);
        renderCustomFontsList();
      } catch (err) {
        logger.warn('[typography] 字体上传失败:', err.message);
        toast('字体上传失败：' + err.message);
      }
      // 清空 input 以便重复上传同一文件
      e.target.value = '';
    };
  }

  // 重置按钮
  const resetBtn = $('btn-typography-reset');
  if (resetBtn) {
    resetBtn.onclick = () => {
      _currentConfig = resetTypographyConfig();
      renderFontGrid();
      renderTypographyControls();
      saveAndNotify();
      toast('排版设置已重置');
    };
  }

  // 应用并关闭
  const applyBtn = $('btn-typography-apply');
  if (applyBtn) {
    applyBtn.onclick = () => {
      saveAndNotify();
      closeTypographyModal();
      toast('排版设置已应用');
    };
  }
}

/**
 * 保存配置并通知变更
 */
function saveAndNotify() {
  saveTypographyConfig(_currentConfig);
  if (typeof _onConfigChange === 'function') {
    _onConfigChange({ ..._currentConfig });
  }
}

export default {
  setupTypographyPage,
  openTypographyModal,
  closeTypographyModal,
  getTypographyConfig,
};
