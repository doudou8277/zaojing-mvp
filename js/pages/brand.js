/**
 * 造境 ZaoJing — 品牌工具包页面模块
 * Logo 上传、水印设置、品牌色板配置
 */
import { $, state, toast, escapeHtml, sanitizeImageUrl, logger, openModal, closeModal, openResultToolsModal } from '../shared.js';
import {
  loadBrandConfig,
  saveBrandConfig,
  resetBrandConfig,
  loadLogoFromFile,
  LOGO_POSITIONS,
  WATERMARK_POSITIONS,
} from '../utils/brand-toolkit.js';

// ========== 模块状态 ==========
let _brandConfig = null;
let _onConfigChange = null;

/**
 * 初始化品牌工具包模块
 * @param {Object} deps
 * @param {Function} [deps.onConfigChange] - 配置变更回调
 */
export function setupBrandPage({ onConfigChange } = {}) {
  _onConfigChange = onConfigChange || null;
  _brandConfig = loadBrandConfig();
}

/**
 * 获取当前品牌配置
 * @returns {Object}
 */
export function getBrandConfig() {
  if (!_brandConfig) {
    _brandConfig = loadBrandConfig();
  }
  return _brandConfig;
}

// ========== 打开 / 关闭 ==========

export function openBrandModal() {
  _brandConfig = loadBrandConfig();
  renderBrandSettings();
  openResultToolsModal('brand');
}

export function closeBrandModal() {
  closeModal('result-tools-modal');
}

// ========== 渲染设置 ==========

function renderBrandSettings() {
  // 启用开关
  const toggle = $('brand-enabled-toggle');
  if (toggle) toggle.checked = _brandConfig.enabled;

  // Logo 预览
  const preview = $('brand-logo-preview');
  if (preview) {
    if (_brandConfig.logoDataUrl) {
      const safeLogoUrl = sanitizeImageUrl(_brandConfig.logoDataUrl);
      if (safeLogoUrl) {
        preview.innerHTML = `<img src="${safeLogoUrl}" alt="Logo" style="max-width:120px;max-height:60px">`;
      } else {
        preview.innerHTML = '<span style="color:var(--ink-mute);font-size:.8rem">Logo 数据不安全，已拒绝加载</span>';
      }
      const removeBtn = $('btn-brand-logo-remove');
      if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
      preview.innerHTML = '<span style="color:var(--ink-mute);font-size:.8rem">未上传 Logo</span>';
      const removeBtn = $('btn-brand-logo-remove');
      if (removeBtn) removeBtn.style.display = 'none';
    }
  }

  // Logo 位置
  const logoPos = $('brand-logo-position');
  if (logoPos) {
    logoPos.innerHTML = LOGO_POSITIONS.map(
      (p) => `<option value="${p.id}" ${p.id === _brandConfig.logoPosition ? 'selected' : ''}>${p.label}</option>`
    ).join('');
  }

  // Logo 大小
  const logoSize = $('brand-logo-size');
  const logoSizeVal = $('brand-logo-size-val');
  if (logoSize) logoSize.value = Math.round(_brandConfig.logoSize * 100);
  if (logoSizeVal) logoSizeVal.textContent = Math.round(_brandConfig.logoSize * 100) + '%';

  // Logo 透明度
  const logoOpacity = $('brand-logo-opacity');
  const logoOpacityVal = $('brand-logo-opacity-val');
  if (logoOpacity) logoOpacity.value = Math.round(_brandConfig.logoOpacity * 100);
  if (logoOpacityVal) logoOpacityVal.textContent = Math.round(_brandConfig.logoOpacity * 100) + '%';

  // 水印文字
  const watermarkText = $('brand-watermark-text');
  if (watermarkText) watermarkText.value = _brandConfig.watermarkText;

  // 水印位置
  const wmPos = $('brand-watermark-position');
  if (wmPos) {
    wmPos.innerHTML = WATERMARK_POSITIONS.map(
      (p) => `<option value="${p.id}" ${p.id === _brandConfig.watermarkPosition ? 'selected' : ''}>${p.label}</option>`
    ).join('');
  }

  // 水印透明度
  const wmOpacity = $('brand-watermark-opacity');
  const wmOpacityVal = $('brand-watermark-opacity-val');
  if (wmOpacity) wmOpacity.value = Math.round(_brandConfig.watermarkOpacity * 100);
  if (wmOpacityVal) wmOpacityVal.textContent = Math.round(_brandConfig.watermarkOpacity * 100) + '%';

  // 水印字体大小
  const wmFontSize = $('brand-watermark-fontsize');
  const wmFontSizeVal = $('brand-watermark-fontsize-val');
  if (wmFontSize) wmFontSize.value = _brandConfig.watermarkFontSize;
  if (wmFontSizeVal) wmFontSizeVal.textContent = _brandConfig.watermarkFontSize + 'px';
}

