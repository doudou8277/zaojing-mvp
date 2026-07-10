/**
 * 造境 ZaoJing AI 客户端单元测试
 * 测试 js/ai-client.ts 中的 API 封装函数
 *
 * 测试策略：
 * - Mock 全局 fetch（vi.fn()），验证请求参数与响应处理
 * - 覆盖成功路径与错误路径（网络失败、429 限流、401 认证、500 服务器错误等）
 * - 流式接口（generateCopyStream）Mock ReadableStream + TextDecoder
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  checkHealth,
  analyzeEmotion,
  generateImage,
  generateCopy,
  generateCopyStream,
  getMovies,
  getMovieRanking,
  savePoster,
  analyzeImage,
} from '../ai-client.ts';

// ========== Mock fetch ==========
const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  global.fetch = mockFetch;
});

// ========== 辅助函数 ==========

/** 创建 mock JSON 响应对象 */
function mockJsonResponse({ ok = true, status = 200, json = {}, headers = {} } = {}) {
  return {
    ok,
    status,
    headers: {
      get: (name) => headers[name] ?? null,
    },
    json: () => Promise.resolve(json),
  };
}

/** 创建 mock 流式响应对象（SSE） */
function mockStreamResponse(chunks, { ok = true, status = 200, json = {} } = {}) {
  const encoder = new TextEncoder();
  const encoded = chunks.map((c) => encoder.encode(c));
  let i = 0;
  return {
    ok,
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(json),
    body: {
      getReader: () => ({
        read: () => {
          if (i < encoded.length) {
            return Promise.resolve({ done: false, value: encoded[i++] });
          }
          return Promise.resolve({ done: true, value: undefined });
        },
      }),
    },
  };
}

/**
 * 共用：测试 apiFetch 层的统一错误处理路径。
 * 适用于所有基于 apiFetch 的函数。
 */
function sharedApiFetchErrorTests(label, triggerFn) {
  describe(`${label} - apiFetch 错误处理`, () => {
    it('网络失败时应抛出网络连接错误', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(triggerFn()).rejects.toThrow('网络连接失败，请检查网络后重试');
    });

    it('429 限流且带 Retry-After 头时应提示重试时间', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: 429, headers: { 'Retry-After': '30' } }));
      await expect(triggerFn()).rejects.toThrow('请求过于频繁，请稍后再试（30 秒后可重试）');
    });

    it('429 限流不带 Retry-After 头时应提示稍后再试', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: 429 }));
      await expect(triggerFn()).rejects.toThrow('请求过于频繁，请稍后再试');
    });

    it('401 认证失败时应抛出 API 认证错误', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: 401 }));
      await expect(triggerFn()).rejects.toThrow('API 认证失败，请检查 API Key 配置');
    });

    it('500 服务器错误且响应体含 error 字段时应抛出该错误信息', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: 500, json: { error: '服务器内部错误' } }));
      await expect(triggerFn()).rejects.toThrow('服务器内部错误');
    });

    it('500 服务器错误且响应体不含 error 字段时应抛出带状态码的默认错误', async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: 500, json: {} }));
      await expect(triggerFn()).rejects.toThrow('请求失败 (500)');
    });

    it('响应体 JSON 解析失败且状态非 OK 时应抛出无效响应错误', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: { get: () => null },
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });
      await expect(triggerFn()).rejects.toThrow('服务器返回了无效响应');
    });
  });
}

// ========== checkHealth ==========

