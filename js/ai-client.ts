/**
 * 造境 ZaoJing AI 客户端（TypeScript 版）
 * 封装与后端 AI API 的通信
 * 统一处理认证、错误、限流
 */

import type {
  ApiFetchOptions,
  GenerateImageOptions,
  GenerateCopyOptions,
  GeneratePlatformCopyOptions,
  PlatformCopy,
  StreamCallbacks,
  ImageResult,
  GenerateImageResponse,
  AgentCreateOptions,
  SavePosterData,
  GenerateMovieImageOptions,
  CustomStyle,
  HealthStatus,
  EmotionAnalysis,
} from './types.d';

import { logger } from './utils/logger.js';
import {
  API_TIMEOUT_HEALTH,
  API_TIMEOUT_ANALYZE,
  API_TIMEOUT_GENERATE,
  API_TIMEOUT_SSE,
  API_TIMEOUT_DEFAULT,
  API_TIMEOUT_COPY,
  API_TIMEOUT_SAVE,
} from './utils/constants.js';

// 后端 API 基础地址
const API_BASE = ''; // 同源访问，无需指定

// ========== 统一请求封装 ==========
// 返回类型为 `T | null`：当响应体非合法 JSON 但 HTTP 状态正常时降级返回 null，
// 调用方应处理 null 情况（见各调用处的 null 检查）。
//
// 支持 AbortController 超时与外部取消信号：
// - timeout: 请求超时时间（毫秒），默认 60000
// - signal: 外部传入的 AbortSignal（用于取消按钮等场景）
async function apiFetch<T = any>(url: string, options?: ApiFetchOptions): Promise<T | null> {
  options = options || {};
  const method = options.method || 'GET';
  const timeout = options.timeout ?? API_TIMEOUT_DEFAULT;
  const externalSignal = options.signal;

  // 构建请求头
  const headers: Record<string, string> = Object.assign({}, options.headers || {});
  headers['Content-Type'] = 'application/json';

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // 如果外部传入了 signal（用于取消按钮），监听它
  let cleanup: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      // 外部 signal 已经是 aborted 状态，立即中止
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      externalSignal.addEventListener('abort', onAbort);
      cleanup = () => externalSignal.removeEventListener('abort', onAbort);
    }
  }

  let response: Response;
  try {
    response = await fetch(API_BASE + url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    cleanup?.();

    if (err instanceof DOMException && err.name === 'AbortError') {
      if (externalSignal?.aborted) {
        logger.info('[ai-client] 请求被用户取消');
        throw new Error('用户取消了请求');
      }
      logger.warn('[ai-client] 请求超时');
      throw new Error('AI 生成需要较长时间，请稍后重试（当前服务器繁忙）');
    }
    logger.warn('[ai-client] 网络连接失败:', err instanceof Error ? err.message : String(err));
    throw new Error('网络连接失败，请检查网络后重试');
  }

  clearTimeout(timeoutId);
  cleanup?.();

  // 限流：429
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    let msg = '请求过于频繁，请稍后再试';
    if (retryAfter) msg += `（${retryAfter} 秒后可重试）`;
    throw new Error(msg);
  }

  // 认证失败：401
  if (response.status === 401) {
    throw new Error('API 认证失败，请检查 API Key 配置');
  }

  // 解析响应体
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch (parseErr) {
    if (!response.ok) {
      logger.warn(
        '[ai-client] 响应 JSON 解析失败（HTTP 错误状态）:',
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      );
      throw new Error('服务器返回了无效响应');
    }
    // 响应体不是 JSON 但 HTTP 状态正常，降级返回 null，调用方应检查
    logger.warn(
      '[ai-client] 响应体非 JSON，降级返回 null:',
      parseErr instanceof Error ? parseErr.message : String(parseErr)
    );
    return null;
  }

  if (!response.ok) {
    const errData = data as any;
    // 兼容多种错误格式：{error: "message"} | {error: {message: "..."}} | {message: "..."}
    let errMsg = `请求失败 (${response.status})`;
    if (typeof errData?.error === 'string') {
      errMsg = errData.error;
    } else if (errData?.error && typeof errData.error === 'object') {
      errMsg = errData.error.message || errData.error.msg || errMsg;
    } else if (typeof errData?.message === 'string') {
      errMsg = errData.message;
    }
    throw new Error(errMsg);
  }

  return data;
}

