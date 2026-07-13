/**
 * 共创页模块
 * 支持两种模式：solo（单人本地共创）/ room（实时多人共创）
 */
import { $, state, toast, navigate, escapeHtml } from '../shared.js';
import { logger } from '../utils/logger.js';
import { createModuleBoundary } from '../utils/error-boundary.js';
import * as AIClient from '../ai-client';
import { EMOTION_SPECTRUM } from '../data.js';
import { cocreateClient, getInviteUrl } from '../utils/cocreate-client.js';

const cocreateBoundary = createModuleBoundary('Cocreate');
const COCREATE_AVATARS = ['clapper', 'masks', 'palette', 'camera', 'mic', 'music', 'edit', 'sparkles'];

let _initDirectorsPage = null;
let currentMode = 'solo';
let roomAnalysisResult = null;
let roomBoundEvents = false;

function setupCocreatePage({ initDirectorsPage }) {
  _initDirectorsPage = initDirectorsPage;
}

function initCocreatePage(opts) {
  state.cocreateContributors = [];
  state.cocreateAnalysis = null;
  roomAnalysisResult = null;

  switchMode('solo');

  if (!roomBoundEvents) {
    bindRoomEvents();
    roomBoundEvents = true;
  }

  let inviteRoomId = opts?.inviteRoomId || null;
  if (!inviteRoomId) {
    const urlParams = new URLSearchParams(window.location.hash.split('?')[1] || '');
    inviteRoomId = urlParams.get('room');
  }
  if (inviteRoomId) {
    switchMode('room');
    const roomIdInput = $('cocreate-join-roomid');
    if (roomIdInput) {
      roomIdInput.value = inviteRoomId.toUpperCase();
    }
    history.replaceState(null, '', '#cocreate');
  }

  navigate('cocreate');
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.cocreate-tab').forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.cocreate-mode-panel').forEach((panel) => {
    panel.style.display = panel.dataset.panel === mode ? '' : 'none';
  });

  if (mode === 'solo') {
    cleanupRoom();
    initSoloMode();
  } else {
    showLobby();
  }
}

function initSoloMode() {
  const inputsEl = $('cocreate-inputs');
  if (inputsEl) inputsEl.innerHTML = '';
  state.cocreateContributors = [];

  addCocreateInput('创作者1', '');
  addCocreateInput('创作者2', '');
  addCocreateInput('创作者3', '');

  const summaryEl = $('cocreate-summary');
  if (summaryEl) summaryEl.style.display = 'none';
  const genBtn = $('btn-cocreate-generate');
  if (genBtn) genBtn.style.display = 'none';
  const analyzeBtn = $('btn-cocreate-analyze');
  if (analyzeBtn) {
    analyzeBtn.style.display = 'inline-flex';
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'AI 融合分析 →';
  }
}

function addCocreateInput(name, text) {
  const inputsEl = $('cocreate-inputs');
  if (!inputsEl) return;

  const index = state.cocreateContributors.length;
  const avatar = COCREATE_AVATARS[index % COCREATE_AVATARS.length];
  const contributorName = name || `创作者${index + 1}`;

  const item = document.createElement('div');
  item.className = 'cocreate-input-item';

  item.innerHTML = `
    <div class="cocreate-avatar"><svg class="ico ico-lg"><use href="#i-${avatar}"/></svg></div>
    <div class="cocreate-input-wrap">
      <div class="cocreate-input-name">${escapeHtml(contributorName)}</div>
      <textarea class="cocreate-input-field" placeholder="写下一句心情或故事…" maxlength="100" rows="2">${escapeHtml(text || '')}</textarea>
    </div>
    <button class="cocreate-remove" title="移除">×</button>
  `;

  const removeBtn = item.querySelector('.cocreate-remove');
  removeBtn.addEventListener('click', () => {
    const items = inputsEl.querySelectorAll('.cocreate-input-item');
    if (items.length <= 1) {
      toast('至少保留一位创作者');
      return;
    }
    item.remove();
    inputsEl.querySelectorAll('.cocreate-input-item').forEach((el, i) => {
      const nameEl = el.querySelector('.cocreate-input-name');
      if (nameEl) nameEl.textContent = `创作者${i + 1}`;
      const avatarEl = el.querySelector('.cocreate-avatar');
      if (avatarEl)
        avatarEl.innerHTML = `<svg class="ico ico-lg"><use href="#i-${COCREATE_AVATARS[i % COCREATE_AVATARS.length]}"/></svg>`;
    });
  });

  inputsEl.appendChild(item);
  state.cocreateContributors.push({ name: contributorName, text: text || '' });
}

