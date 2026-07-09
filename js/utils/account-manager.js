/**
 * 造境 ZaoJing — 多账号矩阵管理工具模块
 * 管理微博/小红书/微信/抖音等多平台账号，支持一键多平台发布
 *
 * 数据模型：
 *  - Account: { id, platform, nickname, avatar, status, addedAt, lastPublishAt, publishCount }
 *
 * 持久化：localStorage
 */

import { logger } from './logger.js';

// ========== 平台定义 ==========
export const MATRIX_PLATFORMS = [
  {
    id: 'weibo',
    label: '微博',
    icon: '📱',
    color: '#e6162d',
    maxContentLength: 2000,
    supportsImage: true,
    supportsVideo: false,
  },
  {
    id: 'xhs',
    label: '小红书',
    icon: '📕',
    color: '#ff2442',
    maxContentLength: 1000,
    supportsImage: true,
    supportsVideo: true,
  },
  {
    id: 'wechat',
    label: '微信公众号',
    icon: '💬',
    color: '#07c160',
    maxContentLength: 20000,
    supportsImage: true,
    supportsVideo: true,
  },
  {
    id: 'douyin',
    label: '抖音',
    icon: '🎵',
    color: '#25f4ee',
    maxContentLength: 500,
    supportsImage: true,
    supportsVideo: true,
  },
];

// ========== 默认配置 ==========
const STORAGE_KEY = 'zaojing_accounts';
const MAX_ACCOUNTS = 20;

// ========== 账号状态 ==========
export const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  BANNED: 'banned',
  PENDING: 'pending',
};

// ========== localStorage 持久化 ==========

/**
 * 加载所有账号
 * @returns {Array}
 */
export function loadAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const accounts = JSON.parse(raw);
      if (Array.isArray(accounts)) return accounts;
    }
  } catch (e) {
    logger.warn('[account-manager] 读取账号失败:', e.message);
  }
  return [];
}

/**
 * 保存账号列表
 * @param {Array} accounts
 */
export function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch (e) {
    logger.warn('[account-manager] 保存账号失败:', e.message);
  }
}

// ========== 账号 CRUD ==========

/**
 * 添加账号
 * @param {Object} options
 * @returns {Object} 新建的账号对象
 */
export function addAccount({ platform, nickname, avatar, accessToken }) {
  const platformConfig = MATRIX_PLATFORMS.find((p) => p.id === platform);
  if (!platformConfig) {
    throw new Error(`不支持的平台: ${platform}`);
  }

  if (!nickname || typeof nickname !== 'string') {
    throw new Error('账号昵称不能为空');
  }

  const accounts = loadAccounts();
  if (accounts.length >= MAX_ACCOUNTS) {
    throw new Error(`已达账号上限（${MAX_ACCOUNTS} 个）`);
  }

  // 检查同平台同昵称是否已存在
  const existing = accounts.find(
    (a) => a.platform === platform && a.nickname === nickname
  );
  if (existing) {
    throw new Error(`该平台已存在同名账号: ${nickname}`);
  }

  const account = {
    id: 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    platform,
    nickname,
    avatar: avatar || '',
    accessToken: accessToken || '',
    status: ACCOUNT_STATUS.ACTIVE,
    addedAt: new Date().toISOString(),
    lastPublishAt: null,
    publishCount: 0,
  };

  accounts.push(account);
  saveAccounts(accounts);

  logger.info('[account-manager] 账号已添加:', platform, nickname);
  return account;
}

/**
 * 删除账号
 * @param {string} accountId
 * @returns {boolean}
 */
export function removeAccount(accountId) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex((a) => a.id === accountId);
  if (idx === -1) return false;
  accounts.splice(idx, 1);
  saveAccounts(accounts);
  return true;
}

/**
 * 更新账号信息
 * @param {string} accountId
 * @param {Object} updates
 * @returns {Object|null}
 */
export function updateAccount(accountId, updates) {
  const accounts = loadAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;

  const allowedFields = ['nickname', 'avatar', 'accessToken', 'status'];
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      account[field] = updates[field];
    }
  }

  saveAccounts(accounts);
  return account;
}

/**
 * 获取指定平台的账号
 * @param {string} platform
 * @returns {Array}
 */
export function getAccountsByPlatform(platform) {
  const accounts = loadAccounts();
  return accounts.filter((a) => a.platform === platform);
}

/**
 * 获取活跃账号
 * @returns {Array}
 */
export function getActiveAccounts() {
  const accounts = loadAccounts();
  return accounts.filter((a) => a.status === ACCOUNT_STATUS.ACTIVE);
}

// ========== 发布统计 ==========

/**
 * 记录一次发布
 * @param {string} accountId
 */