// ========== 情绪分析 ==========
export async function analyzeEmotion(
  text: string,
  moodTagId?: string,
  signal?: AbortSignal
): Promise<EmotionAnalysis | null> {
  return await apiFetch<EmotionAnalysis>('/api/analyze', {
    method: 'POST',
    body: { text, moodTagId: moodTagId ?? undefined },
    timeout: API_TIMEOUT_ANALYZE,
    signal,
  });
}

// ========== AI 图片生成 ==========
export async function generateImage(options: GenerateImageOptions, signal?: AbortSignal): Promise<ImageResult> {
  const { text, directorId, emotion, engine, size, stylePrompt, negativePrompt } = options;

  const result = await apiFetch<GenerateImageResponse>('/api/generate-image', {
    method: 'POST',
    body: {
      text,
      directorId,
      emotion: emotion ?? undefined,
      engine,
      size,
      stylePrompt: stylePrompt ?? undefined,
      negativePrompt: negativePrompt ?? undefined,
    },
    timeout: API_TIMEOUT_GENERATE,
    signal,
  });

  if (!result) {
    throw new Error('未收到图片数据');
  }

  // 优先使用 imageBase64（带正确的 MIME 类型），确保图片稳定显示
  // 其次使用 imageUrl（本地文件路径）
  if (result.imageBase64) {
    // 根据格式确定 MIME 类型
    const format = result.imageFormat || 'png';
    const mimeType = format === 'jpg' ? 'jpeg' : format;
    return {
      dataUrl: `data:image/${mimeType};base64,${result.imageBase64}`,
      engine: result.engine,
    };
  } else if (result.imageUrl) {
    return {
      dataUrl: result.imageUrl,
      engine: result.engine,
    };
  }

  throw new Error('未收到图片数据');
}

// ========== AI 文案生成 ==========
export async function generateCopy(options: GenerateCopyOptions, signal?: AbortSignal): Promise<any> {
  const { text, directorId, emotion, type } = options;
  return await apiFetch('/api/generate-copy', {
    method: 'POST',
    body: { text, directorId, emotion: emotion ?? undefined, type: type ?? undefined },
    timeout: API_TIMEOUT_COPY,
    signal,
  });
}

// ========== 多平台适配文案生成 ==========
// 一次生成微博/小红书/抖音/微信四版文案，复用 apiFetch 的统一错误处理
export async function generatePlatformCopy(
  params: GeneratePlatformCopyOptions,
  signal?: AbortSignal
): Promise<PlatformCopy | null> {
  const { text, directorId, emotion } = params;
  return await apiFetch<PlatformCopy>('/api/generate-platform-copy', {
    method: 'POST',
    body: { text, directorId, emotion: emotion ?? undefined },
    timeout: API_TIMEOUT_COPY,
    signal,
  });
}

