/**
 * 造境 ZaoJing — 热点话题联动（前端工具模块）
 * 拉取微博/抖音/知乎/B站热搜，提供本地降级数据
 * 用户可一键选用话题作为海报创作灵感
 */

import { logger } from './logger.js';

// ========== 平台元数据 ==========
export const HOT_PLATFORMS = [
  { id: 'weibo', label: '微博热搜', color: '#e6162d', icon: '📱' },
  { id: 'douyin', label: '抖音热榜', color: '#25f4ee', icon: '🎵' },
  { id: 'zhihu', label: '知乎热榜', color: '#0084ff', icon: '💡' },
  { id: 'bilibili', label: 'B站热门', color: '#fb7299', icon: '📺' },
];

// ========== 本地降级数据 ==========
// 后端不可用时使用，保证 MVP 可用
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

/**
 * 获取本地降级热搜数据
 * @returns {Object}
 */
export function getLocalHotTopics() {
  // 返回深拷贝，避免外部修改污染
  return JSON.parse(JSON.stringify(LOCAL_TOPICS));
}

/**
 * 从后端拉取热搜数据
 * 失败时降级为本地数据
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<Object>}
 */
export async function fetchHotTopics(forceRefresh = false) {
  try {
    const url = forceRefresh ? '/api/hot-topics?refresh=1' : '/api/hot-topics';
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data && data.topics && typeof data.topics === 'object') {
      return data.topics;
    }
    throw new Error('响应格式异常');
  } catch (e) {
    logger.warn('[hot-topics] 后端拉取失败，使用本地数据:', e.message);
    return getLocalHotTopics();
  }
}

/**
 * 格式化热度数值（万 / 亿）
 * @param {number} hot
 * @returns {string}
 */
export function formatHotValue(hot) {
  if (typeof hot !== 'number' || isNaN(hot)) return '0';
  if (hot >= 100000000) {
    return (hot / 100000000).toFixed(1) + '亿';
  }
  if (hot >= 10000) {
    return (hot / 10000).toFixed(1) + '万';
  }
  return String(hot);
}

/**
 * 获取话题的分类标签颜色
 * @param {string} category
 * @returns {string}
 */
export function getCategoryColor(category) {
  const colorMap = {
    影视: '#e74c3c',
    娱乐: '#e67e22',
    社会: '#3498db',
    设计: '#9b59b6',
    摄影: '#1abc9c',
    教程: '#2ecc71',
    音乐: '#f39c12',
    美学: '#e84393',
    访谈: '#6c5ce7',
    动画: '#fd79a8',
    滤镜: '#a29bfe',
    转场: '#74b9ff',
    文案: '#55efc4',
    探险: '#00b894',
    技术: '#0984e3',
    艺术: '#d63031',
    行业: '#636e72',
    混剪: '#e17055',
    解析: '#00cec9',
    调色: '#fab1a0',
    挑战: '#ff7675',
    纪录片: '#81ecec',
  };
  return colorMap[category] || '#95a5a6';
}

/**
 * 将话题标题转化为海报创作文案
 * @param {Object} topic - { title, category, platform }
 * @returns {string}
 */
export function topicToPrompt(topic) {
  if (!topic || !topic.title) return '';
  const platformLabels = {
    weibo: '微博热搜',
    douyin: '抖音热榜',
    zhihu: '知乎热榜',
    bilibili: 'B站热门',
  };
  const source = platformLabels[topic.platform] || '热搜';
  return `来自${source}：「${topic.title}」`;
}
