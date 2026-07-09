/**
 * 造境 ZaoJing — 全局命名常量
 * 将散落在代码中的魔法数字集中管理，便于维护与调整
 */

// ========== 存储限制 ==========
/** localStorage 单 key 安全上限 (4MB) */
export const STORAGE_KEY_LIMIT = 4 * 1024 * 1024;
/** localStorage 总容量保守估计 (5MB) */
export const STORAGE_TOTAL_LIMIT = 5 * 1024 * 1024;

// ========== API 超时（毫秒） ==========
/** 健康检查超时 */
export const API_TIMEOUT_HEALTH = 5000;
/** 情绪分析/图片分析/风格融合超时 */
export const API_TIMEOUT_ANALYZE = 15000;
/** 图片生成/Agent 全链路超时 */
export const API_TIMEOUT_GENERATE = 90000;
/** SSE 流式生成超时 */
export const API_TIMEOUT_SSE = 120000;
/** 默认请求超时 */
export const API_TIMEOUT_DEFAULT = 60000;
/** 文案生成/风格解析/电影分析超时 */
export const API_TIMEOUT_COPY = 30000;
/** 保存海报超时 */
export const API_TIMEOUT_SAVE = 10000;
/** Worker 渲染超时 */
export const API_TIMEOUT_WORKER = 10000;

// ========== 限流配置 ==========
/** 限流时间窗口（毫秒） */
export const RATE_LIMIT_WINDOW_MS = 60000;
/** 分析类接口最大请求数/窗口 */
export const RATE_LIMIT_MAX_ANALYZE = 20;
/** 生图类接口最大请求数/窗口 */
export const RATE_LIMIT_MAX_GENERATE = 15;
/** 管理类接口最大请求数/窗口 */
export const RATE_LIMIT_MAX_ADMIN = 10;
/** 错误上报最大请求数/窗口 */
export const RATE_LIMIT_MAX_ERROR_REPORT = 30;
/** 保存操作最大请求数/窗口 */
export const RATE_LIMIT_MAX_SAVE = 30;
/** 画廊/读取类最大请求数/窗口 */
export const RATE_LIMIT_MAX_GALLERY = 60;

// ========== 海报生成配置 ==========
/** 默认海报宽度 px */
export const POSTER_DEFAULT_WIDTH = 1024;
/** 默认海报高度 px */
export const POSTER_DEFAULT_HEIGHT = 1536;

// --- 文字字号比例（相对于画布短边） ---
/** 竖版标题字号比例 */
export const TITLE_FONT_RATIO_V = 0.085;
/** 横版标题字号比例 */
export const TITLE_FONT_RATIO_H = 0.1;
/** 竖版金句字号比例 */
export const QUOTE_FONT_RATIO_V = 0.038;
/** 横版金句字号比例 */
export const QUOTE_FONT_RATIO_H = 0.04;
/** 竖版导演署名字号比例 */
export const CREDIT_FONT_RATIO_V = 0.03;
/** 横版导演署名字号比例 */
export const CREDIT_FONT_RATIO_H = 0.035;
/** 标题能量影响系数（情绪强度影响字号放大） */
export const TITLE_ENERGY_SCALE = 0.15;

// --- 文字阴影 ---
/** 文字阴影模糊 px */
export const TEXT_SHADOW_BLUR = 12;
/** 文字阴影 Y 偏移 px */
export const TEXT_SHADOW_OFFSET_Y = 3;

// --- Canvas 水印 / 品牌标识 ---
/** 顶部品牌文字 */
export const BRAND_WATERMARK_TEXT = 'ZAOJING · 造境';
/** 品牌文字字号比例 */
export const BRAND_WATERMARK_FONT_RATIO = 0.022;
/** 品牌文字透明度 */
export const BRAND_WATERMARK_ALPHA = 0.4;
/** 品牌文字 Y 位置比例 */
export const BRAND_WATERMARK_Y_RATIO = 0.05;

// --- AI 背景暗角强度 ---
/** AI 图片模式暗角强度 */
export const VIGNETTE_INTENSITY_AI = 0.4;
/** Canvas 模式暗角强度 */
export const VIGNETTE_INTENSITY_CANVAS = 0.25;

// ========== 情绪分析阈值 ==========
/** 情绪强度高阈值 */
export const EMOTION_INTENSITY_HIGH = 0.7;
/** 情绪强度中阈值 */
export const EMOTION_INTENSITY_MEDIUM = 0.4;

// ========== 热度分数阈值 ==========
/** 热度：上升阈值 */
export const HEAT_WARM_THRESHOLD = 50;
/** 热度：高热阈值 */
export const HEAT_HOT_THRESHOLD = 70;
/** 热度：爆表阈值 */
export const HEAT_EXTREME_THRESHOLD = 90;
