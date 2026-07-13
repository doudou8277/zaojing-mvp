/**
 * 造境 ZaoJing — 多账号矩阵管理页面模块
 * 提供账号列表、添加/删除账号、一键多平台发布
 */

import { $, toast, escapeHtml, logger, closeModal } from '../shared.js';
import {
  MATRIX_PLATFORMS,
  ACCOUNT_STATUS,
  loadAccounts,
  addAccount,
  removeAccount,
  updateAccount,
  getActiveAccounts,
  getMatrixStats,
  createPublishTask,
  executePublishTask,
  getPlatformConfig,
  getStatusLabel,
  getStatusColor,
} from '../utils/account-manager.js';

// ========== 依赖注入 ==========
let _getPosterData = null;

/**
 * 初始化账号矩阵模块
 * @param {Object} deps
 * @param {Function} [deps.getPosterData] - 获取当前海报数据的函数
 */
export function setupAccountsPage({ getPosterData } = {}) {
  _getPosterData = getPosterData || null;
}

// ========== 弹窗管理 ==========

/**
 * 打开账号矩阵弹窗
 */
export function openAccountsModal() {
  const modalEl = $('accounts-modal');
  if (!modalEl) return;
  modalEl.style.display = 'flex';
  renderAccountsList();
  renderMatrixStats();
  renderPublishSection();
}

/**
 * 关闭账号矩阵弹窗
 */
export function closeAccountsModal() {
  closeModal('result-tools-modal');
}

// ========== 渲染 ==========

/**
 * 渲染矩阵统计
 */
function renderMatrixStats() {
  const statsEl = $('accounts-stats');
  if (!statsEl) return;

  const stats = getMatrixStats();
  statsEl.innerHTML = `
    <div class="account-stat-item">
      <span class="account-stat-value">${stats.total}</span>
      <span class="account-stat-label">总账号</span>
    </div>
    <div class="account-stat-item">
      <span class="account-stat-value" style="color:#27ae60">${stats.active}</span>
      <span class="account-stat-label">活跃</span>
    </div>
    <div class="account-stat-item">
      <span class="account-stat-value">${stats.totalPublishes}</span>
      <span class="account-stat-label">总发布</span>
    </div>
    ${MATRIX_PLATFORMS.map(
      (p) => `
      <div class="account-stat-item">
        <span class="account-stat-value" style="color:${p.color}">${stats.byPlatform[p.id] || 0}</span>
        <span class="account-stat-label"><svg class="ico"><use href="#i-${p.icon}"/></svg> ${p.label}</span>
      </div>
    `
    ).join('')}
  `;
}

/**
 * 渲染账号列表
 */
function renderAccountsList() {
  const listEl = $('accounts-list');
  if (!listEl) return;

  const accounts = loadAccounts();
  if (accounts.length === 0) {
    listEl.innerHTML = '<div class="accounts-empty">暂无账号，请点击下方"添加账号"</div>';
    return;
  }

  listEl.innerHTML = accounts
    .map((account) => {
      const platform = getPlatformConfig(account.platform);
      const statusColor = getStatusColor(account.status);
      const statusLabel = getStatusLabel(account.status);
      const avatarHtml = account.avatar
        ? `<img class="account-avatar" src="${escapeHtml(account.avatar)}" alt="">`
        : `<div class="account-avatar-placeholder" style="background:${platform ? platform.color : '#666'}">${escapeHtml(account.nickname.charAt(0))}</div>`;

      return `
      <div class="account-item" data-id="${escapeHtml(account.id)}">
        <label class="account-checkbox">
          <input type="checkbox" class="account-select" data-id="${escapeHtml(account.id)}"
                 ${account.status === ACCOUNT_STATUS.ACTIVE ? '' : 'disabled'}>
        </label>
        ${avatarHtml}
        <div class="account-info">
          <div class="account-name">
            <span class="account-platform-badge" style="background:${platform ? platform.color : '#666'}20;color:${platform ? platform.color : '#666'}">
              ${platform ? `<svg class="ico"><use href="#i-${platform.icon}"/></svg> ${platform.label}` : account.platform}
            </span>
            ${escapeHtml(account.nickname)}
          </div>
          <div class="account-meta">
            <span class="account-status" style="color:${statusColor}">● ${statusLabel}</span>
            <span class="account-publish-count">发布 ${account.publishCount || 0} 次</span>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm account-remove" data-id="${escapeHtml(account.id)}">删除</button>
      </div>
    `;
    })
    .join('');

  // 绑定删除按钮
  listEl.querySelectorAll('.account-remove').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (removeAccount(id)) {
        toast('账号已删除');
        renderAccountsList();
        renderMatrixStats();
        renderPublishSection();
      }
    };
  });

  // 绑定复选框
  listEl.querySelectorAll('.account-select').forEach((cb) => {
    cb.onchange = updatePublishButton;
  });
}

