/**
 * 生成中页模块
 * 从 app.js 提取 — 负责海报生成流程（真实阶段反馈 + AI/Canvas 生图）
 */
import { $, state, navigate, sleep, toast, logger } from '../shared.js';
import { DIRECTORS, generateAltTitles } from '../data.js';
import * as AIClient from '../ai-client';
import { createModuleBoundary, getErrorMessage as _getErrMsg } from '../utils/error-boundary.js';
import { loadTypographyConfig, getEffectiveFontFamily } from '../utils/font-manager.js';
import { safeRevokeUrl } from '../utils/sanitize.js';

const posterBoundary = createModuleBoundary('PosterEngine');

// ========== 排版配置辅助 ==========
function _getCustomFontFamily() {
  const config = loadTypographyConfig();
  if (!config.enabled) return null;
  return getEffectiveFontFamily(config) || null;
}

function _getCustomTitleWeight() {
  const config = loadTypographyConfig();
  if (!config.enabled) return null;
  return typeof config.titleWeight === 'number' ? config.titleWeight : null;
}

// ========== 依赖注入 ==========
let _getPosterEngine = null;
let _getMovieModule = null;
let _showResultPage = null;
let _saveToHistory = null;

/**
 * 初始化生成中页模块，注入 app.js 中的依赖
 */
export function setupGeneratingPage({ getPosterEngine, getMovieModule, showResultPage, saveToHistory }) {
  _getPosterEngine = getPosterEngine;
  _getMovieModule = getMovieModule;
  _showResultPage = showResultPage;
  _saveToHistory = saveToHistory;
}

// ========== 阶段定义 ==========
const PHASES = {
  prepare:  { label: '导演正在为你选景…', progress: 5,  dots: 0 },
  analyze:  { label: '正在分析你的文字…', progress: 15, dots: 1 },
  select:   { label: '正在匹配导演风格…', progress: 30, dots: 2 },
  generate: { label: 'AI 正在拍摄…', subtext: '这可能需要 10-30 秒', progress: 70, dots: 4, indeterminate: true },
  compose:  { label: '正在绘制海报…', progress: 90, dots: 5 },
  done:     { label: '完成！', progress: 100, dots: 6 },
};

/** 取消标志 — 由取消按钮或外部设置 */
let _cancelled = false;

/** 当前生成流程的 AbortController — 用于中断正在进行的 API 请求 */
let _abortController = null;

// ========== Agent 推理过程日志（Thought/Action/Observation） ==========
let _reasoningEntries = [];
let _reasoningCounter = 0;

/**
 * 重置推理日志面板
 */
function _resetReasoningPanel() {
  _reasoningEntries = [];
  _reasoningCounter = 0;
  const panel = $('agent-reasoning-panel');
  const chain = $('agent-reasoning-chain');
  const count = $('agent-reasoning-count');
  const toggle = $('agent-reasoning-toggle');
  const body = $('agent-reasoning-body');
  if (panel) panel.style.display = 'none';
  if (chain) chain.innerHTML = '';
  if (count) count.textContent = '0';
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  if (body) body.hidden = true;
}

/**
 * 绑定推理面板折叠/展开交互
 */
function _bindReasoningToggle() {
  const toggle = $('agent-reasoning-toggle');
  const body = $('agent-reasoning-body');
  if (!toggle || !body) return;
  toggle.onclick = () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    body.hidden = expanded;
  };
}

/**
 * 添加一条推理步骤（Thought/Action/Observation）
 * @param {Object} entry
 * @param {string} entry.tool - 工具名称（如 analyze_emotion, generate_image）
 * @param {string} entry.thought - Agent 思考内容
 * @param {string} [entry.observation] - 观察结果（完成后填充）
 * @param {boolean} [entry.isError] - 是否为错误观察
 * @returns {{ updateObservation: (obs: string, isError?: boolean) => void, complete: () => void }}
 */