async function analyzeCocreate() {
  const inputsEl = $('cocreate-inputs');
  if (!inputsEl) return;

  const fields = inputsEl.querySelectorAll('.cocreate-input-field');
  const texts = [];
  fields.forEach((f) => {
    const t = f.value.trim();
    if (t) texts.push(t);
  });

  if (texts.length === 0) {
    toast('请至少输入一句心情或故事');
    return;
  }

  const mergedText = texts.join('；');
  const analyzeBtn = $('btn-cocreate-analyze');
  analyzeBtn.textContent = 'AI 分析中…';
  analyzeBtn.disabled = true;

  let analysis = null;

  if (state.aiHealthStatus) {
    analysis = await cocreateBoundary.run(
      () => AIClient.analyzeEmotion(mergedText, null),
      (err) => {
        logger.warn('AI 分析失败，使用本地分析:', err.message);
        return null;
      }
    );
  }

  if (!analysis) {
    const emotionKeys = Object.keys(EMOTION_SPECTRUM);
    const randomEmotion = emotionKeys[Math.floor(Math.random() * emotionKeys.length)];
    const config = EMOTION_SPECTRUM[randomEmotion];
    analysis = {
      primaryEmotion: randomEmotion,
      intensity: Math.floor(Math.random() * 4) + 6,
      keywords: config.keywords,
      summary: `这是 ${texts.length} 位创作者的情绪融合。${randomEmotion}是主导情绪，交织着${config.keywords.join('、')}的意象。每个人的故事在这里相遇，汇成一部共同的电影。`,
    };
  }

  state.cocreateAnalysis = analysis;

  $('cocreate-emotion').textContent = analysis.primaryEmotion || '融合';

  const keywordsEl = $('cocreate-keywords');
  keywordsEl.innerHTML = '';
  const keywords = analysis.keywords || [];
  keywords.forEach((kw) => {
    const tag = document.createElement('span');
    tag.className = 'summary-keyword';
    tag.textContent = kw;
    keywordsEl.appendChild(tag);
  });

  $('cocreate-text').textContent =
    analysis.summary || `${texts.length} 位创作者的情绪已融合，主导情绪为${analysis.primaryEmotion}。`;

  $('cocreate-summary').style.display = 'block';
  $('btn-cocreate-generate').style.display = 'inline-flex';
  $('btn-cocreate-analyze').style.display = 'none';

  analyzeBtn.textContent = 'AI 融合分析 →';
  analyzeBtn.disabled = false;

  toast('AI 融合分析完成');
}

function generateCocreatePoster() {
  if (!state.cocreateAnalysis) {
    toast('请先进行 AI 融合分析');
    return;
  }

  const inputsEl = $('cocreate-inputs');
  const fields = inputsEl.querySelectorAll('.cocreate-input-field');
  const texts = [];
  fields.forEach((f) => {
    const t = f.value.trim();
    if (t) texts.push(t);
  });
  const mergedText = texts.join('；') || '多人共创的故事';

  state.emotionAnalysis = state.cocreateAnalysis;
  state.inputText = mergedText;
  state.selectedDirectorIds = [];

  if (typeof _initDirectorsPage === 'function') _initDirectorsPage();
  navigate('directors');
  toast('共创内容已就绪，请选择导演');
}

// ==================== 实时多人模式 ====================

