/**
 * 多账号矩阵管理工具模块单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MATRIX_PLATFORMS,
  ACCOUNT_STATUS,
  loadAccounts,
  saveAccounts,
  addAccount,
  removeAccount,
  updateAccount,
  getAccountsByPlatform,
  getActiveAccounts,
  recordPublish,
  getMatrixStats,
  createPublishTask,
  getPlatformConfig,
  getStatusLabel,
  getStatusColor,
} from '../utils/account-manager.js';

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock localStorage
const mockStore = {};
const localStorageMock = {
  getItem: vi.fn((key) => mockStore[key] || null),
  setItem: vi.fn((key, value) => {
    mockStore[key] = value;
  }),
  removeItem: vi.fn((key) => {
    delete mockStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('MATRIX_PLATFORMS', () => {
  it('应包含 4 个平台', () => {
    expect(MATRIX_PLATFORMS).toHaveLength(4);
  });

  it('应包含微博、小红书、微信、抖音', () => {
    const ids = MATRIX_PLATFORMS.map((p) => p.id);
    expect(ids).toContain('weibo');
    expect(ids).toContain('xhs');
    expect(ids).toContain('wechat');
    expect(ids).toContain('douyin');
  });

  it('每个平台应有完整配置', () => {
    for (const p of MATRIX_PLATFORMS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.icon).toBeTruthy();
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.maxContentLength).toBeGreaterThan(0);
      expect(typeof p.supportsImage).toBe('boolean');
      expect(typeof p.supportsVideo).toBe('boolean');
    }
  });

  it('平台 ID 应唯一', () => {
    const ids = MATRIX_PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ACCOUNT_STATUS', () => {
  it('应包含四种状态', () => {
    expect(ACCOUNT_STATUS.ACTIVE).toBe('active');
    expect(ACCOUNT_STATUS.EXPIRED).toBe('expired');
    expect(ACCOUNT_STATUS.BANNED).toBe('banned');
    expect(ACCOUNT_STATUS.PENDING).toBe('pending');
  });
});

describe('addAccount', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应成功添加账号', () => {
    const account = addAccount({ platform: 'weibo', nickname: '测试账号' });
    expect(account.id).toMatch(/^acc_/);
    expect(account.platform).toBe('weibo');
    expect(account.nickname).toBe('测试账号');
    expect(account.status).toBe(ACCOUNT_STATUS.ACTIVE);
    expect(account.publishCount).toBe(0);
    expect(account.addedAt).toBeTruthy();
  });

  it('不支持的平台应抛出错误', () => {
    expect(() => addAccount({ platform: 'invalid', nickname: '测试' })).toThrow();
  });

  it('空昵称应抛出错误', () => {
    expect(() => addAccount({ platform: 'weibo', nickname: '' })).toThrow();
    expect(() => addAccount({ platform: 'weibo' })).toThrow();
  });

  it('同平台同昵称应抛出错误', () => {
    addAccount({ platform: 'weibo', nickname: '重复' });
    expect(() => addAccount({ platform: 'weibo', nickname: '重复' })).toThrow();
  });

  it('不同平台同昵称可以添加', () => {
    addAccount({ platform: 'weibo', nickname: '同名' });
    expect(() => addAccount({ platform: 'xhs', nickname: '同名' })).not.toThrow();
  });
});

describe('loadAccounts / saveAccounts', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('空存储应返回空数组', () => {
    expect(loadAccounts()).toEqual([]);
  });

  it('保存后应能读取', () => {
    const accounts = [{ id: 'test1', platform: 'weibo', nickname: '测试' }];
    saveAccounts(accounts);
    expect(loadAccounts()).toEqual(accounts);
  });

  it('JSON 解析失败应返回空数组', () => {
    mockStore['zaojing_accounts'] = '{invalid';
    expect(loadAccounts()).toEqual([]);
  });
});

describe('removeAccount', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应删除存在的账号', () => {
    const account = addAccount({ platform: 'weibo', nickname: '待删除' });
    expect(removeAccount(account.id)).toBe(true);
    expect(loadAccounts()).toHaveLength(0);
  });

  it('删除不存在的账号应返回 false', () => {
    expect(removeAccount('nonexistent')).toBe(false);
  });
});

describe('updateAccount', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应更新账号字段', () => {
    const account = addAccount({ platform: 'weibo', nickname: '旧昵称' });
    const updated = updateAccount(account.id, { nickname: '新昵称', status: ACCOUNT_STATUS.EXPIRED });
    expect(updated.nickname).toBe('新昵称');
    expect(updated.status).toBe(ACCOUNT_STATUS.EXPIRED);
  });

  it('不存在的账号应返回 null', () => {
    expect(updateAccount('nonexistent', { nickname: 'test' })).toBeNull();
  });
});

describe('getAccountsByPlatform', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应按平台过滤账号', () => {
    addAccount({ platform: 'weibo', nickname: '微博号' });
    addAccount({ platform: 'xhs', nickname: '小红书号' });
    addAccount({ platform: 'weibo', nickname: '另一个微博号' });

    const weiboAccounts = getAccountsByPlatform('weibo');
    expect(weiboAccounts).toHaveLength(2);
    expect(weiboAccounts.every((a) => a.platform === 'weibo')).toBe(true);
  });
});

describe('getActiveAccounts', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应只返回活跃账号', () => {
    const a1 = addAccount({ platform: 'weibo', nickname: '活跃' });
    const a2 = addAccount({ platform: 'xhs', nickname: '过期' });
    updateAccount(a2.id, { status: ACCOUNT_STATUS.EXPIRED });

    const active = getActiveAccounts();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(a1.id);
  });
});

describe('recordPublish', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应增加发布次数', () => {
    const account = addAccount({ platform: 'weibo', nickname: '发布测试' });
    recordPublish(account.id);
    recordPublish(account.id);
    const accounts = loadAccounts();
    expect(accounts[0].publishCount).toBe(2);
    expect(accounts[0].lastPublishAt).toBeTruthy();
  });

  it('不存在的账号应静默失败', () => {
    expect(() => recordPublish('nonexistent')).not.toThrow();
  });
});

describe('getMatrixStats', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应正确统计矩阵信息', () => {
    addAccount({ platform: 'weibo', nickname: '微博1' });
    addAccount({ platform: 'weibo', nickname: '微博2' });
    addAccount({ platform: 'xhs', nickname: '小红书1' });

    const stats = getMatrixStats();
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(3);
    expect(stats.expired).toBe(0);
    expect(stats.totalPublishes).toBe(0);
    expect(stats.byPlatform.weibo).toBe(2);
    expect(stats.byPlatform.xhs).toBe(1);
    expect(stats.byPlatform.wechat).toBe(0);
  });
});

describe('createPublishTask', () => {
  beforeEach(() => {
    Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  });

  it('应创建发布任务', () => {
    const a1 = addAccount({ platform: 'weibo', nickname: '账号1' });
    const a2 = addAccount({ platform: 'xhs', nickname: '账号2' });

    const task = createPublishTask([a1.id, a2.id], { title: '测试', copy: '内容' });
    expect(task.id).toMatch(/^task_/);
    expect(task.total).toBe(2);
    expect(task.pending).toBe(2);
    expect(task.tasks).toHaveLength(2);
  });

  it('空账号列表应抛出错误', () => {
    expect(() => createPublishTask([], {})).toThrow();
  });

  it('不存在的账号应标记为失败', () => {
    const task = createPublishTask(['nonexistent'], {});
    expect(task.tasks[0].status).toBe('failed');
    expect(task.pending).toBe(0);
  });

  it('已过期的账号应标记为失败', () => {
    const account = addAccount({ platform: 'weibo', nickname: '过期' });
    updateAccount(account.id, { status: ACCOUNT_STATUS.EXPIRED });
    const task = createPublishTask([account.id], {});
    expect(task.tasks[0].status).toBe('failed');
  });
});

describe('getPlatformConfig', () => {
  it('应返回指定平台配置', () => {
    const config = getPlatformConfig('weibo');
    expect(config).not.toBeNull();
    expect(config.id).toBe('weibo');
    expect(config.label).toBe('微博');
  });

  it('不存在的平台应返回 null', () => {
    expect(getPlatformConfig('nonexistent')).toBeNull();
  });
});

describe('getStatusLabel', () => {
  it('应返回正确的中文标签', () => {
    expect(getStatusLabel(ACCOUNT_STATUS.ACTIVE)).toBe('正常');
    expect(getStatusLabel(ACCOUNT_STATUS.EXPIRED)).toBe('已过期');
    expect(getStatusLabel(ACCOUNT_STATUS.BANNED)).toBe('已封禁');
    expect(getStatusLabel(ACCOUNT_STATUS.PENDING)).toBe('待验证');
  });

  it('未知状态应返回"未知"', () => {
    expect(getStatusLabel('unknown')).toBe('未知');
  });
});

describe('getStatusColor', () => {
  it('应返回正确的颜色', () => {
    expect(getStatusColor(ACCOUNT_STATUS.ACTIVE)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getStatusColor(ACCOUNT_STATUS.EXPIRED)).toMatch(/^#[0-9a-f]{6}$/i);
    expect(getStatusColor(ACCOUNT_STATUS.BANNED)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('未知状态应返回默认颜色', () => {
    expect(getStatusColor('unknown')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
