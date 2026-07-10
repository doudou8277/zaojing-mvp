/**
 * 旅行票根页面模块
 * 负责照片上传、AI分析、票根渲染、保存和展示
 */

import { navigate, toast, escapeHtml } from '../shared.js';
import { logger } from '../utils/logger.js';
import { renderTicket, getStyleColors, getFormatSize, canvasToDataUrl } from '../utils/ticket-engine.js';
import { saveTicket, getAllTickets, deleteTicket } from '../utils/ticket-storage.js';

// ========== 状态 ==========
let currentPhoto = null;       // { dataUrl, file }
let analysisResult = null;     // AI 分析结果
let currentStyle = 'miyazaki';
let currentFormat = 'vertical';
let currentMoodText = '';
let isGenerating = false;
let ticketCount = 0;           // 缓存票根数量

// 导演风格列表（与渲染引擎 STYLE_COLORS 保持一致）
const STYLES = [
  { id: 'miyazaki', name: '宫崎骏' },
  { id: 'wkw', name: '王家卫' },
  { id: 'koreeda', name: '是枝裕和' },
  { id: 'wes', name: '韦斯·安德森' },
  { id: 'nolan', name: '诺兰' },
  { id: 'chazelle', name: '查泽雷' },
  { id: 'lee', name: '李安' },
  { id: 'coppola', name: '科波拉' },
  { id: 'chow', name: '周星驰' },
  { id: 'jia', name: '贾樟柯' },
  { id: 'kurosawa', name: '黑泽明' },
  { id: 'tarantino', name: '昆汀' },
];

// 版式列表
const FORMATS = [
  { id: 'vertical', name: '竖版', desc: '小红书', ratio: '3/4' },
  { id: 'square', name: '方形', desc: '朋友圈', ratio: '1/1' },
  { id: 'horizontal', name: '横版', desc: '收藏', ratio: '9/4' },
];

// ========== DOM 工具 ==========
function $(id) { return document.getElementById(id); }

// ========== 页面初始化 ==========
function setupTicketPage() {
  // 上传区域点击
  const uploadZone = $('ticket-upload-zone');
  if (uploadZone) {
    uploadZone.addEventListener('click', () => {
      const input = $('ticket-file-input');
      if (input) input.click();
    });

    // 拖拽上传
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    });
  }

  // 文件选择
  const fileInput = $('ticket-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFileSelect(file);
    });
  }

  // 智能模式 / 手动模式切换
  const modeSmart = $('ticket-mode-smart');
  const modeManual = $('ticket-mode-manual');
  const manualFields = $('ticket-manual-fields');
  if (modeSmart && modeManual) {
    modeSmart.addEventListener('click', () => {
      modeSmart.classList.add('active');
      modeManual.classList.remove('active');
      if (manualFields) manualFields.style.display = 'none';
    });
    modeManual.addEventListener('click', () => {
      modeManual.classList.add('active');
      modeSmart.classList.remove('active');
      if (manualFields) manualFields.style.display = 'flex';
      // 默认填充今天日期
      const dateInput = $('ticket-date-input');
      if (dateInput && !dateInput.value) {
        dateInput.value = formatDate(new Date());
      }
    });
  }

  // 生成按钮
  const genBtn = $('ticket-generate-btn');
  if (genBtn) {
    genBtn.addEventListener('click', handleGenerate);
  }

  // 风格切换
  document.querySelectorAll('.ticket-style-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.ticket-style-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentStyle = chip.dataset.style;
      if (analysisResult && currentPhoto) {
        renderCurrentTicket();
      }
    });
  });

  // 版式切换
  document.querySelectorAll('.ticket-format-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.ticket-format-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFormat = chip.dataset.format;
      updateCanvasWrapRatio();
      if (analysisResult && currentPhoto) {
        renderCurrentTicket();
      }
    });
  });

  // 换照片
  const changePhotoBtn = $('ticket-change-photo');
  if (changePhotoBtn) {
    changePhotoBtn.addEventListener('click', () => {
      resetToUpload();
    });
  }

  // 再做一张（保留当前照片，重新生成）
  const regenerateBtn = $('ticket-regenerate-btn');
  if (regenerateBtn) {
    regenerateBtn.addEventListener('click', async () => {
      if (currentPhoto && !isGenerating) {
        await handleGenerate();
      }
    });
  }

  // 改文案
  const editCopyBtn = $('ticket-edit-copy');
  if (editCopyBtn) {
    editCopyBtn.addEventListener('click', () => {
      const input = $('ticket-mood-input');
      const display = $('ticket-mood-display');
      if (input) {
        input.style.display = 'block';
        input.value = currentMoodText;
        input.focus();
        if (display) display.style.display = 'none';
      }
    });
  }

  // 文案输入确认
  const moodInput = $('ticket-mood-input');
  if (moodInput) {
    moodInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        currentMoodText = moodInput.value.trim() || currentMoodText;
        moodInput.style.display = 'none';
        const display = $('ticket-mood-display');
        if (display) {
          display.style.display = 'block';
          display.textContent = currentMoodText;
        }
        if (analysisResult && currentPhoto) {
          renderCurrentTicket();
        }
      }
    });
    moodInput.addEventListener('blur', () => {
      currentMoodText = moodInput.value.trim() || currentMoodText;
      moodInput.style.display = 'none';
      const display = $('ticket-mood-display');
      if (display) {
        display.style.display = 'block';
        display.textContent = currentMoodText;
      }
    });
  }

  // 保存按钮
  const saveBtn = $('ticket-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
  }

  // 下载按钮
  const downloadBtn = $('ticket-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', handleDownload);
  }

  // 复制按钮
  const copyBtn = $('ticket-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', handleCopy);
  }

  // 重新生成文案
  const regenCopyBtn = $('ticket-regen-copy');
  if (regenCopyBtn) {
    regenCopyBtn.addEventListener('click', handleRegenCopy);
  }

  // 返回首页
  const backBtn = $('ticket-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => navigate('input'));
  }

  // 查看票根墙
  const wallBtn = $('ticket-wall-btn');
  if (wallBtn) {
    wallBtn.addEventListener('click', () => {
      showSection('wall');
      loadTicketWall();
    });
  }

  // 票根墙返回
  const wallBackBtn = $('ticket-wall-back');
  if (wallBackBtn) {
    wallBackBtn.addEventListener('click', () => {
      // 如果有结果，返回结果页；否则返回上传页
      if (analysisResult && currentPhoto) {
        showSection('result');
      } else {
        showSection('upload');
      }
    });
  }

  // 票根墙创建第一张
  const wallCreateBtn = $('ticket-wall-create');
  if (wallCreateBtn) {
    wallCreateBtn.addEventListener('click', () => {
      resetToUpload();
    });
  }

  // 大图遮罩点击关闭
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('ticket-image-overlay')) {
      e.target.remove();
    }
  });

  logger.info('ticket 页面 setup 完成');
}

