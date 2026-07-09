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

// 导演风格列表
const STYLES = [
  { id: 'miyazaki', name: '宫崎骏', desc: '温暖治愈' },
  { id: 'wkw', name: '王家卫', desc: '都市霓虹' },
  { id: 'koreeda', name: '是枝裕和', desc: '家庭温情' },
  { id: 'wes', name: '韦斯·安德森', desc: '对称粉彩' },
  { id: 'nolan', name: '诺兰', desc: '冷峻理性' },
  { id: 'chazelle', name: '查泽雷', desc: '霓虹梦想' },
  { id: 'lee', name: '李安', desc: '东方含蓄' },
  { id: 'coppola', name: '科波拉', desc: '都市疏离' },
];

// 版式列表
const FORMATS = [
  { id: 'vertical', name: '竖版', desc: '小红书' },
  { id: 'square', name: '方形', desc: '朋友圈' },
  { id: 'horizontal', name: '横版', desc: '宽幅收藏' },
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
      if (manualFields) manualFields.style.display = 'block';
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
      // 如果已有结果，重新渲染
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

  // 改文案
  const editCopyBtn = $('ticket-edit-copy');
  if (editCopyBtn) {
    editCopyBtn.addEventListener('click', () => {
      const input = $('ticket-mood-input');
      if (input) {
        input.style.display = 'block';
        input.value = currentMoodText;
        input.focus();
      }
    });
  }

  // 文案输入确认
  const moodInput = $('ticket-mood-input');
  if (moodInput) {
    moodInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        currentMoodText = moodInput.value.trim() || currentMoodText;
        moodInput.style.display = 'none';
        if (analysisResult && currentPhoto) {
          renderCurrentTicket();
        }
      }
    });
    moodInput.addEventListener('blur', () => {
      currentMoodText = moodInput.value.trim() || currentMoodText;
      moodInput.style.display = 'none';
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
      $('ticket-upload-section').style.display = 'none';
      $('ticket-result-section').style.display = 'none';
      $('ticket-wall-section').style.display = 'block';
      loadTicketWall();
    });
  }

  // 票根墙返回
  const wallBackBtn = $('ticket-wall-back');
  if (wallBackBtn) {
    wallBackBtn.addEventListener('click', () => {
      $('ticket-wall-section').style.display = 'none';
      $('ticket-upload-section').style.display = 'block';
    });
  }

  logger.info('ticket 页面 setup 完成');
}

// ========== 页面入口 ==========
function initTicketPage() {
  resetToUpload();
  logger.info('ticket 页面初始化');
}

// ========== 重置到上传状态 ==========
function resetToUpload() {
  currentPhoto = null;
  analysisResult = null;
  currentMoodText = '';
  isGenerating = false;

  $('ticket-upload-section').style.display = 'block';
  $('ticket-result-section').style.display = 'none';
  $('ticket-wall-section').style.display = 'none';
  $('ticket-generating-section').style.display = 'none';

  // 重置上传区
  const uploadZone = $('ticket-upload-zone');
  if (uploadZone) {
    uploadZone.style.display = 'flex';
  }

  // 重置文件输入
  const fileInput = $('ticket-file-input');
  if (fileInput) fileInput.value = '';
}

// ========== 文件选择处理 ==========
function handleFileSelect(file) {
  // 验证文件类型
  if (!file.type.startsWith('image/')) {
    toast('请选择图片文件', 3000);
    return;
  }

  // 验证文件大小（最大 15MB）
  if (file.size > 15 * 1024 * 1024) {
    toast('图片不能超过 15MB', 3000);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentPhoto = { dataUrl: e.target.result, file };

    // 显示预览
    const preview = $('ticket-upload-preview');
    if (preview) {
      preview.src = e.target.result;
      preview.style.display = 'block';
    }
    const uploadZone = $('ticket-upload-zone');
    if (uploadZone) {
      uploadZone.style.display = 'none';
    }

    // 显示已选照片提示
    const selectedHint = $('ticket-photo-selected');
    if (selectedHint) {
      selectedHint.style.display = 'flex';
    }

    toast('照片已选择，点击下方按钮生成票根', 2000);
  };
  reader.onerror = () => {
    toast('图片读取失败', 3000);
  };
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

  // 切换到生成中状态
  $('ticket-upload-section').style.display = 'none';
  $('ticket-generating-section').style.display = 'block';

  // 更新进度
  updateGenProgress('正在分析照片情绪...', 1);

  try {
    // 1. 调用 AI 分析
    const isManualMode = $('ticket-mode-manual')?.classList.contains('active');
    const destination = isManualMode ? ($('ticket-destination-input')?.value || '') : '';
    const date = isManualMode ? ($('ticket-date-input')?.value || '') : '';

    const response = await fetch('/api/ticket/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: currentPhoto.dataUrl,
        destination,
        date,
      }),
    });

    if (!response.ok) {
      throw new Error(`分析失败: ${response.status}`);
    }

    const result = await response.json();
    analysisResult = result;

    updateGenProgress('正在生成诗意文案...', 2);

    // 2. 流式生成文案
    if (!isManualMode || !destination) {
      // 智能模式：用 AI 生成文案
      await generateMoodText(destination, date);
    } else {
      // 手动模式：如果有目的地，用 AI 生成
      await generateMoodText(destination, date);
    }

    updateGenProgress('正在匹配导演风格...', 3);

    // 自动选择 AI 推荐的风格
    if (result.recommendedStyle) {
      currentStyle = result.recommendedStyle;
      // 更新风格选择 UI
      document.querySelectorAll('.ticket-style-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.style === currentStyle);
      });
    }

    updateGenProgress('正在渲染票根...', 4);

    // 3. 渲染票根
    await renderCurrentTicket();

    // 4. 显示结果
    updateGenProgress('完成！', 5);
    await sleep(300);

    $('ticket-generating-section').style.display = 'none';
    $('ticket-result-section').style.display = 'block';

    // 填充结果信息
    fillResultInfo(destination, date);

  } catch (error) {
    logger.error({ err: error.message }, '票根生成失败');
    toast('票根生成失败: ' + error.message, 4000);
    resetToUpload();
  } finally {
    isGenerating = false;
  }
}

