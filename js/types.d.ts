/**
 * 造境 ZaoJing 核心类型定义
 * 定义项目中的核心数据模型，供渐进式 TypeScript 迁移使用
 */

// ========== 导演模型 ==========

export interface Director {
  id: string;
  name: string;
  enName: string;
  avatar: string;
  tagline: string;
  styleDesc: string;
  keywords: string[];
  colors: DirectorColors;
  emotions: string[];
  available: boolean;
  fontFamily: string;
  titleWeight: number;
  promptCore: string;
  negativePrompt: string;
  quotes: string[];
  styleDNA: StyleDNA;
}

export interface DirectorColors {
  bg: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  textLight: string;
}

// ========== 风格 DNA ==========

export type ColorTemperature = 'warm' | 'cool' | 'neutral';
export type SaturationLevel = 'low' | 'medium' | 'high';
export type ContrastLevel = 'low' | 'medium' | 'high';
export type CompositionType = 'symmetric' | 'asymmetric' | 'centered';
export type LightingType = 'natural' | 'low-key' | 'high-key' | 'dramatic';
export type ScaleType = 'monumental' | 'medium' | 'intimate';
export type PaceType = 'dynamic' | 'static';
export type TextureType = 'smooth' | 'grainy' | 'handdrawn' | 'digital';

export interface StyleDNA {
  colorTemperature: ColorTemperature;
  saturation: SaturationLevel;
  contrast: ContrastLevel;
  compositionType: CompositionType;
  lightingType: LightingType;
  scale: ScaleType;
  pace: PaceType;
  texture: TextureType;
}

// ========== 情绪分析 ==========

export interface EmotionAnalysis {
  primaryEmotion: string;
  emotionIntensity: number;
  keywords: string[];
  summary?: string;
  recommendedDirectors: DirectorRecommendation[];
  suggestedTitles: string[];
  aiQuote: string;
}

export interface DirectorRecommendation {
  directorId: string;
  reason: string;
  matchScore: number;
}

// ========== 海报生成结果 ==========

export interface PosterResult {
  dataUrl: string;
  blobUrl?: string;
  engine: string;
  directorId: string;
  title: string;
  quote: string;
  format: PosterFormat;
  width?: number;
  height?: number;
  movieRef?: string;
  error?: string;
}

export type PosterFormat = 'vertical' | 'horizontal' | 'square' | 'grid9' | 'weibo' | 'xhs' | 'wechat' | 'douyin';

// ========== AI 引擎 ==========

export type AIEngine = 'seedream' | 'canvas';

// ========== 应用状态 ==========

export interface AppState {
  inputText: string;
  moodTagId: string | null;
  uploadedImage: string | null;
  selectedDirectorIds: string[];
  currentPosterIndex: number;
  posterResults: PosterResult[];
  isGenerating: boolean;
  genTimer: ReturnType<typeof setTimeout> | null;
  posterFormat: PosterFormat;
  customStyles: CustomStyle[];
  history: HistoryEntry[];
  wallItems: WallItem[];
  // AI 相关
  aiEngine: AIEngine;
  useAI: boolean;
  aiHealthStatus: HealthStatus | null;
  emotionAnalysis: EmotionAnalysis | null;
  imageEmotionAnalysis: boolean | null;
  // 风格相关
  styleSource: 'preset' | 'custom' | 'movie' | 'blend';
  currentCustomStyle: CustomStyle | null;
  activeCustomStyleId: string | null;
  movieStyle: CustomStyle | null;
  blendStyle: { a: string; b: string; ratio: number } | null;
  // UI 相关
  showQuote: boolean;
  currentTitle: string;
  altTitles: string[];
  currentQuote: string;
  currentQuoteIndex: number;
  voiceRecognition: SpeechRecognition | null;
  isListening: boolean;
  cocreateContributors: string[];
  cocreateAnalysis: unknown | null;
  trailerTimer: ReturnType<typeof setTimeout> | null;
}

// ========== 历史记录 ==========

export interface HistoryEntry {
  id: string;
  title: string;
  director: string;
  thumb: string;
  fullImage: string;
  createdAt: number;
}

// ========== 自定义风格 ==========

export interface CustomStyle {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  colors: DirectorColors;
  styleDNA: StyleDNA;
  promptCore: string;
  source: 'custom' | 'movie' | 'blend';
}

// ========== 电影墙 ==========

export interface WallItem {
  id: string;
  title: string;
  director: string;
  thumb: string;
  fullImage: string;
  createdAt: number;
}

// ========== 健康检查 ==========

export interface HealthStatus {
  status: string;
  uptime: number;
  timestamp: string;
  engines: Record<string, boolean>;
  cache: Record<string, CacheStats>;
  cost: CostStats;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: string;
}

export interface CostStats {
  today: Record<string, ModelCost>;
  totalImages: number;
  totalTokens: number;
}

export interface ModelCost {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
  estimatedCost: number;
}

// ========== 心情标签 ==========

export interface MoodTag {
  id: string;
  label: string;
  emoji: string;
  emotion: string;
}

// ========== AI 客户端类型 ==========

export interface ApiFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown> | Array<unknown>;
  timeout?: number;
  signal?: AbortSignal;
}

export interface GenerateImageOptions {
  text: string;
  directorId: string;
  emotion?: string;
  engine?: AIEngine;
  size?: string;
  stylePrompt?: string;
  negativePrompt?: string;
}

export interface GenerateCopyOptions {
  text: string;
  directorId: string;
  emotion?: string;
  type?: string;
}

// 多平台适配文案（微博/小红书/抖音/微信）
export interface PlatformCopy {
  weibo: string;
  xhs: string;
  douyin: string;
  wechat: string;
}

export interface GeneratePlatformCopyOptions {
  text: string;
  directorId: string;
  emotion?: string;
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onDone?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

export interface ImageResult {
  dataUrl: string;
  engine: string;
}

export interface GenerateImageResponse {
  imageBase64?: string;
  imageUrl?: string;
  imageFormat?: string;
  engine: string;
}

export interface AgentCreateOptions {
  text: string;
  moodTagId?: string;
  directorIds?: string[];
  engine?: AIEngine;
  size?: string;
}

export interface SavePosterData {
  title: string;
  director: string;
  imageBase64: string;
  emotion: string;
}

export interface GenerateMovieImageOptions {
  text: string;
  stylePrompt: string;
  negativePrompt?: string;
  engine?: AIEngine;
  size?: string;
}

export interface BlendStylesOptions {
  styleA: CustomStyle;
  styleB: CustomStyle;
  ratio: number;
}

// ========== 海报模板 ==========

export type TemplateCategory = 'cinema' | 'emotion' | 'festival' | 'social' | 'custom';

export interface PosterTemplate {
  id: string;
  name: string;
  emoji: string;
  text: string;
  directorId: string;
  format: PosterFormat;
  moodTagId?: string;
  category: TemplateCategory;
  /** 用户自定义模板的创建时间 */
  createdAt?: number;
  /** 模板来源：preset 预设 / user 用户保存 */
  source: 'preset' | 'user';
}
