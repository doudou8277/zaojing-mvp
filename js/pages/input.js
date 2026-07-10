// pages/input.js — 输入页模块
// 从 app.js 提取的 initInputPage 函数，负责心情标签、文字输入、语音识别、图片上传与 AI 情绪分析。
import { $, state, toast, navigate, escapeHtml, sanitizeImageUrl, logger } from '../shared.js';
import { MOOD_TAGS, EMOTION_KEYWORDS, MOOD_TO_EMOTION } from '../data.js';
import * as AIClient from '../ai-client';
import { checkCompliance, RISK_LEVEL, formatComplianceResult, getRiskLevelLabel } from '../utils/compliance.js';

/**
 * 本地情绪分析（Canvas 模式下使用）
 * 基于关键词匹配和心情标签映射
 */
function localEmotionAnalysis(text, moodTagId) {
  // 1. 心情标签直接映射
  const tagEmotion = MOOD_TO_EMOTION[moodTagId] || null;

  // 2. 文本关键词匹配
  const matched = [];
  for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
    const hits = keywords.filter((kw) => text.includes(kw));
    if (hits.length > 0) {
      matched.push({ emotion, score: hits.length, keywords: hits });
    }
  }
  matched.sort((a, b) => b.score - a.score);

  // 3. 综合判断
  const primaryEmotion = matched[0]?.emotion || tagEmotion || 'neutral';

  return {
    primaryEmotion,
    intensity: Math.min(1, (matched[0]?.score || 0) / 3),
    keywords: matched[0]?.keywords || [],
    secondaryEmotions: matched.slice(1, 3).map((m) => m.emotion),
    source: 'local',
  };
}

/**
 * 初始化输入页
 * @param {Object} callbacks - 跨页面回调
 * @param {Function} [callbacks.initDirectorsPage] - 进入导演页时调用的初始化函数
 */