// ========== AI 文案流式生成（SSE） ==========
export async function generateCopyStream(
  options: GenerateCopyOptions,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const { text, directorId, emotion, type } = options;
  const onToken = callbacks.onToken || (() => {});
  const onDone = callbacks.onDone || (() => {});
  const onError = callbacks.onError || (() => {});

  // 创建 AbortController 用于超时 + 外部取消
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_SSE); // SSE 流式超时

  let cleanup: (() => void) | null = null;
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort);
      cleanup = () => signal.removeEventListener('abort', onAbort);
    }
  }

  let response: Response;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    response = await fetch(API_BASE + '/api/generate-copy-stream', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, directorId, emotion: emotion ?? undefined, type: type ?? undefined }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    cleanup?.();
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) {
        logger.info('[ai-client] SSE 请求被用户取消');
        onError(new Error('用户取消了请求'));
      } else {
        logger.warn('[ai-client] SSE 请求超时');
        onError(new Error('请求超时，请稍后重试'));
      }
    } else {
      logger.warn('[ai-client] SSE 网络连接失败:', err instanceof Error ? err.message : String(err));
      onError(new Error('网络连接失败，请检查网络后重试'));
    }
    return;
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    cleanup?.();
    let errData: any;
    try {
      errData = await response.json();
    } catch (parseErr) {
      logger.warn(
        '[ai-client] 解析错误响应 JSON 失败',
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      );
    }
    onError(new Error(errData?.error || `请求失败 (${response.status})`));
    return;
  }

  // 读取 SSE 流
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      // 检查是否已被取消
      if (controller.signal.aborted) {
        if (signal?.aborted) {
          onError(new Error('用户取消了请求'));
        } else {
          onError(new Error('请求超时，请稍后重试'));
        }
        break;
      }

      const chunk = await reader.read();
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let eventType = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event: ')) {
          eventType = trimmed.slice(7);
        } else if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (eventType === 'token' && parsed.token) {
              onToken(parsed.token);
            } else if (eventType === 'done') {
              onDone(parsed);
            } else if (eventType === 'error') {
              onError(new Error(parsed.error || '流式生成错误'));
            }
          } catch (parseErr) {
            // SSE data 行可能是非 JSON 格式（如心跳/注释行），解析失败时跳过即可
            logger.debug(
              '[ai-client] SSE JSON 解析失败，跳过该行:',
              parseErr instanceof Error ? parseErr.message : String(parseErr)
            );
          }
          eventType = '';
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (signal?.aborted) {
        logger.info('[ai-client] SSE 读取被用户取消');
        onError(new Error('用户取消了请求'));
      } else {
        logger.warn('[ai-client] SSE 读取超时');
        onError(new Error('请求超时，请稍后重试'));
      }
    } else {
      logger.warn('[ai-client] SSE 流读取失败:', err instanceof Error ? err.message : String(err));
      onError(new Error('网络连接失败，请检查网络后重试'));
    }
  } finally {
    clearTimeout(timeoutId);
    cleanup?.();
    try {
      reader.releaseLock();
    } catch (releaseErr) {
      logger.debug(
        '[ai-client] 释放 SSE reader 失败（预期行为，流可能已关闭）:',
        releaseErr instanceof Error ? releaseErr.message : String(releaseErr)
      );
    }
  }
}