describe('checkHealth', () => {
  it('健康检查成功时应返回健康状态对象', async () => {
    const healthData = {
      status: 'ok',
      uptime: 1234,
      timestamp: '2026-06-25T00:00:00Z',
      engines: { seedream: true },
      cache: {},
      cost: { today: {}, totalImages: 0, totalTokens: 0 },
    };
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, status: 200, json: healthData }));

    const result = await checkHealth();
    expect(result).toEqual(healthData);
  });

  it('应以 GET 方式请求 /api/health 且不带请求体', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: { status: 'ok' } }));

    await checkHealth();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/health');
    // checkHealth 传入 { signal } 用于超时控制
    const options = mockFetch.mock.calls[0][1];
    expect(options).toBeDefined();
    expect(options.signal).toBeDefined();
    expect(options.method).toBeUndefined();
    expect(options.body).toBeUndefined();
  });

  it('网络失败时应返回 null 而非抛出错误', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await checkHealth();
    expect(result).toBeNull();
  });

  it('响应非 OK 时应返回 null', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: 503 }));
    const result = await checkHealth();
    expect(result).toBeNull();
  });
});

// ========== analyzeEmotion ==========

describe('analyzeEmotion', () => {
  const mockEmotionAnalysis = {
    primaryEmotion: '喜悦',
    emotionIntensity: 0.8,
    keywords: ['阳光', '温暖'],
    recommendedDirectors: [],
    suggestedTitles: ['光之诗'],
    aiQuote: '阳光洒满心田',
  };

  it('应成功返回情绪分析结果', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: mockEmotionAnalysis }));

    const result = await analyzeEmotion('今天阳光真好，心情愉快', 'happy');
    expect(result).toEqual(mockEmotionAnalysis);
  });

  it('应以 POST 方式请求 /api/analyze 并传递正确的请求体', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: mockEmotionAnalysis }));

    await analyzeEmotion('我感到很开心', 'happy');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/analyze');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ text: '我感到很开心', moodTagId: 'happy' });
  });

  it('不传 moodTagId 时请求体中应省略该字段', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: mockEmotionAnalysis }));

    await analyzeEmotion('一段文字');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ text: '一段文字' });
    expect(body).not.toHaveProperty('moodTagId');
  });

  sharedApiFetchErrorTests('analyzeEmotion', () => analyzeEmotion('测试文本'));
});

// ========== generateImage ==========

describe('generateImage', () => {
  it('后端返回 imageBase64 时应拼装为 data URL', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        ok: true,
        json: { imageBase64: 'aGVsbG8=', engine: 'seedream' },
      })
    );

    const result = await generateImage({
      text: '日落',
      directorId: 'wong-kar-wai',
      emotion: '忧郁',
      engine: 'seedream',
      size: '1024x1024',
    });

    expect(result).toEqual({
      dataUrl: 'data:image/png;base64,aGVsbG8=',
      engine: 'seedream',
    });
  });

  it('后端返回 imageUrl 时应直接用作 dataUrl', async () => {
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({
        ok: true,
        json: { imageUrl: 'https://example.com/img.png', engine: 'canvas' },
      })
    );

    const result = await generateImage({
      text: '日落',
      directorId: 'wong-kar-wai',
    });

    expect(result).toEqual({
      dataUrl: 'https://example.com/img.png',
      engine: 'canvas',
    });
  });

  it('应以 POST 方式请求 /api/generate-image 并传递完整请求体', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: { imageBase64: 'img', engine: 'seedream' } }));

    await generateImage({
      text: '日落',
      directorId: 'wong-kar-wai',
      emotion: '忧郁',
      engine: 'seedream',
      size: '1024x1024',
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/generate-image');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({
      text: '日落',
      directorId: 'wong-kar-wai',
      emotion: '忧郁',
      engine: 'seedream',
      size: '1024x1024',
    });
  });

  it('后端既不返回 imageBase64 也不返回 imageUrl 时应抛出错误', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: { engine: 'seedream' } }));

    await expect(generateImage({ text: '日落', directorId: 'wong-kar-wai' })).rejects.toThrow('未收到图片数据');
  });

  sharedApiFetchErrorTests('generateImage', () => generateImage({ text: '日落', directorId: 'wong-kar-wai' }));
});

// ========== generateCopy ==========