// ========== 页面入口 ==========
async function initTicketPage() {
  resetToUpload();
  // 预加载票根数量
  try {
    const tickets = await getAllTickets();
    ticketCount = tickets.length;
  } catch {
    ticketCount = 0;
  }
  logger.info('ticket 页面初始化');
}

// ========== 区段切换 ==========
function showSection(section) {
  const sections = ['upload', 'generating', 'result', 'wall'];
  sections.forEach(s => {
    const el = $(`ticket-${s}-section`);
    if (el) el.style.display = (s === section) ? 'block' : 'none';
  });
}

// ========== 更新画布容器宽高比 ==========
function updateCanvasWrapRatio() {
  const wrap = $('ticket-canvas-wrap');
  if (!wrap) return;
  const size = getFormatSize(currentFormat);
  const ratio = size.height / size.width;
  wrap.style.aspectRatio = `${size.width}/${size.height}`;
}

// ========== 重置到上传状态 ==========
function resetToUpload() {
  currentPhoto = null;
  analysisResult = null;
  currentMoodText = '';
  isGenerating = false;

  showSection('upload');

  // 重置上传区
  const uploadZone = $('ticket-upload-zone');
  if (uploadZone) uploadZone.style.display = 'flex';

  const preview = $('ticket-upload-preview');
  if (preview) {
    preview.style.display = 'none';
    preview.src = '';
  }

  const selectedHint = $('ticket-photo-selected');
  if (selectedHint) selectedHint.style.display = 'none';

  // 重置文件输入
  const fileInput = $('ticket-file-input');
  if (fileInput) fileInput.value = '';

  // 重置模式到智能模式
  const modeSmart = $('ticket-mode-smart');
  const modeManual = $('ticket-mode-manual');
  const manualFields = $('ticket-manual-fields');
  if (modeSmart) modeSmart.classList.add('active');
  if (modeManual) modeManual.classList.remove('active');
  if (manualFields) manualFields.style.display = 'none';

  // 重置画布比例
  updateCanvasWrapRatio();
}