function _addReasoningEntry({ tool, thought, observation, isError }) {
  _reasoningCounter++;
  const idx = _reasoningCounter;
  const entry = { idx, tool, thought, observation: observation || '', isError: !!isError, pending: !observation };
  _reasoningEntries.push(entry);

  const panel = $('agent-reasoning-panel');
  const chain = $('agent-reasoning-chain');
  const count = $('agent-reasoning-count');
  if (panel) panel.style.display = 'block';
  if (count) count.textContent = String(_reasoningCounter);
  if (!chain) return { updateObservation: () => {}, complete: () => {} };

  const entryEl = document.createElement('div');
  entryEl.className = 'reasoning-entry';
  entryEl.dataset.idx = String(idx);
  entryEl.innerHTML = `
    <div class="reasoning-step">
      <span class="reasoning-step-num">${idx}</span>
      <span class="reasoning-tool">${tool}</span>
      ${!observation ? '<span class="reasoning-spinner"></span>' : ''}
    </div>
    <div class="reasoning-thought"></div>
    <div class="reasoning-obs ${isError ? 'error' : ''}" ${!observation ? 'style="display:none"' : ''}></div>
  `;
  // 使用 textContent 避免 XSS
  const thoughtEl = entryEl.querySelector('.reasoning-thought');
  if (thoughtEl) thoughtEl.textContent = thought;
  const obsEl = entryEl.querySelector('.reasoning-obs');
  if (obsEl && observation) obsEl.textContent = observation;
  chain.appendChild(entryEl);
  // 自动滚动到底部
  if (chain.parentElement) {
    chain.parentElement.scrollTop = chain.parentElement.scrollHeight;
  }

  return {
    updateObservation(obs, err) {
      entry.observation = obs;
      entry.isError = !!err;
      entry.pending = false;
      const spinner = entryEl.querySelector('.reasoning-spinner');
      if (spinner) spinner.remove();
      if (obsEl) {
        obsEl.textContent = obs;
        obsEl.style.display = '';
        obsEl.classList.toggle('error', !!err);
        obsEl.classList.toggle('success', !err);
      }
    },
    complete() {
      const spinner = entryEl.querySelector('.reasoning-spinner');
      if (spinner) spinner.remove();
      entry.pending = false;
    }
  };
}

/**
 * 截断长文本用于 Observation 展示（避免面板过长）
 */
function _truncateObs(text, maxLen = 120) {
  if (!text) return '';
  const str = String(text);
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
}

/**
 * 重置生成页面到初始状态（进度条、文字、步骤点、取消按钮）
 */
function _resetGeneratingUI() {
  const progressBar = $('gen-progress-bar');
  const genText = $('gen-text');
  const genSubtext = $('gen-subtext');
  const cancelBtn = $('gen-cancel-btn');
  const stepsEl = $('gen-steps');

  if (progressBar) {
    progressBar.style.width = '0%';
    progressBar.classList.remove('indeterminate');
    progressBar.setAttribute('aria-valuenow', '0');
  }
  if (genText) genText.textContent = '导演正在为你选景…';
  if (genSubtext) genSubtext.textContent = '';
  if (cancelBtn) cancelBtn.style.display = 'none';
  // 恢复步骤点（错误时会被替换为重试按钮）
  if (stepsEl && stepsEl.querySelector('#btn-retry-gen')) {
    stepsEl.innerHTML = Array.from({ length: 6 }, (_, i) =>
      `<div class="gen-step-dot${i === 0 ? ' active' : ''}"></div>`
    ).join('');
  }
  // 重新查询步骤点（innerHTML 已可能重建 DOM）
  const stepDots = document.querySelectorAll('.gen-step-dot');
  stepDots.forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i === 0) dot.classList.add('active');
  });
  // 重置 Agent 推理面板
  _resetReasoningPanel();
  _bindReasoningToggle();
}