describe('generateCopy', () => {
  it('应成功返回文案生成结果', async () => {
    const mockCopy = { title: '光之诗', quote: '阳光洒满心田' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: mockCopy }));

    const result = await generateCopy({
      text: '日落',
      directorId: 'wong-kar-wai',
      emotion: '忧郁',
      type: 'title',
    });

    expect(result).toEqual(mockCopy);
  });

  it('应以 POST 方式请求 /api/generate-copy 并传递正确的请求体', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: {} }));

    await generateCopy({
      text: '日落',
      directorId: 'wong-kar-wai',
      emotion: '忧郁',
      type: 'title',
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/generate-copy');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({
      text: '日落',
      directorId: 'wong-kar-wai',
      emotion: '忧郁',
      type: 'title',
    });
  });

  sharedApiFetchErrorTests('generateCopy', () => generateCopy({ text: '日落', directorId: 'wong-kar-wai' }));
});

// ========== generateCopyStream ==========

describe('generateCopyStream', () => {
  it('应正确处理 SSE 流：逐 token 回调并在完成时调用 onDone', async () => {
    const sseChunks = [
      'event: token\ndata: {"token":"你好"}\n\n',
      'event: token\ndata: {"token":"世界"}\n\n',
      'event: done\ndata: {"text":"你好世界"}\n\n',
    ];
    mockFetch.mockResolvedValueOnce(mockStreamResponse(sseChunks));

    const onToken = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await generateCopyStream({ text: '日落', directorId: 'wong-kar-wai' }, { onToken, onDone, onError });

    expect(onToken).toHaveBeenCalledTimes(2);
    expect(onToken).toHaveBeenNthCalledWith(1, '你好');
    expect(onToken).toHaveBeenNthCalledWith(2, '世界');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith({ text: '你好世界' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('应以 POST 方式请求 /api/generate-copy-stream 并传递正确的请求体', async () => {
    mockFetch.mockResolvedValueOnce(mockStreamResponse(['event: done\ndata: {}\n\n']));

    await generateCopyStream({ text: '日落', directorId: 'wong-kar-wai', emotion: '忧郁', type: 'title' }, {});

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/generate-copy-stream');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({
      text: '日落',
      directorId: 'wong-kar-wai',
      emotion: '忧郁',
      type: 'title',
    });
  });

  it('跨 chunk 的 SSE 事件应被正确缓冲拼接', async () => {
    // 将一个 event 行拆分到两个 chunk 中，验证缓冲机制
    const sseChunks = [
      'event: tok', // 不完整的事件类型行
      'en\ndata: {"token":"OK"}\n\n', // 补全 + data 行
      'event: done\ndata: {}\n\n',
    ];
    mockFetch.mockResolvedValueOnce(mockStreamResponse(sseChunks));

    const onToken = vi.fn();
    const onDone = vi.fn();

    await generateCopyStream({ text: '日落', directorId: 'wong-kar-wai' }, { onToken, onDone });

    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onToken).toHaveBeenCalledWith('OK');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('流中出现 error 事件时应调用 onError', async () => {
    const sseChunks = ['event: token\ndata: {"token":"部分内容"}\n\n', 'event: error\ndata: {"error":"生成中断"}\n\n'];
    mockFetch.mockResolvedValueOnce(mockStreamResponse(sseChunks));

    const onToken = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();

    await generateCopyStream({ text: '日落', directorId: 'wong-kar-wai' }, { onToken, onDone, onError });

    expect(onToken).toHaveBeenCalledWith('部分内容');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('生成中断');
  });

  it('error 事件无 error 字段时应使用默认错误信息', async () => {
    mockFetch.mockResolvedValueOnce(mockStreamResponse(['event: error\ndata: {}\n\n']));

    const onError = vi.fn();
    await generateCopyStream({ text: '日落', directorId: 'wong-kar-wai' }, { onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('流式生成错误');
  });

  it('网络失败时应调用 onError 而非抛出异常', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const onError = vi.fn();
    const onToken = vi.fn();
    const onDone = vi.fn();

    await generateCopyStream({ text: '日落', directorId: 'wong-kar-wai' }, { onToken, onDone, onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('网络连接失败，请检查网络后重试');
    expect(onToken).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('响应非 OK 且含 error 字段时应调用 onError 并传递错误信息', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: false, status: 500, json: { error: '服务不可用' } }));

    const onError = vi.fn();
    await generateCopyStream({ text: '日落', directorId: 'wong-kar-wai' }, { onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('服务不可用');
  });

  it('响应非 OK 且 JSON 解析失败时应使用带状态码的默认错误信息', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: () => Promise.reject(new SyntaxError('parse error')),
    });

    const onError = vi.fn();
    await generateCopyStream({ text: '日落', directorId: 'wong-kar-wai' }, { onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('请求失败 (503)');
  });

  it('未提供回调时不应报错（使用默认空函数）', async () => {
    mockFetch.mockResolvedValueOnce(
      mockStreamResponse(['event: token\ndata: {"token":"x"}\n\n', 'event: done\ndata: {}\n\n'])
    );

    // 不传任何回调，应正常完成不抛错
    await expect(generateCopyStream({ text: '日落', directorId: 'wong-kar-wai' }, {})).resolves.toBeUndefined();
  });
});

// ========== getMovies ==========

describe('getMovies', () => {
  it('应成功返回电影列表', async () => {
    const movies = [
      { id: '1', name: '电影A' },
      { id: '2', name: '电影B' },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: movies }));

    const result = await getMovies();
    expect(result).toEqual(movies);
  });

  it('应以 GET 方式请求 /api/movies 且不带请求体', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: [] }));

    await getMovies();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/movies');
    expect(options.method).toBe('GET');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBeUndefined();
  });

  sharedApiFetchErrorTests('getMovies', () => getMovies());
});