// ========== 文件选择处理 ==========
function handleFileSelect(file) {
  if (!file.type.startsWith('image/')) {
    toast('请选择图片文件', 3000);
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    toast('图片不能超过 15MB', 3000);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentPhoto = { dataUrl: e.target.result, file };

    const preview = $('ticket-upload-preview');
    if (preview) {
      preview.src = e.target.result;
      preview.style.display = 'block';
    }
    const uploadZone = $('ticket-upload-zone');
    if (uploadZone) uploadZone.style.display = 'none';

    const selectedHint = $('ticket-photo-selected');
    if (selectedHint) selectedHint.style.display = 'flex';

    toast('照片已选择，点击下方按钮生成票根', 2000);
  };
  reader.onerror = () => toast('图片读取失败', 3000);
  reader.readAsDataURL(file);
}

// ========== 生成票根 ==========
async function handleGenerate() {
  if (!currentPhoto) {
    toast('请先上传旅行照片', 3000);
    return;
  }
  if (isGenerating) return;
  isGenerating = true;

  showSection('generating');
  updateGenProgress('正在分析照片情绪...', 1);

  try {
    const isManualMode = $('ticket-mode-manual')?.classList.contains('active');
    let destination = '';
    let date = '';

    if (isManualMode) {
      destination = ($('ticket-destination-input')?.value || '').trim();
      date = ($('ticket-date-input')?.value || '').trim();
    }

    // 1. 调用 AI 分析
    let result;
    try {
      const response = await fetch('/api/ticket/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: currentPhoto.dataUrl,
          destination,
          date,
        }),
      });

      if (!response.ok) throw new Error(`分析失败: ${response.status}`);
      result = await response.json();
    } catch (apiErr) {
      // API 失败时使用降级结果
      logger.warn({ err: apiErr.message }, '票根API调用失败，使用降级模式');
      result = {
        emotion: { primary: '宁静', intensity: 0.7, tags: ['温暖', '治愈'], sceneType: destination || '旅途风光' },
        moodText: '旅途中的好时光',
        recommendedStyle: 'miyazaki',
        styleReason: '默认推荐宫崎骏风格',
        animationType: 'none',
      };
      toast('AI服务暂时不可用，使用基础模式', 3000);
    }

    analysisResult = result;

    updateGenProgress('正在生成诗意文案...', 2);

    // 2. 流式生成文案（手动模式下如果用户没填目的地，也走AI文案；智能模式始终AI生成）
    const needsAICopy = !isManualMode || !destination;
    if (needsAICopy) {
      try {
        await generateMoodText(destination, date);
      } catch (copyErr) {
        logger.warn({ err: copyErr.message }, '文案流式生成失败，使用分析结果文案');
        currentMoodText = result.moodText || '旅途中的好时光';
      }
    } else {
      currentMoodText = result.moodText || '旅途中的好时光';
    }

    // 如果手动模式有用户输入的目的地，使用它
    if (isManualMode && destination) {
      // 用户指定的目的地会在渲染时使用
    }

    updateGenProgress('正在匹配导演风格...', 3);

    // 自动选择 AI 推荐的风格
    if (result.recommendedStyle && STYLES.find(s => s.id === result.recommendedStyle)) {
      currentStyle = result.recommendedStyle;
      document.querySelectorAll('.ticket-style-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.style === currentStyle);
      });
    }

    updateGenProgress('正在渲染票根...', 4);
    updateCanvasWrapRatio();

    // 3. 渲染票根
    await renderCurrentTicket();

    // 4. 显示结果
    updateGenProgress('完成！', 5);
    await sleep(400);

    showSection('result');
    fillResultInfo(destination, date);
    updateMoodDisplay();

  } catch (error) {
    logger.error({ err: error.message }, '票根生成失败');
    toast('票根生成失败: ' + error.message, 4000);
    resetToUpload();
  } finally {
    isGenerating = false;
  }
}