// ========== 事件处理 ==========

export function handleLogoUpload(file) {
  loadLogoFromFile(file)
    .then((dataUrl) => {
      _brandConfig.logoDataUrl = dataUrl;
      saveBrandConfig(_brandConfig);
      renderBrandSettings();
      toast('Logo 上传成功');
      notifyConfigChange();
    })
    .catch((err) => {
      logger.warn('[brand] Logo 上传失败:', err.message);
      toast(err.message || 'Logo 上传失败');
    });
}

export function removeLogo() {
  _brandConfig.logoDataUrl = null;
  saveBrandConfig(_brandConfig);
  renderBrandSettings();
  toast('Logo 已移除');
  notifyConfigChange();
}

export function updateBrandField(field, value) {
  _brandConfig[field] = value;
  saveBrandConfig(_brandConfig);
  notifyConfigChange();
}

export function toggleBrandEnabled(enabled) {
  _brandConfig.enabled = enabled;
  saveBrandConfig(_brandConfig);
  notifyConfigChange();
}

export function handleResetBrand() {
  if (!confirm('确定重置所有品牌设置吗？')) return;
  resetBrandConfig();
  _brandConfig = loadBrandConfig();
  renderBrandSettings();
  toast('品牌设置已重置');
  notifyConfigChange();
}

function notifyConfigChange() {
  if (typeof _onConfigChange === 'function') {
    _onConfigChange(_brandConfig);
  }
}

// ========== 初始化事件绑定 ==========

export function initBrandEventBindings() {
  // 启用开关
  const toggle = $('brand-enabled-toggle');
  if (toggle) {
    toggle.addEventListener('change', () => toggleBrandEnabled(toggle.checked));
  }

  // Logo 上传
  const logoInput = $('brand-logo-input');
  if (logoInput) {
    logoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleLogoUpload(file);
      e.target.value = '';
    });
  }

  // Logo 移除
  const removeBtn = $('btn-brand-logo-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', removeLogo);
  }

  // Logo 位置
  const logoPos = $('brand-logo-position');
  if (logoPos) {
    logoPos.addEventListener('change', () => updateBrandField('logoPosition', logoPos.value));
  }

  // Logo 大小
  const logoSize = $('brand-logo-size');
  if (logoSize) {
    logoSize.addEventListener('input', () => {
      _brandConfig.logoSize = parseInt(logoSize.value) / 100;
      saveBrandConfig(_brandConfig);
      const valEl = $('brand-logo-size-val');
      if (valEl) valEl.textContent = logoSize.value + '%';
    });
  }

  // Logo 透明度
  const logoOpacity = $('brand-logo-opacity');
  if (logoOpacity) {
    logoOpacity.addEventListener('input', () => {
      _brandConfig.logoOpacity = parseInt(logoOpacity.value) / 100;
      saveBrandConfig(_brandConfig);
      const valEl = $('brand-logo-opacity-val');
      if (valEl) valEl.textContent = logoOpacity.value + '%';
    });
  }

  // 水印文字
  const wmText = $('brand-watermark-text');
  if (wmText) {
    wmText.addEventListener('input', () => updateBrandField('watermarkText', wmText.value));
  }

  // 水印位置
  const wmPos = $('brand-watermark-position');
  if (wmPos) {
    wmPos.addEventListener('change', () => updateBrandField('watermarkPosition', wmPos.value));
  }

  // 水印透明度
  const wmOpacity = $('brand-watermark-opacity');
  if (wmOpacity) {
    wmOpacity.addEventListener('input', () => {
      _brandConfig.watermarkOpacity = parseInt(wmOpacity.value) / 100;
      saveBrandConfig(_brandConfig);
      const valEl = $('brand-watermark-opacity-val');
      if (valEl) valEl.textContent = wmOpacity.value + '%';
    });
  }

  // 水印字体大小
  const wmFontSize = $('brand-watermark-fontsize');
  if (wmFontSize) {
    wmFontSize.addEventListener('input', () => {
      _brandConfig.watermarkFontSize = parseInt(wmFontSize.value);
      saveBrandConfig(_brandConfig);
      const valEl = $('brand-watermark-fontsize-val');
      if (valEl) valEl.textContent = wmFontSize.value + 'px';
    });
  }

  // 重置
  const resetBtn = $('btn-brand-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', handleResetBrand);
  }
}