export function initInputPage({ initDirectorsPage } = {}) {
  const moodContainer = $('mood-tags');
  moodContainer.innerHTML = '';
  MOOD_TAGS.forEach((tag) => {
    const el = document.createElement('button');
    el.className = 'mood-tag';
    el.dataset.id = tag.id;
    el.innerHTML = `<span class="emoji">${tag.emoji}</span> ${tag.label}`;
    if (state.moodTagId === tag.id) el.classList.add('selected');
    el.addEventListener('click', () => {
      document.querySelectorAll('.mood-tag').forEach((t) => t.classList.remove('selected'));
      el.classList.add('selected');
      state.moodTagId = tag.id;
    });
    moodContainer.appendChild(el);
  });

  const textarea = $('input-text');
  const charCount = $('char-count');
  const MAX_INPUT_LENGTH = 500;
  textarea.value = state.inputText;
  charCount.textContent = `${state.inputText.length}/${MAX_INPUT_LENGTH}`;
  // 用 oninput 避免重复绑定 addEventListener
  textarea.oninput = () => {
    // JS 层截断，防止 maxlength 被绕过（如通过粘贴）
    if (textarea.value.length > MAX_INPUT_LENGTH) {
      textarea.value = textarea.value.slice(0, MAX_INPUT_LENGTH);
    }
    state.inputText = textarea.value;
    charCount.textContent = `${textarea.value.length}/${MAX_INPUT_LENGTH}`;
    // 字数接近上限时变色（超过 85%）
    charCount.classList.toggle('near-limit', textarea.value.length > MAX_INPUT_LENGTH * 0.85);
  };

  // 初始化语音识别（Web Speech API）
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition && !state.voiceRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;
    recognition.interimResults = false;

    // 识别结果自动填入 textarea
    recognition.onresult = (event) => {
      let transcript = event.results[0][0].transcript;
      // 语音识别结果也截断到最大长度
      if (transcript.length > MAX_INPUT_LENGTH) {
        transcript = transcript.slice(0, MAX_INPUT_LENGTH);
      }
      textarea.value = transcript;
      state.inputText = transcript;
      charCount.textContent = `${transcript.length}/${MAX_INPUT_LENGTH}`;
      charCount.classList.toggle('near-limit', transcript.length > MAX_INPUT_LENGTH * 0.85);
      toast('语音识别完成');
    };

    // 识别出错时提示
    recognition.onerror = (event) => {
      logger.warn('语音识别错误:', event.error);
      toast('语音识别出错，请重试');
      state.isListening = false;
      $('voice-status').style.display = 'none';
    };

    // 识别结束（含主动停止）时复位状态
    recognition.onend = () => {
      state.isListening = false;
      $('voice-status').style.display = 'none';
    };

    state.voiceRecognition = recognition;
  }

  const uploadZone = $('upload-zone');
  const uploadInput = $('upload-input');
  // 用 onclick 避免重复绑定
  uploadZone.onclick = () => uploadInput.click();
  uploadInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rawDataUrl = ev.target.result;
      const safeDataUrl = sanitizeImageUrl(rawDataUrl);
      if (!safeDataUrl) {
        toast('图片格式不支持');
        return;
      }
      state.uploadedImage = safeDataUrl;
      uploadZone.classList.add('has-image');
      uploadZone.innerHTML = `
        <img class="upload-preview" src="${safeDataUrl}" alt="预览">
        <p style="font-size:.8rem; color:var(--miya)">已上传，点击重新选择</p>
      `;
      toast('图片已上传，AI 将理解其情绪');

      // 如果后端可用，调用 AI 视觉情绪分析
      if (state.aiHealthStatus) {
        const analysisEl = $('upload-analysis');
        const emotionEl = $('analysis-emotion');
        const keywordsEl = $('analysis-keywords');
        const hintEl = $('analysis-hint');

        // 显示分析中状态
        analysisEl.style.display = 'block';
        emotionEl.textContent = 'AI 正在分析图片情绪...';
        keywordsEl.innerHTML = '';
        hintEl.textContent = '';

        try {
          const result = await AIClient.analyzeImage(ev.target.result);
          state.imageEmotionAnalysis = result;

          // 渲染分析结果
          emotionEl.textContent = result.primaryEmotion || result.emotion || '情绪识别完成';

          if (result.keywords && result.keywords.length > 0) {
            keywordsEl.innerHTML = result.keywords
              .map((kw) => `<span class="analysis-keyword">${escapeHtml(kw)}</span>`)
              .join('');
          }

          hintEl.textContent = result.hint || result.description || '将基于图片情绪生成海报';

          toast('AI 图片情绪分析完成');
        } catch (err) {
          logger.warn('AI 图片分析失败:', err.message);
          // 持久化内联提示，而非转瞬即逝的 toast
          analysisEl.style.display = 'block';
          emotionEl.textContent = 'AI 图片分析暂不可用';
          emotionEl.style.color = 'var(--chow)';
          keywordsEl.innerHTML = '';
          hintEl.textContent = '将基于你的文字描述进行情绪分析，不影响海报生成。';
          state.imageEmotionAnalysis = null;
        }
      }
    };
    reader.readAsDataURL(file);
  };

  $('btn-to-directors').onclick = async () => {
    if (!state.inputText.trim() && !state.moodTagId) {
      toast('请输入文字或选择一个心情标签');
      textarea.focus();
      return;
    }

    // 内容合规检测
    if (state.inputText.trim()) {
      const complianceResult = checkCompliance(state.inputText);
      if (complianceResult.maxLevel === RISK_LEVEL.BLOCK) {
        showComplianceWarning(complianceResult, true);
        return;
      } else if (complianceResult.maxLevel === RISK_LEVEL.WARNING) {
        showComplianceWarning(complianceResult, false);
        // 警告级别不阻止，但显示提示
      }
    }

    // 如果有图片情绪分析结果，优先使用
    if (state.imageEmotionAnalysis) {
      // 将图片情绪分析结果合并到 emotionAnalysis 中
      state.emotionAnalysis = Object.assign({}, state.emotionAnalysis || {}, state.imageEmotionAnalysis);
    }

    // 如果后端可用，使用生成页面的真实阶段反馈进行 AI 情绪分析；否则本地分析
    if (state.aiHealthStatus && !state.imageEmotionAnalysis) {
      // 动态加载生成页模块，使用真实阶段反馈
      const { runEmotionAnalysis } = await import('./generating.js');
      await runEmotionAnalysis({
        text: state.inputText,
        moodTagId: state.moodTagId,
        initDirectorsPage: () => {
          if (typeof initDirectorsPage === 'function') initDirectorsPage();
        },
        localAnalysisFn: localEmotionAnalysis,
      });
      return; // runEmotionAnalysis 内部已处理导航到导演页
    } else if (!state.imageEmotionAnalysis) {
      // Canvas 模式本地分析（AI 不可用，同步瞬间完成，无需显示生成页）
      state.emotionAnalysis = localEmotionAnalysis(state.inputText, state.moodTagId);
    }

    if (typeof initDirectorsPage === 'function') {
      initDirectorsPage();
    }
    navigate('directors');
  };
}