// ========== getMovieRanking ==========

describe('getMovieRanking', () => {
  it('应成功返回电影排行榜', async () => {
    const ranking = [
      { movieId: '1', rank: 1, score: 9.5 },
      { movieId: '2', rank: 2, score: 9.0 },
    ];
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: ranking }));

    const result = await getMovieRanking();
    expect(result).toEqual(ranking);
  });

  it('应以 GET 方式请求 /api/movies/ranking', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: [] }));

    await getMovieRanking();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/movies/ranking');
    expect(options.method).toBe('GET');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.body).toBeUndefined();
  });

  sharedApiFetchErrorTests('getMovieRanking', () => getMovieRanking());
});

// ========== savePoster ==========

describe('savePoster', () => {
  const posterData = {
    title: '光之诗',
    director: '王家卫',
    imageBase64: 'aGVsbG8=',
    emotion: '忧郁',
  };

  it('应成功保存海报并返回结果', async () => {
    const mockResult = { success: true, id: 'poster-001' };
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: mockResult }));

    const result = await savePoster(posterData);
    expect(result).toEqual(mockResult);
  });

  it('应以 POST 方式请求 /api/mcp/save-poster 并传递完整请求体', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: {} }));

    await savePoster(posterData);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/mcp/save-poster');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({
      title: '光之诗',
      director: '王家卫',
      imageBase64: 'aGVsbG8=',
      emotion: '忧郁',
    });
  });

  sharedApiFetchErrorTests('savePoster', () => savePoster(posterData));
});

// ========== analyzeImage ==========

describe('analyzeImage', () => {
  const mockAnalysis = {
    primaryEmotion: '宁静',
    emotionIntensity: 0.6,
    keywords: ['夜空', '星辰'],
    recommendedDirectors: [],
    suggestedTitles: ['星夜'],
    aiQuote: '繁星点点',
  };

  it('应成功返回图片情绪分析结果', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: mockAnalysis }));

    const result = await analyzeImage('base64data');
    expect(result).toEqual(mockAnalysis);
  });

  it('应以 POST 方式请求 /api/analyze-image 并传递 imageBase64', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ ok: true, json: mockAnalysis }));

    await analyzeImage('data:image/png;base64,xxxx');

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/analyze-image');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ imageBase64: 'data:image/png;base64,xxxx' });
  });

  sharedApiFetchErrorTests('analyzeImage', () => analyzeImage('base64data'));
});
