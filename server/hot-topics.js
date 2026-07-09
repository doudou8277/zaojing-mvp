/**
 * 造境 ZaoJing — 热点话题追踪模块
 * 汇聚微博/抖音/知乎/B站热搜，提供本地降级数据与缓存
 *
 * 数据来源：
 *  - 若配置了第三方聚合 API（HOT_TOPICS_API_URL），则远程拉取
 *  - 否则使用内置的本地模拟数据（按平台组织），保证 MVP 可用
 *
 * 缓存策略：内存缓存 + TTL（默认 5 分钟），避免高频请求外部 API
 */

const logger = require('./logger');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
const HOT_TOPICS_API_URL = process.env.HOT_TOPICS_API_URL;
const HOT_TOPICS_API_KEY = process.env.HOT_TOPICS_API_KEY;

// 平台元数据
const PLATFORMS = {
  weibo: { id: 'weibo', label: '微博热搜', color: '#e6162d', icon: '📱' },
  douyin: { id: 'douyin', label: '抖音热榜', color: '#25f4ee', icon: '🎵' },
  zhihu: { id: 'zhihu', label: '知乎热榜', color: '#0084ff', icon: '💡' },
  bilibili: { id: 'bilibili', label: 'B站热门', color: '#fb7299', icon: '📺' },
};

// 内置本地降级数据（模拟各平台热搜）
// 说明：实际生产环境应通过 HOT_TOPICS_API_URL 接入真实数据源
const LOCAL_TOPICS = {
  weibo: [
    { rank: 1, title: '国产科幻电影迎来新突破', hot: 4823567, category: '娱乐' },
    { rank: 2, title: '年轻人为什么爱上看老电影', hot: 3921456, category: '社会' },
    { rank: 3, title: '这部小众文艺片值得一看', hot: 2893245, category: '影视' },
    { rank: 4, title: '电影节最佳海报设计评选', hot: 2156789, category: '设计' },
    { rank: 5, title: '导演访谈电影美学密码', hot: 1876234, category: '访谈' },
    { rank: 6, title: '城市夜景摄影大赛作品', hot: 1654321, category: '摄影' },
    { rank: 7, title: '经典电影重映票房破亿', hot: 1432198, category: '影视' },
    { rank: 8, title: '动画电影技术新高度', hot: 1287654, category: '动画' },
    { rank: 9, title: '胶片摄影复兴潮流', hot: 1098765, category: '摄影' },
    { rank: 10, title: '电影配乐大师回顾展', hot: 987654, category: '音乐' },
  ],
  douyin: [
    { rank: 1, title: '变装大片拍摄教程', hot: 3921876, category: '教程' },
    { rank: 2, title: '一分钟看完经典电影', hot: 3456789, category: '影视' },
    { rank: 3, title: '电影感vlog拍摄技巧', hot: 2987654, category: '教程' },
    { rank: 4, title: '复古胶片风滤镜推荐', hot: 2345678, category: '滤镜' },
    { rank: 5, title: '王家卫风格转场合集', hot: 2098765, category: '转场' },
    { rank: 6, title: '电影海报配色灵感', hot: 1876543, category: '设计' },
    { rank: 7, title: '深夜emo文案配音', hot: 1654321, category: '文案' },
    { rank: 8, title: '黑白电影美学复兴', hot: 1432198, category: '美学' },
    { rank: 9, title: '城市废墟探险视频', hot: 1287654, category: '探险' },
    { rank: 10, title: '雨夜街头摄影记录', hot: 1098765, category: '摄影' },
  ],
  zhihu: [
    { rank: 1, title: '如何评价今年的科幻电影热潮', hot: 2876543, category: '影视' },
    { rank: 2, title: '电影海报设计有哪些经典流派', hot: 2345678, category: '设计' },
    { rank: 3, title: '为什么文艺片越来越受欢迎', hot: 2098765, category: '影视' },
    { rank: 4, title: '电影配色对情绪的影响有多大', hot: 1876543, category: '美学' },
    { rank: 5, title: '胶片电影和数字电影的本质区别', hot: 1654321, category: '技术' },
    { rank: 6, title: '哪些电影海报堪称艺术品', hot: 1432198, category: '艺术' },
    { rank: 7, title: '独立电影的生存现状如何', hot: 1287654, category: '行业' },
    { rank: 8, title: '电影构图的基本原则是什么', hot: 1098765, category: '摄影' },
  ],
  bilibili: [
    { rank: 1, title: '超燃电影混剪合集', hot: 3456789, category: '混剪' },
    { rank: 2, title: '用AI做电影海报全过程', hot: 2987654, category: '教程' },
    { rank: 3, title: '经典电影镜头语言解析', hot: 2654321, category: '解析' },
    { rank: 4, title: '复古胶片风调色教学', hot: 2098765, category: '调色' },
    { rank: 5, title: '王家卫电影美学拆解', hot: 1876543, category: '美学' },
    { rank: 6, title: '电影配乐创作幕后', hot: 1654321, category: '音乐' },
    { rank: 7, title: '一镜到底拍摄挑战', hot: 1432198, category: '挑战' },
    { rank: 8, title: '黑白摄影艺术纪录片', hot: 1287654, category: '纪录片' },
  ],
};