export default initInputPage;

// ========== 内容合规警告 ==========

/**
 * 显示合规检测警告
 * @param {Object} result - checkCompliance 返回值
 * @param {boolean} isBlock - 是否为阻断级别（true 则阻止继续）
 */
function showComplianceWarning(result, isBlock) {
  const warningEl = $('compliance-warning');
  const warningContent = $('compliance-warning-content');
  const warningActions = $('compliance-warning-actions');
  if (!warningEl || !warningContent) {
    // 降级：用 toast 显示
    const label = getRiskLevelLabel(result.maxLevel);
    toast(`⚠️ ${label}：检测到 ${result.risks.length} 个风险词`);
    return;
  }

  // 渲染风险列表
  const riskItems = result.risks
    .map((r) => {
      const color = r.severity === RISK_LEVEL.BLOCK ? 'var(--danger)' : 'var(--chow)';
      return `<div class="compliance-risk-item" style="border-left:3px solid ${color}">
        <span class="compliance-risk-word">「${escapeHtml(r.word)}」</span>
        <span class="compliance-risk-cat">${escapeHtml(r.categoryLabel)}</span>
        <span class="compliance-risk-suggestion">${escapeHtml(r.suggestion)}</span>
      </div>`;
    })
    .join('');

  warningContent.innerHTML = `
    <div class="compliance-warning-title">
      ${isBlock ? '🚫 内容存在合规风险' : '⚠️ 内容提示'}
    </div>
    <div class="compliance-risk-list">${riskItems}</div>
  `;

  // 渲染操作按钮
  if (isBlock) {
    warningActions.innerHTML =
      '<button class="btn btn-primary btn-sm" id="btn-compliance-close">我知道了，去修改</button>';
    warningEl.dataset.blocked = 'true';
  } else {
    warningActions.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="btn-compliance-close">去修改</button>
      <button class="btn btn-primary btn-sm" id="btn-compliance-continue">忽略并继续 →</button>
    `;
    warningEl.dataset.blocked = 'false';
  }

  warningEl.style.display = 'block';

  // 绑定按钮
  const closeBtn = $('btn-compliance-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      warningEl.style.display = 'none';
    };
  }
  const continueBtn = $('btn-compliance-continue');
  if (continueBtn) {
    continueBtn.onclick = () => {
      warningEl.style.display = 'none';
      // 继续执行：重新触发导演页跳转（跳过合规检测）
      proceedToDirectors();
    };
  }
}

/**
 * 跳过合规检测直接进入导演页
 */
async function proceedToDirectors() {
  if (state.imageEmotionAnalysis) {
    state.emotionAnalysis = Object.assign({}, state.emotionAnalysis || {}, state.imageEmotionAnalysis);
  }
  if (state.aiHealthStatus && !state.imageEmotionAnalysis) {
    // 动态加载生成页模块，使用真实阶段反馈
    const { runEmotionAnalysis } = await import('./generating.js');
    await runEmotionAnalysis({
      text: state.inputText,
      moodTagId: state.moodTagId,
      initDirectorsPage: () => {
        if (typeof initDirectorsPage === 'function') initDirectorsPage();
      },
      localAnalysisFn: localEmotionAnalysis,
    });
    return; // runEmotionAnalysis 内部已处理导航到导演页
  } else if (!state.imageEmotionAnalysis) {
    // Canvas 模式本地分析（AI 不可用，同步瞬间完成，无需显示生成页）
    state.emotionAnalysis = localEmotionAnalysis(state.inputText, state.moodTagId);
  }
  if (typeof initDirectorsPage === 'function') {
    initDirectorsPage();
  }
  navigate('directors');
}