function bindRoomEvents() {
  document.querySelectorAll('.cocreate-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  const on = (id, event, handler) => {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
  };

  on('btn-cocreate-create-room', 'click', handleCreateRoom);
  on('btn-cocreate-join-room', 'click', handleJoinRoom);
  on('btn-cocreate-leave-room', 'click', handleLeaveRoom);
  on('btn-cocreate-reset-room', 'click', handleResetRoom);
  on('btn-cocreate-copy-id', 'click', handleCopyInvite);
  on('btn-cocreate-room-back', 'click', () => navigate('input'));
  on('btn-cocreate-room-analyze', 'click', () => cocreateClient.requestAnalyze());
  on('btn-cocreate-room-generate', 'click', generateRoomPoster);
  on('btn-cocreate-join-self', 'click', handleJoinSelf);

  cocreateClient.on('connected', () => {
    setWsStatus('已连接', 'connected');
  });
  cocreateClient.on('disconnected', () => {
    setWsStatus('连接已断开，正在重连...', 'disconnected');
  });
  cocreateClient.on('reconnecting', ({ attempt }) => {
    setWsStatus(`重连中... (第${attempt}次)`, 'reconnecting');
  });
  cocreateClient.on('reconnect-failed', () => {
    setWsStatus('连接失败，请刷新页面重试', 'error');
    toast('无法连接到服务器');
  });
  cocreateClient.on('room:created', onJoinedRoom);
  cocreateClient.on('room:joined', onJoinedRoom);
  cocreateClient.on('room:state', renderRoomState);
  cocreateClient.on('room:error', ({ code, message }) => {
    toast(message || '操作失败');
    if (code === 'ROOM_NOT_FOUND') showLobby();
  });
  cocreateClient.on('kicked', () => {
    toast('你已被房主移出房间');
    showLobby();
  });
  cocreateClient.on('analyze:started', () => {
    roomAnalysisResult = null;
    showAnalyzing(true);
    const btn = $('btn-cocreate-room-analyze');
    if (btn) btn.disabled = true;
  });
  cocreateClient.on('analyze:result', ({ analysis }) => {
    roomAnalysisResult = analysis;
    showAnalyzing(false);
    renderRoomAnalysis(analysis);
    const btn = $('btn-cocreate-room-analyze');
    if (btn) {
      btn.disabled = false;
      btn.style.display = 'none';
    }
    const genBtn = $('btn-cocreate-room-generate');
    if (genBtn) genBtn.style.display = 'inline-flex';
    toast('AI 融合分析完成');
  });
  cocreateClient.on('analyze:error', ({ message }) => {
    showAnalyzing(false);
    const btn = $('btn-cocreate-room-analyze');
    if (btn) btn.disabled = false;
    toast(message || 'AI 分析失败，请重试');
  });
}

function setWsStatus(text, type) {
  const el = $('cocreate-ws-status');
  if (!el) return;
  el.textContent = text;
  el.className = `cocreate-ws-status ws-${type || 'info'}`;
  if (type === 'connected') {
    setTimeout(() => {
      el.textContent = '';
      el.className = 'cocreate-ws-status';
    }, 2000);
  }
}

function showLobby() {
  const lobby = $('cocreate-lobby');
  const room = $('cocreate-room');
  if (lobby) lobby.style.display = '';
  if (room) room.style.display = 'none';
  roomAnalysisResult = null;
}

function showRoom() {
  const lobby = $('cocreate-lobby');
  const room = $('cocreate-room');
  if (lobby) lobby.style.display = 'none';
  if (room) room.style.display = '';
}

function cleanupRoom() {
  cocreateClient.leaveRoom();
  cocreateClient.disconnect();
  roomAnalysisResult = null;
}

function handleCreateRoom() {
  const nameInput = $('cocreate-create-name');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    toast('请输入你的昵称');
    nameInput?.focus();
    return;
  }
  cocreateClient.createRoom(name);
}

function handleJoinRoom() {
  const roomIdInput = $('cocreate-join-roomid');
  const nameInput = $('cocreate-join-name');
  const roomId = roomIdInput ? roomIdInput.value.trim().toUpperCase() : '';
  const name = nameInput ? nameInput.value.trim() : '';
  if (!roomId || roomId.length < 4) {
    toast('请输入有效的房间号');
    roomIdInput?.focus();
    return;
  }
  if (!name) {
    toast('请输入你的昵称');
    nameInput?.focus();
    return;
  }
  cocreateClient.joinRoom(roomId, name);
}

function handleLeaveRoom() {
  cocreateClient.leaveRoom();
  cocreateClient.disconnect();
  showLobby();
}