// ========== 流式生成文案（修复SSE解析） ==========
async function generateMoodText(destination, date) {
  return new Promise((resolve, reject) => {
    const moodDisplay = $('ticket-mood-streaming');
    if (moodDisplay) moodDisplay.textContent = '';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    fetch('/api/ticket/copy-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: currentPhoto.dataUrl,
        destination,
        date,
        emotion: analysisResult?.emotion?.primary,
        sceneType: analysisResult?.emotion?.sceneType,
      }),
      signal: controller.signal,
    }).then(response => {
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`文案生成失败: ${response.status}`);
      if (!response.body) throw new Error('无响应流');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let moodText = '';
      let eventType = '';

      function processChunk() {
        reader.read().then(({ done, value }) => {
          if (done) {
            if (!currentMoodText) currentMoodText = moodText;
            resolve();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          // SSE 格式：event: xxx\ndata: xxx\n\n
          // 按 \n\n 分割完整事件
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          for (const eventBlock of events) {
            const lines = eventBlock.split('\n');
            let evType = '';
            let evData = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) evType = line.slice(7).trim();
              else if (line.startsWith('data: ')) evData += line.slice(6);
            }
            if (evType === 'token' && evData) {
              try {
                const data = JSON.parse(evData);
                if (data.token) {
                  moodText += data.token;
                  if (moodDisplay) moodDisplay.textContent = moodText;
                }
              } catch { /* 忽略解析失败的token */ }
            } else if (evType === 'done') {
              currentMoodText = moodText;
              resolve();
              return;
            } else if (evType === 'error') {
              try {
                const data = JSON.parse(evData);
                reject(new Error(data.error || '文案生成失败'));
              } catch {
                reject(new Error('文案生成失败'));
              }
              return;
            }
          }

          processChunk();
        }).catch((err) => {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            currentMoodText = moodText || '旅途时光';
            resolve();
          } else {
            reject(err);
          }
        });
      }

      processChunk();
    }).catch((err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

// ========== 更新文案显示 ==========
function updateMoodDisplay() {
  const display = $('ticket-mood-display');
  if (display) display.textContent = currentMoodText;
}

// ========== 渲染当前票根 ==========
async function renderCurrentTicket() {
  if (!currentPhoto || !analysisResult) return;

  const canvas = $('ticket-canvas');
  if (!canvas) return;

  const isManualMode = $('ticket-mode-manual')?.classList.contains('active');
  let destination = '';
  let date = '';

  if (isManualMode) {
    destination = ($('ticket-destination-input')?.value || '').trim();
    date = ($('ticket-date-input')?.value || '').trim();
  }
  if (!destination) destination = analysisResult.emotion?.sceneType || '旅途';
  if (!date) date = formatDate(new Date());

  const colors = getStyleColors(currentStyle);

  await renderTicket(canvas, {
    photoUrl: currentPhoto.dataUrl,
    destination,
    date,
    moodText: currentMoodText || analysisResult.moodText || '旅途中的好时光',
    styleId: currentStyle,
    format: currentFormat,
    emotion: analysisResult.emotion,
    ticketNumber: `NO.${String(ticketCount + 1).padStart(3, '0')}`,
    colors,
  });

  // 更新风格说明
  const styleReasonEl = $('ticket-style-reason');
  if (styleReasonEl) {
    styleReasonEl.textContent = analysisResult.styleReason || '';
  }
}

// ========== 填充结果信息 ==========
function fillResultInfo(destination, date) {
  const dest = destination || analysisResult?.emotion?.sceneType || '旅途';
  const dt = date || formatDate(new Date());

  const destEl = $('ticket-result-destination');
  if (destEl) destEl.textContent = dest;

  const dateEl = $('ticket-result-date');
  if (dateEl) dateEl.textContent = dt;

  const emotionEl = $('ticket-result-emotion');
  if (emotionEl) {
    const tags = analysisResult?.emotion?.tags || [];
    if (tags.length === 0 && analysisResult?.emotion?.primary) {
      tags.push(analysisResult.emotion.primary);
    }
    emotionEl.innerHTML = tags.map(t => `<span class="ticket-emotion-tag">${escapeHtml(t)}</span>`).join('');
  }

  const sceneEl = $('ticket-result-scene');
  if (sceneEl) sceneEl.textContent = analysisResult?.emotion?.sceneType || '';
}

// ========== 保存 ==========
async function handleSave() {
  const canvas = $('ticket-canvas');
  if (!canvas || !analysisResult) return;

  try {
    const ticketDataUrl = canvasToDataUrl(canvas);
    const isManualMode = $('ticket-mode-manual')?.classList.contains('active');
    const destination = (isManualMode ? $('ticket-destination-input')?.value : '')?.trim()
      || analysisResult?.emotion?.sceneType || '旅途';
    const date = (isManualMode ? $('ticket-date-input')?.value : '')?.trim()
      || formatDate(new Date());

    const ticket = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      createdAt: Date.now(),
      destination,
      date,
      moodText: currentMoodText || analysisResult.moodText || '',
      styleId: currentStyle,
      format: currentFormat,
      emotion: analysisResult.emotion,
      animationType: analysisResult.animationType || 'none',
      ticketDataUrl,
      photoDataUrl: currentPhoto?.dataUrl || '',
      styleReason: analysisResult.styleReason || '',
    };

    await saveTicket(ticket);
    ticketCount++;
    toast('票根已保存到票根墙！', 2000);

  } catch (error) {
    logger.error({ err: error.message }, '保存票根失败');
    toast('保存失败: ' + error.message, 3000);
  }
}

// ========== 下载 ==========
function handleDownload() {
  const canvas = $('ticket-canvas');
  if (!canvas) return;
  const dataUrl = canvasToDataUrl(canvas);
  const link = document.createElement('a');
  link.download = `旅行票根_${Date.now()}.webp`;
  link.href = dataUrl;
  link.click();
  toast('票根已下载', 2000);
}

// ========== 复制到剪贴板 ==========
async function handleCopy() {
  const canvas = $('ticket-canvas');
  if (!canvas) return;

  try {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast('复制失败', 2000);
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/webp': blob })
        ]);
        toast('票根已复制到剪贴板', 2000);
      } catch {
        // 降级：复制文案
        await navigator.clipboard.writeText(currentMoodText);
        toast('文案已复制（浏览器不支持图片复制）', 2000);
      }
    }, 'image/webp', 0.92);
  } catch (error) {
    logger.warn({ err: error.message }, '复制票根失败');
    toast('复制失败', 2000);
  }
}