/**
 * 渲染发布区域
 */
function renderPublishSection() {
  const sectionEl = $('accounts-publish-section');
  if (!sectionEl) return;

  const activeAccounts = getActiveAccounts();
  if (activeAccounts.length === 0) {
    sectionEl.innerHTML = '<div class="accounts-publish-empty">请先添加活跃账号</div>';
    return;
  }

  sectionEl.innerHTML = `
    <div class="accounts-publish-actions">
      <button class="btn btn-ghost btn-sm" id="btn-select-all-accounts">全选</button>
      <button class="btn btn-ghost btn-sm" id="btn-deselect-all-accounts">取消全选</button>
      <button class="btn btn-primary btn-sm" id="btn-publish-matrix" disabled>
        <svg class="ico"><use href="#i-upload"/></svg> 一键发布到选中账号
      </button>
    </div>
    <div class="accounts-publish-progress" id="accounts-publish-progress" style="display:none"></div>
  `;

  // 全选/取消全选
  $('btn-select-all-accounts').onclick = () => {
    document.querySelectorAll('.account-select').forEach((cb) => {
      if (!cb.disabled) cb.checked = true;
    });
    updatePublishButton();
  };

  $('btn-deselect-all-accounts').onclick = () => {
    document.querySelectorAll('.account-select').forEach((cb) => {
      cb.checked = false;
    });
    updatePublishButton();
  };

  // 发布按钮
  $('btn-publish-matrix').onclick = handlePublish;
}

/**
 * 更新发布按钮状态
 */
function updatePublishButton() {
  const selected = document.querySelectorAll('.account-select:checked');
  const btn = $('btn-publish-matrix');
  if (btn) {
    btn.disabled = selected.length === 0;
    btn.innerHTML =
      selected.length > 0
        ? `<svg class="ico"><use href="#i-upload"/></svg> 一键发布到 ${selected.length} 个账号`
        : '<svg class="ico"><use href="#i-upload"/></svg> 一键发布到选中账号';
  }
}

// ========== 添加账号 ==========

/**
 * 显示添加账号表单
 */
export function showAddAccountForm() {
  const formEl = $('add-account-form');
  if (!formEl) return;

  // 渲染平台选择
  const platformSelect = $('new-account-platform');
  if (platformSelect) {
    platformSelect.innerHTML = MATRIX_PLATFORMS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
  }

  formEl.style.display = 'block';
}

/**
 * 隐藏添加账号表单
 */
export function hideAddAccountForm() {
  const formEl = $('add-account-form');
  if (formEl) formEl.style.display = 'none';

  // 清空表单
  const nicknameInput = $('new-account-nickname');
  if (nicknameInput) nicknameInput.value = '';
}

/**
 * 处理添加账号
 */