/**
 * 设置当前阶段：更新文字、进度条、步骤点
 * @param {string} phaseKey - PHASES 中的键名
 * @param {Object} [opts]
 * @param {string} [opts.subtext] - 覆盖默认子文字
 * @param {boolean} [opts.indeterminate] - 是否使用不确定进度动画
 */
function _setPhase(phaseKey, opts = {}) {
  const phase = PHASES[phaseKey];
  if (!phase) return;

  const progressBar = $('gen-progress-bar');
  const genText = $('gen-text');
  const genSubtext = $('gen-subtext');
  const stepDots = document.querySelectorAll('.gen-step-dot');

  if (genText) genText.textContent = phase.label;
  if (genSubtext) {
    genSubtext.textContent = opts.subtext || phase.subtext || '';
  }

  const useIndeterminate = opts.indeterminate !== undefined ? opts.indeterminate : !!phase.indeterminate;

  if (progressBar) {
    if (useIndeterminate) {
      progressBar.classList.add('indeterminate');
      progressBar.style.width = phase.progress + '%';
    } else {
      progressBar.classList.remove('indeterminate');
      progressBar.style.width = phase.progress + '%';
    }
    progressBar.setAttribute('aria-valuenow', String(phase.progress));
  }

  // 更新步骤点
  const doneDots = phase.dots;
  stepDots.forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i < doneDots) dot.classList.add('done');
    else if (i === doneDots && doneDots < 6) dot.classList.add('active');
  });
}

/**
 * 显示取消按钮并绑定取消处理
 * @param {string} [returnPage='directors'] - 取消后返回的页面
 * @param {AbortController} [abortController] - 用于中断 API 请求的 AbortController
 */
function _showCancelButton(returnPage = 'directors', abortController = null) {
  const cancelBtn = $('gen-cancel-btn');
  if (!cancelBtn) return;
  _cancelled = false;
  _abortController = abortController;
  cancelBtn.style.display = 'block';
  cancelBtn.onclick = () => {
    _cancelled = true;
    // 中止正在进行的 API 请求
    if (_abortController) {
      _abortController.abort();
      _abortController = null;
    }
    cancelBtn.style.display = 'none';
    // 重置 UI 以便下次进入时干净
    const progressBar = $('gen-progress-bar');
    if (progressBar) progressBar.classList.remove('indeterminate');
    navigate(returnPage);
  };
}

function _hideCancelButton() {
  const cancelBtn = $('gen-cancel-btn');
  if (cancelBtn) cancelBtn.style.display = 'none';
}

// ========== 情绪分析流程（输入页 → 导演页之间） ==========

/**
 * 在生成页面执行情绪分析，完成后跳转到导演页
 * 由 input.js 动态 import 后调用，替代之前直接 manipulate DOM + await API 的做法
 * @param {Object} options
 * @param {string} options.text - 用户输入文本
 * @param {string} [options.moodTagId] - 心情标签 ID
 * @param {Function} [options.initDirectorsPage] - 初始化导演页的回调
 * @param {Function} [options.localAnalysisFn] - 本地情绪分析降级函数 (text, moodTagId) => result
 * @returns {Promise<void>}
 */