export function recordPublish(accountId) {
  const accounts = loadAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return;
  account.publishCount += 1;
  account.lastPublishAt = new Date().toISOString();
  saveAccounts(accounts);
}

/**
 * 获取矩阵统计信息
 * @returns {Object}
 */
export function getMatrixStats() {
  const accounts = loadAccounts();
  const byPlatform = {};
  for (const platform of MATRIX_PLATFORMS) {
    byPlatform[platform.id] = accounts.filter((a) => a.platform === platform.id).length;
  }

  return {
    total: accounts.length,
    active: accounts.filter((a) => a.status === ACCOUNT_STATUS.ACTIVE).length,
    expired: accounts.filter((a) => a.status === ACCOUNT_STATUS.EXPIRED).length,
    banned: accounts.filter((a) => a.status === ACCOUNT_STATUS.BANNED).length,
    totalPublishes: accounts.reduce((sum, a) => sum + (a.publishCount || 0), 0),
    byPlatform,
  };
}

// ========== 发布任务管理 ==========

/**
 * 创建多平台发布任务
 * @param {Array} accountIds - 目标账号 ID 列表
 * @param {Object} content - { posterDataUrl, title, copy, platforms }
 * @returns {Object} 发布任务
 */
export function createPublishTask(accountIds, content) {
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    throw new Error('请至少选择一个账号');
  }

  const accounts = loadAccounts();
  const tasks = accountIds.map((accountId) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      return { accountId, status: 'failed', error: '账号不存在' };
    }
    if (account.status !== ACCOUNT_STATUS.ACTIVE) {
      return { accountId, status: 'failed', error: `账号状态异常: ${account.status}` };
    }

    // 模拟发布（实际生产环境应调用平台 API）
    const platformConfig = MATRIX_PLATFORMS.find((p) => p.id === account.platform);
    return {
      accountId,
      platform: account.platform,
      nickname: account.nickname,
      status: 'pending',
      maxContentLength: platformConfig ? platformConfig.maxContentLength : 1000,
      contentLength: (content.copy || '').length,
    };
  });

  return {
    id: 'task_' + Date.now().toString(36),
    createdAt: new Date().toISOString(),
    content: {
      title: content.title || '',
      copy: content.copy || '',
      hasPoster: !!content.posterDataUrl,
    },
    tasks,
    total: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    completed: 0,
    failed: 0,
  };
}

/**
 * 模拟执行发布任务
 * @param {Object} task - createPublishTask 的返回值
 * @param {Function} [onProgress] - 进度回调
 * @returns {Promise<Object>} 更新后的任务
 */
export async function executePublishTask(task, onProgress) {
  for (const subTask of task.tasks) {
    if (subTask.status !== 'pending') continue;

    try {
      // 模拟网络延迟
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));

      // 模拟 90% 成功率
      if (Math.random() < 0.1) {
        throw new Error('网络超时');
      }

      subTask.status = 'success';
      task.completed += 1;
      recordPublish(subTask.accountId);
    } catch (e) {
      subTask.status = 'failed';
      subTask.error = e.message;
      task.failed += 1;
      logger.warn('[account-manager] 发布子任务失败:', subTask.accountId, e.message);
    }

    task.pending -= 1;
    if (typeof onProgress === 'function') {
      onProgress({
        total: task.total,
        completed: task.completed,
        failed: task.failed,
        pending: task.pending,
        current: subTask,
      });
    }
  }

  return task;
}

// ========== 辅助函数 ==========

/**
 * 获取平台配置
 * @param {string} platformId
 * @returns {Object|null}
 */
export function getPlatformConfig(platformId) {
  return MATRIX_PLATFORMS.find((p) => p.id === platformId) || null;
}

/**
 * 获取账号状态标签
 * @param {string} status
 * @returns {string}
 */
export function getStatusLabel(status) {
  const labels = {
    [ACCOUNT_STATUS.ACTIVE]: '正常',
    [ACCOUNT_STATUS.EXPIRED]: '已过期',
    [ACCOUNT_STATUS.BANNED]: '已封禁',
    [ACCOUNT_STATUS.PENDING]: '待验证',
  };
  return labels[status] || '未知';
}

/**
 * 获取账号状态颜色
 * @param {string} status
 * @returns {string}
 */
export function getStatusColor(status) {
  const colors = {
    [ACCOUNT_STATUS.ACTIVE]: '#27ae60',
    [ACCOUNT_STATUS.EXPIRED]: '#f39c12',
    [ACCOUNT_STATUS.BANNED]: '#e74c3c',
    [ACCOUNT_STATUS.PENDING]: '#3498db',
  };
  return colors[status] || '#95a5a6';
}