// ========== 流式生成文案 ==========
async function generateMoodText(destination, date) {
  return new Promise((resolve, reject) => {
    const moodDisplay = $('ticket-mood-streaming');
    if (moodDisplay) moodDisplay.textContent = '';

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
    }).then(response => {
      if (!response.ok) throw new Error(`文案生成失败: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let moodText = '';

      function processChunk() {
        reader.read().then(({ done, value }) => {
          if (done) {
            currentMoodText = moodText;
            resolve();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              const eventType = line.slice(7).trim();
              const nextLine = lines[lines.indexOf(line) + 1];
              if (nextLine && nextLine.startsWith('data: ')) {
                const data = JSON.parse(nextLine.slice(6));
                if (eventType === 'token' && data.token) {
                  moodText += data.token;
                  if (moodDisplay) moodDisplay.textContent = moodText;
                } else if (eventType === 'done') {
                  currentMoodText = moodText;
                  resolve();
                  return;
                } else if (eventType === 'error') {
                  reject(new Error(data.error || '文案生成失败'));
                  return;
                }
              }
            }
          }

          processChunk();
        }).catch(reject);
      }

      processChunk();
    }).catch(reject);
  });
}

// ========== 渲染当前票根 ==========
async function renderCurrentTicket() {
  if (!currentPhoto || !analysisResult) return;

  const canvas = $('ticket-canvas');
  if (!canvas) return;

  const destination = $('ticket-destination-input')?.value ||
    analysisResult.emotion?.sceneType || '旅途';
  const date = $('ticket-date-input')?.value || formatDate(new Date());

  const colors = getStyleColors(currentStyle);
  const ticketCount = await getTicketCount();

  await renderTicket(canvas, {
    photoUrl: currentPhoto.dataUrl,
    destination: destination || '旅途',
    date: date,
    moodText: currentMoodText || analysisResult.moodText || '旅途中的光景',
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
    const destination = $('ticket-destination-input')?.value ||
      analysisResult?.emotion?.sceneType || '旅途';
    const date = $('ticket-date-input')?.value || formatDate(new Date());

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
    toast('票根已保存！', 2000);

    // 更新票根墙
    loadTicketWall();

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

// ========== 重新生成文案 ==========
async function handleRegenCopy() {
  if (!currentPhoto || !analysisResult) return;

  const regenBtn = $('ticket-regen-copy');
  if (regenBtn) {
    regenBtn.disabled = true;
    regenBtn.textContent = '生成中...';
  }

  try {
    const destination = $('ticket-destination-input')?.value || '';
    const date = $('ticket-date-input')?.value || '';
    await generateMoodText(destination, date);
    await renderCurrentTicket();
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

    // 绑定删除事件
    grid.querySelectorAll('.ticket-wall-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm('确定删除这张票根吗？')) {
          await deleteTicket(id);
          loadTicketWall();
          toast('已删除', 2000);
        }
      });
    });

    // 点击查看大图
    grid.querySelectorAll('.ticket-wall-item').forEach(item => {
      item.addEventListener('click', () => {
        const img = item.querySelector('img');
        if (img) {
          const overlay = document.createElement('div');
          overlay.className = 'ticket-image-overlay';
          overlay.innerHTML = `<img src="${img.src}" alt="票根大图">`;
          overlay.addEventListener('click', () => overlay.remove());
          document.body.appendChild(overlay);
        }
      });
    });

  } catch (error) {
    logger.error({ err: error.message }, '加载票根墙失败');
    toast('加载票根墙失败', 3000);
  }
}

// ========== 辅助函数 ==========
function updateGenProgress(text, step) {
  const textEl = $('ticket-gen-text');
  if (textEl) textEl.textContent = text;

  // 更新步骤指示器
  document.querySelectorAll('.ticket-gen-step').forEach((el, i) => {
    el.classList.toggle('active', i < step);
    el.classList.toggle('done', i < step - 1);
  });
}

async function getTicketCount() {
  try {
    const tickets = await getAllTickets();
    return tickets.length;
  } catch {
    return 0;
  }
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