export async function runEmotionAnalysis({ text, moodTagId, initDirectorsPage, localAnalysisFn }) {
  _cancelled = false;
  const abortController = new AbortController();
  navigate('generating');
  _resetGeneratingUI();
  _reasoningEntries.length = 0;
  _reasoningCounter = 0;
  _showCancelButton('input', abortController);

  _setPhase('analyze', { indeterminate: true, subtext: '为每位导演计算匹配度' });

  // 推理链：情绪分析开始
  const analysisEntry = _addReasoningEntry({
    tool: 'analyze_emotion',
    thought: `理解用户输入的情绪：「${text.slice(0, 30)}${text.length > 30 ? '…' : ''}」${moodTagId ? `，心情标签：${moodTagId}` : ''}`
  });

  try {
    if (state.aiHealthStatus && !state.imageEmotionAnalysis) {
      state.emotionAnalysis = await AIClient.analyzeEmotion(text, moodTagId, abortController.signal);
      const emo = state.emotionAnalysis;
      const dirs = emo?.recommendedDirectors?.length ? emo.recommendedDirectors.slice(0, 3).join('、') : '本地匹配';
      analysisEntry.updateObservation(`情绪基调：${emo?.primaryEmotion || '分析中'}，推荐导演：${dirs}`);
      logger.info('[AI 情绪分析]', state.emotionAnalysis);
    } else if (!state.imageEmotionAnalysis) {
      // Canvas 模式本地分析（同步，瞬间完成）
      if (typeof localAnalysisFn === 'function') {
        state.emotionAnalysis = localAnalysisFn(text, moodTagId);
      } else {
        state.emotionAnalysis = null;
      }
      analysisEntry.updateObservation('使用本地情绪分析（Canvas 模式）');
    } else {
      analysisEntry.updateObservation('使用图片情绪分析结果');
    }
    // 如果有图片情绪分析结果，优先使用（input.js 已合并到 state 中）

    if (_cancelled) return;

    _setPhase('done');
    await sleep(200);

    // 推理链：导演匹配完成
    _addReasoningEntry({
      tool: 'match_directors',
      thought: '根据情绪分析结果匹配最适合的导演风格',
      observation: `已推荐 ${state.emotionAnalysis?.recommendedDirectors?.length || 2} 位导演，请选择你喜欢的风格`
    });

    if (typeof initDirectorsPage === 'function') {
      initDirectorsPage();
    }
    _abortController = null;
    _hideCancelButton();
    navigate('directors');
  } catch (e) {
    if (_cancelled) return;
    const msg = _getErrMsg(e);
    logger.warn('AI 情绪分析失败，使用本地分析:', msg);
    analysisEntry.updateObservation(`AI 分析失败，已切换本地分析：${_truncateObs(msg, 80)}`, true);
    toast('AI 服务暂不可用，已使用本地分析');
    if (typeof localAnalysisFn === 'function') {
      state.emotionAnalysis = localAnalysisFn(text, moodTagId);
    } else {
      state.emotionAnalysis = null;
    }
    if (typeof initDirectorsPage === 'function') {
      initDirectorsPage();
    }
    _abortController = null;
    _hideCancelButton();
    navigate('directors');
  }
}

// ========== 海报生成流程（导演页 → 结果页之间） ==========