function handleResetRoom() {
  cocreateClient.resetRoom();
  roomAnalysisResult = null;
  const summaryEl = $('cocreate-room-summary');
  if (summaryEl) summaryEl.style.display = 'none';
  const analyzingEl = $('cocreate-analyzing');
  if (analyzingEl) analyzingEl.style.display = 'none';
  const genBtn = $('btn-cocreate-room-generate');
  if (genBtn) genBtn.style.display = 'none';
  const analyzeBtn = $('btn-cocreate-room-analyze');
  if (analyzeBtn) {
    analyzeBtn.style.display = 'inline-flex';
    analyzeBtn.disabled = false;
  }
}

function handleJoinSelf() {
  const mySnapshot = cocreateClient.getSelf();
  if (!mySnapshot) {
    cocreateClient.updateText('');
    return;
  }
  renderRoomState(cocreateClient.getSnapshot());
}

async function handleCopyInvite() {
  const roomId = cocreateClient.getRoomId();
  if (!roomId) return;
  const url = getInviteUrl(roomId);
  try {
    await navigator.clipboard.writeText(`房间号: ${roomId}\n邀请链接: ${url}`);
    toast('房间号和链接已复制');
  } catch {
    toast(`房间号: ${roomId}`);
  }
  try {
    const qrEl = $('cocreate-qr');
    const qrWrap = $('cocreate-qr-wrap');
    if (qrEl && qrWrap) {
      const QRCode = (await import('qrcode')).default;
      qrEl.innerHTML = '';
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, url, { width: 160, margin: 1, color: { dark: '#f3ece0', light: '#0000' } });
      qrEl.appendChild(canvas);
      qrWrap.style.display = qrWrap.style.display === 'none' ? '' : 'none';
    }
  } catch (e) {
    logger.warn('QR code failed:', e);
  }
}

function onJoinedRoom() {
  showRoom();
  const resetBtn = $('btn-cocreate-reset-room');
  if (resetBtn) resetBtn.style.display = cocreateClient.isHost ? '' : 'none';
}

function renderRoomState(snapshot) {
  if (!snapshot) return;
  const roomIdText = $('cocreate-room-id-text');
  if (roomIdText) roomIdText.textContent = snapshot.roomId;

  const onlineCount = (snapshot.members || []).filter((m) => m.isOnline).length;
  const countEl = $('cocreate-online-count');
  if (countEl) countEl.textContent = String(snapshot.members.length);

  const resetBtn = $('btn-cocreate-reset-room');
  if (resetBtn) resetBtn.style.display = snapshot.hostId === cocreateClient.getSelfId() ? '' : 'none';

  const membersEl = $('cocreate-members');
  if (membersEl) {
    const selfId = cocreateClient.getSelfId();
    const hasSelfEntry = snapshot.members.some((m) => m.id === selfId);
    const joinSelfBtn = $('btn-cocreate-join-self');
    if (joinSelfBtn) joinSelfBtn.style.display = hasSelfEntry ? 'none' : '';

    membersEl.innerHTML = '';
    snapshot.members.forEach((m) => renderMemberCard(membersEl, m, selfId, snapshot.hostId));

    const hasAnyText = snapshot.members.some((m) => m.text && m.text.trim());
    const actionsEl = $('cocreate-room-actions');
    const waitingEl = $('cocreate-waiting');
    const analyzingEl = $('cocreate-analyzing');
    if (analyzingEl && analyzingEl.style.display !== 'none') {
      if (waitingEl) waitingEl.style.display = 'none';
    } else if (roomAnalysisResult) {
      if (waitingEl) waitingEl.style.display = 'none';
    } else {
      const hasMultipleMembers = snapshot.members.length >= 1;
      if (waitingEl) waitingEl.style.display = hasMultipleMembers && !hasAnyText ? '' : 'none';
    }

    if (actionsEl) actionsEl.style.display = hasAnyText && !roomAnalysisResult ? '' : roomAnalysisResult ? '' : 'none';
  }
}

