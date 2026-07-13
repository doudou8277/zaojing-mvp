/**
 * 造境 ZaoJing API 请求校验模块
 * 基于 Zod，为每个端点定义 Schema 并提供校验中间件
 */

const { z } = require('zod');

// ========== Schema 定义 ==========

// 允许的导演 ID 白名单（与前端 data.js 保持同步）
// 保留供未来校验使用
const ALLOWED_DIRECTOR_IDS = [
  'miyazaki',
  'wkw',
  'koreeda',
  'wes',
  'nolan',
  'chow',
  'jia',
  'lee',
  'kurosawa',
  'coppola',
  'chazelle',
  'tarantino',
  'movie-custom',
  'custom',
  'grid9',
];

// 允许的引擎（纯火山引擎方案）
const ALLOWED_ENGINES = ['seedream', 'canvas'];

// 允许的尺寸
const ALLOWED_SIZES = ['vertical', 'horizontal', 'square', 'grid9', 'weibo', 'xhs', 'wechat', 'douyin'];

// 文本输入：非空字符串，最大 500 字
const textSchema = z.string().trim().min(1, '请输入文字内容').max(500, '文字内容不能超过 500 字');

// 情绪分析
const analyzeSchema = z.object({
  text: textSchema,
  moodTagId: z.string().nullish(),
});

// 图片生成
const generateImageSchema = z.object({
  text: textSchema,
  directorId: z.string().min(1, '缺少导演 ID'),
  emotion: z.string().nullish(),
  engine: z.enum(ALLOWED_ENGINES).optional().default('seedream'),
  size: z.enum(ALLOWED_SIZES).optional().default('vertical'),
  stylePrompt: z.string().max(2000).nullish(),
  negativePrompt: z.string().max(1000).nullish(),
});

// 文案生成
const generateCopySchema = z.object({
  text: textSchema,
  directorId: z.string().min(1, '缺少导演 ID'),
  emotion: z.string().nullish(),
  type: z.string().nullish(),
});

// Agent 编排
const agentCreateSchema = z.object({
  text: textSchema,
  moodTagId: z.string().nullish(),
  directorIds: z.array(z.string()).optional(),
  engine: z.enum(ALLOWED_ENGINES).optional().default('seedream'),
  size: z.enum(ALLOWED_SIZES).optional().default('vertical'),
});

// 图片分析
const analyzeImageSchema = z.object({
  imageBase64: z.string().min(100, '缺少图片数据').max(15_000_000, '图片数据过大'),
});

// 风格解析
const parseStyleSchema = z.object({
  description: z.string().trim().min(1, '请输入风格描述').max(500, '描述不能超过 500 字'),
});

// 电影分析
const analyzeMovieSchema = z.object({
  movieName: z.string().trim().min(1, '请输入电影名称').max(200, '电影名称过长'),
});

// 风格混搭
const blendStylesSchema = z.object({
  styleA: z.record(z.unknown()),
  styleB: z.record(z.unknown()),
  ratio: z.number().min(0).max(1).optional().default(0.5),
});

// 风格推荐
const recommendStyleSchema = z.object({
  emotion: z.string().min(1, '缺少情绪参数'),
  styles: z.array(z.record(z.unknown())).optional().default([]),
});

// 保存海报
const savePosterSchema = z
  .object({
    title: z.string().max(200).optional(),
    director: z.string().max(100).optional(),
    imageBase64: z.string().max(15_000_000).optional(),
    emotion: z.string().max(100).optional(),
  })
  .refine((data) => data.title || data.imageBase64, {
    message: '缺少海报信息',
  });

// 合规检测
const complianceCheckSchema = z.object({
  content: z.string().min(1, '缺少 content').max(2000, '内容过长'),
  type: z.enum(['emotion', 'copy', 'image']).optional().default('copy'),
});

// 热搜搜索关键词（路径参数校验）
const hotTopicKeywordSchema = z.object({
  keyword: z
    .string()
    .min(1, '缺少关键词')
    .max(64, '关键词过长')
    .regex(/^[\u4e00-\u9fa5a-zA-Z0-9\s,.;:!?，。；：！？、'"《》\-_\u3000]+$/, '关键词包含非法字符'),
});

// 空 body 校验（用于不接受请求体的 POST 端点，拒绝意外字段）
const emptyBodySchema = z.object({}).strict().optional().or(z.undefined());

// 旅行票根分析
const ticketAnalyzeSchema = z.object({
  imageBase64: z.string().min(100, '缺少图片数据').max(20_000_000, '图片数据过大（最大支持15MB图片）'),
  destination: z.string().max(200).optional(),
  date: z.string().max(50).optional(),
});

// 旅行票根文案生成（imageBase64 可选，因为当前文案生成主要基于文本字段）
const ticketCopySchema = z.object({
  imageBase64: z.string().max(20_000_000, '图片数据过大').optional(),
  destination: z.string().max(200).optional(),
  date: z.string().max(50).optional(),
  emotion: z.string().max(100).optional(),
  sceneType: z.string().max(100).optional(),
});

// ========== 校验中间件工厂 ==========

/**
 * 创建校验中间件
 * @param {z.ZodSchema} schema - Zod schema
 * @param {'body' | 'query' | 'params'} source - 校验来源
 */
function validate(schema, source) {
  source = source || 'body';
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const firstError = result.error.issues[0];
      // 统一错误响应格式：{ error: { code, message }, requestId?, details }
      return res.status(400).json({
        error: { code: 400, message: firstError ? firstError.message : '请求参数校验失败' },
        ...(req && req.id && { requestId: req.id }),
        details: result.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    // 用校验后的数据替换原始数据（应用默认值、trim 等）
    req[source] = result.data;
    next();
  };
}

module.exports = {
  validate,
  schemas: {
    analyze: analyzeSchema,
    generateImage: generateImageSchema,
    generateCopy: generateCopySchema,
    agentCreate: agentCreateSchema,
    analyzeImage: analyzeImageSchema,
    parseStyle: parseStyleSchema,
    analyzeMovie: analyzeMovieSchema,
    blendStyles: blendStylesSchema,
    recommendStyle: recommendStyleSchema,
    savePoster: savePosterSchema,
    complianceCheck: complianceCheckSchema,
    hotTopicKeyword: hotTopicKeywordSchema,
    emptyBody: emptyBodySchema,
    ticketAnalyze: ticketAnalyzeSchema,
    ticketCopy: ticketCopySchema,
  },
};