// ========== 重新生成文案 ==========
async function handleRegenCopy() {
  if (!currentPhoto || !analysisResult) return;

  const regenBtn = $('ticket-regen-copy');
  if (regenBtn) {
    regenBtn.disabled = true;
    regenBtn.textContent = '生成中...';
  }

  try {
    const isManualMode = $('ticket-mode-manual')?.classList.contains('active');
    const destination = isManualMode ? ($('ticket-destination-input')?.value || '') : '';
    const date = isManualMode ? ($('ticket-date-input')?.value || '') : '';
    await generateMoodText(destination, date);
    await renderCurrentTicket();
    updateMoodDisplay();
    toast('文案已更新', 2000);
  } catch (error) {
    toast('文案生成失败', 3000);
  } finally {
    if (regenBtn) {
      regenBtn.disabled = false;
      regenBtn.textContent = '换一句';
    }
  }
}

// ========== 票根墙 ==========
async function loadTicketWall() {
  const grid = $('ticket-wall-grid');
  const emptyEl = $('ticket-wall-empty');
  if (!grid) return;

  try {
    const tickets = await getAllTickets();
    ticketCount = tickets.length;

    if (tickets.length === 0) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    grid.innerHTML = tickets.map(t => `
      <div class="ticket-wall-item" data-id="${t.id}">
        <img src="${t.ticketDataUrl}" alt="${escapeHtml(t.destination)}" loading="lazy">
        <div class="ticket-wall-info">
          <span class="ticket-wall-dest">${escapeHtml(t.destination)}</span>
          <span class="ticket-wall-date">${escapeHtml(t.date)}</span>
        </div>
        <button class="ticket-wall-delete" data-id="${t.id}" title="删除">×</button>
      </div>
    `).join('');

    // 删除事件
    grid.querySelectorAll('.ticket-wall-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('确定删除这张票根吗？')) {
          await deleteTicket(id);
          ticketCount--;
          loadTicketWall();
          toast('已删除', 2000);
        }
      });
    });

    // 点击查看大图
    grid.querySelectorAll('.ticket-wall-item').forEach(item => {
      item.addEventListener('click', () => {
        const img = item.querySelector('img');
        if (img) showImageOverlay(img.src);
      });
    });

  } catch (error) {
    logger.error({ err: error.message }, '加载票根墙失败');
    toast('加载票根墙失败', 3000);
  }
}

// ========== 大图遮罩 ==========
function showImageOverlay(src) {
  const overlay = document.createElement('div');
  overlay.className = 'ticket-image-overlay';
  overlay.innerHTML = `
    <img src="${src}" alt="票根大图">
    <button class="ticket-overlay-close" title="关闭">×</button>
  `;
  document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector('.ticket-overlay-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      overlay.remove();
    });
  }
}

// ========== 辅助函数 ==========
function updateGenProgress(text, step) {
  const textEl = $('ticket-gen-text');
  if (textEl) textEl.textContent = text;
  document.querySelectorAll('.ticket-gen-step').forEach((el, i) => {
    el.classList.toggle('active', i < step);
    el.classList.toggle('done', i < step - 1);
  });
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== 导出 ==========
export {
  setupTicketPage,
  initTicketPage,
  loadTicketWall,
};
