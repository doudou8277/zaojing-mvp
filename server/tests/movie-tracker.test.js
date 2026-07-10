/**
 * movie-tracker.js 热门电影追踪模块单元测试
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const fs = require('fs');
const movieTracker = require('../movie-tracker');

// 使用 spyOn 替代 vi.mock，直接在真实 fs 模块上 spy
let statSyncSpy, readFileSyncSpy, writeFileSyncSpy, existsSyncSpy, renameSyncSpy, mkdirSyncSpy;
let _mtime = 100;

beforeEach(() => {
  _mtime++;
  statSyncSpy = vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: _mtime });
  readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
    JSON.stringify({
      movies: [],
      lastFetch: null,
      pendingReview: [],
    })
  );
  existsSyncSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');
  renameSyncSpy = vi.spyOn(fs, 'renameSync');
  mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('movie-tracker', () => {
  describe('loadData', () => {
    it('应从文件加载电影数据', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [{ id: 'm1' }],
          lastFetch: '2024-01-01',
          pendingReview: [],
        })
      );

      const data = movieTracker.loadData();
      expect(data.movies).toHaveLength(1);
      expect(data.movies[0].id).toBe('m1');
    });

    it('文件不存在时应返回默认空结构', () => {
      readFileSyncSpy.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const data = movieTracker.loadData();
      expect(data.movies).toEqual([]);
      expect(data.pendingReview).toEqual([]);
      expect(data.lastFetch).toBeNull();
    });

    it('缓存未过期时应直接返回缓存', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [{ id: 'cached' }],
          lastFetch: null,
          pendingReview: [],
        })
      );

      movieTracker.loadData();
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [{ id: 'changed' }],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const data = movieTracker.loadData();
      expect(data.movies[0].id).toBe('cached');
    });
  });

  describe('getApprovedMovies', () => {
    it('应返回已审核的电影列表', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [
            { id: 'm1', title: '电影A' },
            { id: 'm2', title: '电影B' },
          ],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const movies = movieTracker.getApprovedMovies();
      expect(movies).toHaveLength(2);
      expect(movies[0].title).toBe('电影A');
    });

    it('无数据时应返回空数组', () => {
      readFileSyncSpy.mockReturnValue(JSON.stringify({ movies: [], lastFetch: null, pendingReview: [] }));

      const movies = movieTracker.getApprovedMovies();
      expect(movies).toEqual([]);
    });
  });

  describe('getPendingMovies', () => {
    it('应返回待审核的电影列表', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [],
          lastFetch: null,
          pendingReview: [{ id: 'p1', title: '待审核电影' }],
        })
      );

      const pending = movieTracker.getPendingMovies();
      expect(pending).toHaveLength(1);
      expect(pending[0].title).toBe('待审核电影');
    });
  });

  describe('approveMovie', () => {
    it('应将待审核电影移至已审核列表', async () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [],
          lastFetch: null,
          pendingReview: [{ id: 'p1', title: '待审核', approved: false }],
        })
      );

      const result = movieTracker.approveMovie('p1');
      expect(result).toBeTruthy();
      expect(result.approved).toBe(true);
      expect(result.approvedAt).toBeTruthy();
      // saveData 异步写入（_writeQueue.then），需等待微任务完成
      await new Promise((r) => setTimeout(r, 10));
      expect(writeFileSyncSpy).toHaveBeenCalled();
    });

    it('应支持覆盖字段', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [],
          lastFetch: null,
          pendingReview: [{ id: 'p1', title: '原名', approved: false }],
        })
      );

      const result = movieTracker.approveMovie('p1', { title: '新名', featured: true });
      expect(result.title).toBe('新名');
      expect(result.featured).toBe(true);
    });

    it('审核不存在的电影应返回 null', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [],
          lastFetch: null,
          pendingReview: [{ id: 'p1' }],
        })
      );

      const result = movieTracker.approveMovie('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('rejectMovie', () => {
    it('应从待审核列表中移除电影', async () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [],
          lastFetch: null,
          pendingReview: [{ id: 'p1' }, { id: 'p2' }],
        })
      );

      const result = movieTracker.rejectMovie('p1');
      expect(result).toBe(true);
      // saveData 异步写入（_writeQueue.then），需等待微任务完成
      await new Promise((r) => setTimeout(r, 10));
      expect(writeFileSyncSpy).toHaveBeenCalled();
    });

    it('拒绝不存在的电影也应返回 true', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const result = movieTracker.rejectMovie('nonexistent');
      expect(result).toBe(true);
    });
  });

  describe('updateMovie', () => {
    it('应更新已审核电影的字段', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [{ id: 'm1', title: '原名', heatScore: 50 }],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const result = movieTracker.updateMovie('m1', { heatScore: 90, featured: true });
      expect(result).toBeTruthy();
      expect(result.heatScore).toBe(90);
      expect(result.featured).toBe(true);
      expect(result.title).toBe('原名');
    });

    it('更新不存在的电影应返回 null', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [{ id: 'm1' }],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const result = movieTracker.updateMovie('nonexistent', { heatScore: 99 });
      expect(result).toBeNull();
    });
  });

  describe('getRanking', () => {
    it('应按票房降序排列', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [
            { id: 'm1', title: 'A', boxOffice: 100, socialMentions: 50 },
            { id: 'm2', title: 'B', boxOffice: 500, socialMentions: 30 },
            { id: 'm3', title: 'C', boxOffice: 300, socialMentions: 100 },
          ],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const ranking = movieTracker.getRanking();
      expect(ranking.boxOfficeRank).toHaveLength(3);
      expect(ranking.boxOfficeRank[0].id).toBe('m2');
      expect(ranking.boxOfficeRank[1].id).toBe('m3');
      expect(ranking.boxOfficeRank[2].id).toBe('m1');
    });

    it('应按社交热度降序排列', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [
            { id: 'm1', title: 'A', boxOffice: 0, socialMentions: 50 },
            { id: 'm2', title: 'B', boxOffice: 0, socialMentions: 300 },
            { id: 'm3', title: 'C', boxOffice: 0, socialMentions: 100 },
          ],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const ranking = movieTracker.getRanking();
      expect(ranking.socialRank[0].id).toBe('m2');
      expect(ranking.socialRank[1].id).toBe('m3');
      expect(ranking.socialRank[2].id).toBe('m1');
    });

    it('票房为 0 的电影不应出现在票房榜', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [
            { id: 'm1', title: 'A', boxOffice: 0, socialMentions: 100 },
            { id: 'm2', title: 'B', boxOffice: 500, socialMentions: 50 },
          ],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const ranking = movieTracker.getRanking();
      expect(ranking.boxOfficeRank).toHaveLength(1);
      expect(ranking.boxOfficeRank[0].id).toBe('m2');
    });

    it('排行榜应包含 rank、id、title、value 字段', () => {
      readFileSyncSpy.mockReturnValue(
        JSON.stringify({
          movies: [{ id: 'm1', title: 'A', boxOffice: 500, socialMentions: 100 }],
          lastFetch: null,
          pendingReview: [],
        })
      );

      const ranking = movieTracker.getRanking();
      expect(ranking.boxOfficeRank[0]).toHaveProperty('rank', 1);
      expect(ranking.boxOfficeRank[0]).toHaveProperty('id', 'm1');
      expect(ranking.boxOfficeRank[0]).toHaveProperty('title', 'A');
      expect(ranking.boxOfficeRank[0]).toHaveProperty('value', 500);
    });

    it('排行榜最多返回 10 条', () => {
      const movies = Array.from({ length: 15 }, (_, i) => ({
        id: `m${i}`,
        title: `电影${i}`,
        boxOffice: 1000 - i * 10,
        socialMentions: 500 - i * 5,
      }));
      readFileSyncSpy.mockReturnValue(JSON.stringify({ movies, lastFetch: null, pendingReview: [] }));

      const ranking = movieTracker.getRanking();
      expect(ranking.boxOfficeRank).toHaveLength(10);
      expect(ranking.socialRank).toHaveLength(10);
    });

    it('无电影时应返回空排行榜', () => {
      readFileSyncSpy.mockReturnValue(JSON.stringify({ movies: [], lastFetch: null, pendingReview: [] }));

      const ranking = movieTracker.getRanking();
      expect(ranking.boxOfficeRank).toEqual([]);
      expect(ranking.socialRank).toEqual([]);
    });
  });

  describe('refreshMovies', () => {
    it('TMDB_API_KEY 未配置时应返回空结果', async () => {
      const origKey = process.env.TMDB_API_KEY;
      delete process.env.TMDB_API_KEY;

      const result = await movieTracker.refreshMovies();
      expect(result.fetched).toBe(0);

      process.env.TMDB_API_KEY = origKey;
    });
  });
});