export function handleAddAccount() {
  const platformEl = $('new-account-platform');
  const nicknameEl = $('new-account-nickname');
  if (!platformEl || !nicknameEl) return;

  const platform = platformEl.value;
  const nickname = nicknameEl.value.trim();

  if (!nickname) {
    toast('请输入账号昵称');
    return;
  }

  try {
    addAccount({ platform, nickname });
    toast('账号添加成功');
    hideAddAccountForm();
    renderAccountsList();
    renderMatrixStats();
    renderPublishSection();
  } catch (e) {
    logger.warn('[accounts] 添加账号失败:', e.message);
    toast('添加失败：' + e.message);
  }
}

// ========== 发布 ==========

/**
 * 处理一键发布
 */
async function handlePublish() {
  const selected = document.querySelectorAll('.account-select:checked');
  if (selected.length === 0) return;

  const accountIds = Array.from(selected).map((cb) => cb.dataset.id);

  // 获取当前海报数据
  const posterData = _getPosterData ? _getPosterData() : null;

  const content = {
    posterDataUrl: posterData ? posterData.dataUrl : null,
    title: posterData ? posterData.title : '',
    copy: posterData ? posterData.quote || '' : '',
  };

  // 创建发布任务
  let task;
  try {
    task = createPublishTask(accountIds, content);
  } catch (e) {
    logger.warn('[accounts] 创建发布任务失败:', e.message);
    toast('创建发布任务失败：' + e.message);
    return;
  }

  // 显示进度
  const progressEl = $('accounts-publish-progress');
  if (progressEl) {
    progressEl.style.display = 'block';
    progressEl.innerHTML = '<div class="publish-progress-loading">正在发布...</div>';
  }

  // 禁用发布按钮
  const publishBtn = $('btn-publish-matrix');
  if (publishBtn) {
    publishBtn.disabled = true;
    publishBtn.textContent = '发布中...';
  }

  // 执行发布
  try {
    task = await executePublishTask(task, (progress) => {
      if (progressEl) {
        const pct = Math.round(((progress.completed + progress.failed) / progress.total) * 100);
        progressEl.innerHTML = `
          <div class="publish-progress-bar">
            <div class="publish-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="publish-progress-text">
            进度: ${progress.completed + progress.failed}/${progress.total}
            （成功 ${progress.completed}，失败 ${progress.failed}）
          </div>
        `;
      }
    });

    // 发布完成
    const successCount = task.completed;
    const failCount = task.failed;
    if (failCount === 0) {
      toast(`发布成功！已发布到 ${successCount} 个账号`);
    } else {
      toast(`发布完成：${successCount} 成功，${failCount} 失败`);
    }

    if (progressEl) {
      progressEl.innerHTML += `<div class="publish-progress-done"><svg class="ico"><use href="#i-check"/></svg> 发布完成</div>`;
    }
  } catch (e) {
    logger.error('[accounts] 发布失败:', e.message);
    toast('发布失败：' + e.message);
  } finally {
    // 恢复按钮
    if (publishBtn) {
      publishBtn.disabled = false;
      publishBtn.innerHTML = '<svg class="ico"><use href="#i-upload"/></svg> 一键发布到选中账号';
    }
    // 刷新列表（更新发布次数）
    renderAccountsList();
    renderMatrixStats();
  }
}

// ========== 事件绑定 ==========

/**
 * 初始化账号矩阵事件绑定
 */
export function initAccountsEventBindings() {
  const addBtn = $('btn-show-add-account');
  if (addBtn) {
    addBtn.onclick = showAddAccountForm;
  }

  const cancelAddBtn = $('btn-cancel-add-account');
  if (cancelAddBtn) {
    cancelAddBtn.onclick = hideAddAccountForm;
  }

  const confirmAddBtn = $('btn-confirm-add-account');
  if (confirmAddBtn) {
    confirmAddBtn.onclick = handleAddAccount;
  }
}

export default {
  setupAccountsPage,
  openAccountsModal,
  closeAccountsModal,
  initAccountsEventBindings,
};