// 内存缓存
let _cache = null;
let _cacheTimestamp = 0;

/**
 * 从远程 API 拉取热搜数据
 * @returns {Promise<Object|null>}
 */
async function fetchRemoteTopics() {
  if (!HOT_TOPICS_API_URL) return null;

  try {
    const headers = {};
    if (HOT_TOPICS_API_KEY) {
      headers['Authorization'] = `Bearer ${HOT_TOPICS_API_KEY}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(HOT_TOPICS_API_URL, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`远程 API 返回 ${response.status}`);
    }

    const data = await response.json();
    // 期望格式：{ weibo: [...], douyin: [...], ... }
    if (data && typeof data === 'object') {
      return data;
    }
    return null;
  } catch (e) {
    logger.warn({ err: e.message }, '[hot-topics] 远程拉取失败，使用本地数据');
    return null;
  }
}

/**
 * 获取所有平台的热搜数据
 * @param {boolean} [forceRefresh=false] - 强制刷新缓存
 * @returns {Promise<Object>}
 */
async function getAllTopics(forceRefresh = false) {
  const now = Date.now();
  if (_cache && !forceRefresh && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cache;
  }

  // 尝试远程拉取
  const remote = await fetchRemoteTopics();
  const topics = remote || LOCAL_TOPICS;

  _cache = topics;
  _cacheTimestamp = now;

  return topics;
}

/**
 * 获取指定平台的热搜数据
 * @param {string} platform - 平台 ID（weibo/douyin/zhihu/bilibili）
 * @returns {Promise<Array>}
 */
async function getPlatformTopics(platform) {
  if (!PLATFORMS[platform]) {
    return [];
  }
  const all = await getAllTopics();
  return all[platform] || [];
}

/**
 * 获取平台元数据列表
 * @returns {Array}
 */
function getPlatforms() {
  return Object.values(PLATFORMS);
}

/**
 * 搜索热搜话题（跨平台）
 * @param {string} keyword
 * @returns {Promise<Array>}
 */
async function searchTopics(keyword) {
  if (!keyword || typeof keyword !== 'string') return [];
  const all = await getAllTopics();
  const results = [];
  const lowerKey = keyword.toLowerCase();

  for (const [platformId, topics] of Object.entries(all)) {
    for (const topic of topics) {
      if (!topic || !topic.title || typeof topic.title !== 'string') continue;
      if (topic.title.toLowerCase().includes(lowerKey)) {
        results.push({ ...topic, platform: platformId });
      }
    }
  }

  return results;
}

/**
 * 清除缓存（测试与管理接口使用）
 */
function clearCache() {
  _cache = null;
  _cacheTimestamp = 0;
}

module.exports = {
  PLATFORMS,
  getAllTopics,
  getPlatformTopics,
  getPlatforms,
  searchTopics,
  clearCache,
};