// ========== 健康检查 ==========
export async function checkHealth(signal?: AbortSignal): Promise<HealthStatus | null> {
  // 创建 AbortController 用于超时 + 外部取消
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_HEALTH); // 健康检查超时

  let cleanup: (() => void) | null = null;
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort);
      cleanup = () => signal.removeEventListener('abort', onAbort);
    }
  }

  try {
    const response = await fetch(API_BASE + '/api/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    cleanup?.();
    if (response.ok) {
      return (await response.json()) as HealthStatus;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    cleanup?.();
    // 服务器未启动、超时或取消，属于预期情况（后端可选），使用 debug 级别
    logger.debug('[ai-client] 健康检查失败（后端可能未启动）:', err instanceof Error ? err.message : String(err));
  }
  return null;
}

// ========== Agent 全链路编排 ==========
export async function agentCreate(options: AgentCreateOptions, signal?: AbortSignal): Promise<any> {
  const { text, moodTagId, directorIds, engine, size } = options;
  return await apiFetch('/api/agent/create', {
    method: 'POST',
    body: { text, moodTagId, directorIds, engine, size },
    timeout: API_TIMEOUT_GENERATE, // Agent 全链路包含生图，给较长超时
    signal,
  });
}

// ========== 图片情绪分析 ==========
export async function analyzeImage(imageBase64: string, signal?: AbortSignal): Promise<EmotionAnalysis | null> {
  return await apiFetch<EmotionAnalysis>('/api/analyze-image', {
    method: 'POST',
    body: { imageBase64 },
    timeout: API_TIMEOUT_ANALYZE,
    signal,
  });
}

// ========== MCP 保存海报 ==========
export async function savePoster(data: SavePosterData, signal?: AbortSignal): Promise<any> {
  const { title, director, imageBase64, emotion } = data;
  return await apiFetch('/api/mcp/save-poster', {
    method: 'POST',
    body: { title, director, imageBase64, emotion },
    timeout: API_TIMEOUT_SAVE,
    signal,
  });
}

// ========== MCP 读取画廊 ==========
export async function getGallery(signal?: AbortSignal): Promise<any> {
  return await apiFetch('/api/mcp/gallery', { method: 'GET', signal });
}

// ========== MCP 删除海报 ==========
export async function deletePoster(id: string, signal?: AbortSignal): Promise<any> {
  return await apiFetch(`/api/mcp/gallery/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    signal,
  });
}

// ========== MCP 获取导演参考素材 ==========
export async function getReference(directorId: string, signal?: AbortSignal): Promise<any> {
  return await apiFetch(`/api/mcp/reference/${encodeURIComponent(directorId)}`, {
    method: 'GET',
    signal,
  });
}

// ========== 图片转 base64 ==========
export function imageToBase64(imgElement: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = imgElement.naturalWidth;
  canvas.height = imgElement.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imgElement, 0, 0);
  try {
    return canvas.toDataURL('image/png');
  } catch (err) {
    // canvas 可能被跨域图片污染，toDataURL 会抛出 SecurityError
    logger.warn(
      '[ai-client] 图片转 base64 失败（可能是跨域画布污染）:',
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ========== 解析自定义风格描述 ==========
export async function parseCustomStyle(description: string, signal?: AbortSignal): Promise<CustomStyle | null> {
  return await apiFetch<CustomStyle>('/api/parse-style', {
    method: 'POST',
    body: { description },
    timeout: API_TIMEOUT_COPY,
    signal,
  });
}

// ========== 分析电影风格 ==========
export async function analyzeMovieStyle(movieName: string, signal?: AbortSignal): Promise<CustomStyle | null> {
  return await apiFetch<CustomStyle>('/api/analyze-movie', {
    method: 'POST',
    body: { movieName },
    timeout: API_TIMEOUT_COPY,
    signal,
  });
}

// ========== 混搭两个风格 ==========
export async function blendStyles(
  styleA: CustomStyle,
  styleB: CustomStyle,
  ratio: number,
  signal?: AbortSignal
): Promise<CustomStyle | null> {
  return await apiFetch<CustomStyle>('/api/blend-styles', {
    method: 'POST',
    body: { styleA, styleB, ratio },
    timeout: API_TIMEOUT_ANALYZE,
    signal,
  });
}

// ========== 根据情绪推荐风格 ==========
export async function recommendStyleByEmotion(
  emotion: string,
  styles: CustomStyle[],
  signal?: AbortSignal
): Promise<any> {
  return await apiFetch('/api/recommend-style', {
    method: 'POST',
    body: { emotion, styles },
    timeout: API_TIMEOUT_ANALYZE,
    signal,
  });
}

// ========== 热门电影 API ==========

export async function getMovies(signal?: AbortSignal): Promise<any> {
  return await apiFetch('/api/movies', { method: 'GET', signal });
}

export async function getMovieDetail(movieId: string, signal?: AbortSignal): Promise<any> {
  return await apiFetch(`/api/movies/${movieId}`, { method: 'GET', signal });
}

export async function getMovieRanking(signal?: AbortSignal): Promise<any> {
  return await apiFetch('/api/movies/ranking', { method: 'GET', signal });
}

export async function analyzeMovieDNA(movieId: string, signal?: AbortSignal): Promise<any> {
  return await apiFetch(`/api/movies/${movieId}/analyze-dna`, {
    method: 'POST',
    timeout: API_TIMEOUT_COPY,
    signal,
  });
}

export async function generateMovieImage(
  options: GenerateMovieImageOptions,
  signal?: AbortSignal
): Promise<ImageResult> {
  return generateImage(
    {
      text: options.text,
      directorId: 'movie-custom',
      emotion: '',
      engine: options.engine,
      size: options.size,
      stylePrompt: options.stylePrompt,
      negativePrompt: options.negativePrompt,
    },
    signal
  );
}