export async function startGeneration() {
  // 释放上一轮海报的 Blob URL，避免内存泄漏
  if (state.posterResults && state.posterResults.length) {
    state.posterResults.forEach(r => { safeRevokeUrl(r.dataUrl); });
  }

  _cancelled = false;
  const abortController = new AbortController();
  navigate('generating');
  _resetGeneratingUI();
  _showCancelButton('directors', abortController);

  const isMulti = state.selectedDirectorIds.length > 1;
  const isGrid9 = state.posterFormat === 'grid9';
  const movieModule = _getMovieModule ? _getMovieModule() : null;
  const selectedMovie = movieModule ? movieModule.getSelectedMovie() : null;

  try {
    // ---- 阶段 1: 准备 + 加载 PosterEngine ----
    _setPhase('prepare', { subtext: isGrid9 ? '准备九宫格合成' : isMulti ? `准备 ${state.selectedDirectorIds.length} 位导演的拍摄` : '准备拍摄' });
    const prepEntry = _addReasoningEntry({
      tool: 'init_session',
      thought: `收到创作请求："${_truncateObs(state.inputText, 40)}"。模式：${isGrid9 ? '九宫格' : isMulti ? `${state.selectedDirectorIds.length}位导演系列` : '单导演'}。初始化创作会话…`
    });
    const PosterEngine = await _getPosterEngine();
    prepEntry.updateObservation(`会话初始化完成，海报引擎已就绪`);
    if (_cancelled) return;

    // ---- 阶段 2: 分析/匹配（Canvas 模式可能用到情绪标签） ----
    _setPhase('analyze');
    const emotion = state.emotionAnalysis;
    const analyzeEntry = _addReasoningEntry({
      tool: 'analyze_emotion',
      thought: emotion
        ? `已有情绪分析结果：主情绪「${emotion.primaryEmotion}」，强度 ${emotion.emotionIntensity}/10。关键词：${(emotion.keywords || []).slice(0, 3).join('、')}`
        : '未进行情绪分析，将直接使用导演风格创作'
    });
    await sleep(100);
    analyzeEntry.updateObservation(emotion
      ? `情绪识别：${emotion.primaryEmotion}，推荐导演 ${(emotion.recommendedDirectors || []).slice(0, 3).map(d => d.directorId).join('、')}`
      : '跳过情绪分析');
    if (_cancelled) return;

    _setPhase('select');
    const directorNames = state.selectedDirectorIds.map(id => {
      const d = DIRECTORS.find(dd => dd.id === id);
      return d ? d.name : id;
    }).join('、');
    const selectEntry = _addReasoningEntry({
      tool: 'select_directors',
      thought: `根据用户选择${emotion ? '与情绪匹配' : ''}，确定创作导演：${directorNames}`
    });
    await sleep(100);
    selectEntry.updateObservation(`目标导演：${state.selectedDirectorIds.join(', ')}（共 ${state.selectedDirectorIds.length} 位）`);
    if (_cancelled) return;

    // ---- 阶段 3: AI 拍摄 + Canvas 绘制（核心耗时阶段，使用 indeterminate） ----
    _setPhase('generate', { indeterminate: true });

    let results;
    if (isGrid9) {
      // 九宫格合集
      const gridEntry = _addReasoningEntry({
        tool: 'generate_grid9',
        thought: `九宫格模式：将 ${state.selectedDirectorIds.length} 位导演的画面合成为一张网格海报`
      });
      const gridResult = await PosterEngine.generateGrid9({
        text: state.inputText,
        directorIds: state.selectedDirectorIds,
        moodTagId: state.moodTagId,
        showQuote: state.showQuote
      });
      results = [gridResult];
      gridEntry.updateObservation(`九宫格合成完成，尺寸 ${gridResult.width}×${gridResult.height}`);
    } else {
      results = [];
      const BATCH_SIZE = 3;
      const directorIds = state.selectedDirectorIds;
      for (let i = 0; i < directorIds.length; i += BATCH_SIZE) {
        if (_cancelled) return;
        const batch = directorIds.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(async (directorId) => {
          const director = DIRECTORS.find(d => d.id === directorId);
          const dirLabel = director ? director.name : directorId;

          // 图片生成
          let aiImageUrl = null;
          if (state.useAI && state.aiHealthStatus) {
            if (!director) {
              logger.warn(`[Generating] 未找到导演: ${directorId}，跳过该导演`);
              return null;
            }
            const imgEntry = _addReasoningEntry({
              tool: 'generate_image',
              thought: `调用 ${dirLabel} 风格的图片生成，情绪基调：${emotion ? emotion.primaryEmotion : '默认'}`
            });
            const aiResult = await posterBoundary.run(
              () => AIClient.generateImage({
                text: state.inputText,
                directorId: directorId,
                emotion: emotion ? emotion.primaryEmotion : null,
                engine: state.aiEngine,
                size: state.posterFormat
              }, abortController.signal),
              (err) => {
                const msg = _getErrMsg(err);
                logger.warn(`AI 生图失败 (${directorId})，降级为 Canvas:`, msg);
                imgEntry.updateObservation(`AI 生图失败，降级为 Canvas 绘制：${_truncateObs(msg, 60)}`, true);
                return null;
              }
            );
            aiImageUrl = aiResult ? aiResult.dataUrl : null;
            if (aiResult) {
              imgEntry.updateObservation(`${dirLabel} 风格图片生成成功（引擎：${aiResult.engine}）`);
            }
          }

          // Canvas 海报绘制
          const composeEntry = _addReasoningEntry({
            tool: 'compose_poster',
            thought: `在 ${dirLabel} 风格背景上排版标题、金句与装饰元素…`
          });
          const result = await PosterEngine.generate({
            text: state.inputText,
            directorId: directorId,
            movieId: selectedMovie ? selectedMovie.id : undefined,
            customDNA: selectedMovie ? (movieModule.state.customDNA || undefined) : undefined,
            customColors: selectedMovie ? (movieModule.state.customColors || undefined) : undefined,
            customPrompt: selectedMovie ? (movieModule.state.customPrompt || undefined) : undefined,
            swapLabel: selectedMovie ? (movieModule.state.swapLabel || undefined) : undefined,
            moodTagId: state.moodTagId,
            format: state.posterFormat,
            showQuote: state.showQuote,
            aiImageUrl: aiImageUrl,
            emotion: emotion ? emotion.primaryEmotion : null,
            customFontFamily: _getCustomFontFamily(),
            customTitleWeight: _getCustomTitleWeight(),
          });
          composeEntry.updateObservation(`${dirLabel} 海报绘制完成：「${_truncateObs(result.title, 20)}」`);
          return result;
        }));
        results.push(...batchResults.filter(r => r !== null));
        // 系列海报时更新子文字提示批次进度
        if (directorIds.length > 1) {
          const subtextEl = $('gen-subtext');
          if (subtextEl) subtextEl.textContent = `正在生成系列海报 ${results.length}/${directorIds.length}...`;
        }
      }
    }

    if (_cancelled) return;

    // ---- 阶段 4: 合成/收尾 ----
    _setPhase('compose');

    const composeEntry = _addReasoningEntry({
      tool: 'finalize',
      thought: `所有导演创作完成，共 ${results.length} 张海报。生成备选标题并保存结果…`
    });

    state.posterResults = results;
    state.currentPosterIndex = 0;

    // 生成备选标题
    state.altTitles = generateAltTitles(state.inputText, state.moodTagId);
    state.currentTitle = results[0].title;

    // 保存到历史
    results.forEach(r => _saveToHistory(r));

    composeEntry.updateObservation(`结果已保存，主标题「${_truncateObs(results[0].title, 20)}」，备选标题 ${state.altTitles.length} 个`);

    await sleep(200);
    if (_cancelled) return;

    // ---- 完成 ----
    _setPhase('done');
    _addReasoningEntry({
      tool: 'finish',
      thought: '创作流程全部完成，准备展示结果',
      observation: `共生成 ${results.length} 张电影海报，可以滑动浏览`
    });
    await sleep(300);

    _abortController = null;
    _hideCancelButton();
    _showResultPage();
  } catch (err) {
    if (_cancelled) return;
    const errMsg = _getErrMsg(err);
    logger.error('海报生成失败:', errMsg);
    _addReasoningEntry({
      tool: 'error',
      thought: '创作过程中遇到错误',
      observation: _truncateObs(errMsg, 100),
      isError: true
    });
    // 显示错误状态
    const progressBar = $('gen-progress-bar');
    const genText = $('gen-text');
    const genSubtext = $('gen-subtext');
    if (progressBar) {
      progressBar.classList.remove('indeterminate');
      progressBar.style.width = '0%';
    }
    if (genText) genText.textContent = '生成失败';
    if (genSubtext) genSubtext.textContent = errMsg;
    // 替换步骤点为重试按钮
    const stepsEl = $('gen-steps');
    if (stepsEl) {
      stepsEl.innerHTML = '<button class="btn btn-primary btn-sm" id="btn-retry-gen" style="margin-top:12px">重试</button>';
      const retryBtn = $('btn-retry-gen');
      if (retryBtn) retryBtn.onclick = () => startGeneration();
    }
    _abortController = null;
    _hideCancelButton();
    toast('生成失败，可点击重试');
  }
}

export default startGeneration;