function renderMemberCard(container, member, selfId, hostId) {
  const isSelf = member.id === selfId;
  const isMemberHost = member.id === hostId;
  const amHost = selfId === hostId;
  const card = document.createElement('div');
  card.className = `cocreate-input-item room-member ${member.isOnline ? '' : 'offline'} ${isSelf ? 'is-self' : ''}`;

  let statusBadge = '';
  if (isMemberHost) statusBadge = '<span class="member-badge host-badge">👑 房主</span>';
  else if (!member.isOnline) statusBadge = '<span class="member-badge offline-badge">⚫ 离线</span>';
  else if (member.isTyping) statusBadge = '<span class="member-badge typing-badge">🟢 正在输入…</span>';
  else if (!member.text) statusBadge = '<span class="member-badge idle-badge">⚪ 未输入</span>';
  else statusBadge = '<span class="member-badge done-badge">✅ 已输入</span>';

  const kickBtn =
    amHost && !isSelf
      ? `<button class="cocreate-kick-btn" data-target="${member.id}" title="移出房间">移出</button>`
      : '';

  card.innerHTML = `
    <div class="cocreate-avatar ${member.isOnline ? '' : 'avatar-offline'}">
      <svg class="ico ico-lg"><use href="#i-${member.avatar}"/></svg>
    </div>
    <div class="cocreate-input-wrap">
      <div class="cocreate-input-name">
        ${escapeHtml(member.name)} ${isSelf ? '<span class="self-tag">(你)</span>' : ''}
        ${statusBadge}
      </div>
      ${
        isSelf
          ? `<textarea class="cocreate-input-field" placeholder="写下一句心情或故事…" maxlength="100" rows="2">${escapeHtml(member.text || '')}</textarea>`
          : `<div class="cocreate-input-field readonly ${member.isTyping ? 'is-typing' : ''}">${escapeHtml(member.text || (member.isTyping ? '...' : ''))}</div>`
      }
    </div>
    ${kickBtn}
  `;

  if (isSelf) {
    const textarea = card.querySelector('.cocreate-input-field');
    let typingTimeout = null;
    textarea.addEventListener('focus', () => cocreateClient.setTyping(true));
    textarea.addEventListener('blur', () => {
      cocreateClient.setTyping(false);
      if (typingTimeout) clearTimeout(typingTimeout);
    });
    textarea.addEventListener('input', (e) => {
      cocreateClient.updateText(e.target.value);
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => cocreateClient.setTyping(false), 1500);
    });
  }

  const kickBtnEl = card.querySelector('.cocreate-kick-btn');
  if (kickBtnEl) {
    kickBtnEl.addEventListener('click', () => {
      cocreateClient.kickMember(member.id);
    });
  }

  container.appendChild(card);
}

function showAnalyzing(show) {
  const el = $('cocreate-analyzing');
  const waitingEl = $('cocreate-waiting');
  if (el) el.style.display = show ? '' : 'none';
  if (show && waitingEl) waitingEl.style.display = 'none';
}

function renderRoomAnalysis(analysis) {
  const summaryEl = $('cocreate-room-summary');
  if (!summaryEl || !analysis) return;
  summaryEl.style.display = 'block';

  const emotionEl = $('cocreate-room-emotion');
  if (emotionEl) emotionEl.textContent = analysis.primaryEmotion || '融合';

  const keywordsEl = $('cocreate-room-keywords');
  if (keywordsEl) {
    keywordsEl.innerHTML = '';
    (analysis.keywords || []).forEach((kw) => {
      const tag = document.createElement('span');
      tag.className = 'summary-keyword';
      tag.textContent = kw;
      keywordsEl.appendChild(tag);
    });
  }

  const textEl = $('cocreate-room-text');
  if (textEl) textEl.textContent = analysis.summary || '情绪已融合';
}

function generateRoomPoster() {
  if (!roomAnalysisResult) {
    toast('请先进行 AI 融合分析');
    return;
  }
  const snapshot = cocreateClient.getSnapshot();
  if (!snapshot) return;
  const texts = snapshot.members.map((m) => (m.text || '').trim()).filter(Boolean);
  const mergedText = texts.join('；') || '多人共创的故事';

  state.emotionAnalysis = roomAnalysisResult;
  state.inputText = mergedText;
  state.selectedDirectorIds = [];

  if (typeof _initDirectorsPage === 'function') _initDirectorsPage();
  navigate('directors');
  toast('共创内容已就绪，请选择导演');
}

export { setupCocreatePage, initCocreatePage, addCocreateInput, analyzeCocreate, generateCocreatePoster, switchMode };
