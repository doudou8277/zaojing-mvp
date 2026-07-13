/**
 * WebSocket 服务 — 多人共创实时通信
 * 协议：所有消息为 JSON，格式 { event: string, data: any, requestId?: string }
 */

const { WebSocketServer } = require('ws');
const url = require('url');
const roomManager = require('./room-manager');
const aiService = require('./ai-service');
const logger = require('./logger');

const HEARTBEAT_INTERVAL = 30 * 1000;
const CLIENT_TIMEOUT_MS = 60 * 1000;
const TEXT_DEBOUNCE_MS = 300;
const TYPING_THROTTLE_MS = 500;

const clients = new Map();
const debounceTimers = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function send(ws, event, data, requestId) {
  if (ws.readyState !== 1) return;
  const msg = JSON.stringify({ event, data, ...(requestId ? { requestId } : {}) });
  try {
    ws.send(msg);
  } catch (e) {
    logger.debug({ err: e.message }, 'WS send failed');
  }
}

function sendError(ws, code, message, requestId) {
  send(ws, 'room:error', { code, message }, requestId);
}

function broadcast(room, event, data, excludeId) {
  const snapshot = roomManager.getRoomSnapshot(room);
  for (const [, cli] of clients) {
    if (cli.roomId === room.id && cli.userId !== excludeId && cli.ws.readyState === 1) {
      send(cli.ws, event, data);
    }
  }
}

function broadcastRoomState(room) {
  const snapshot = roomManager.getRoomSnapshot(room);
  for (const [, cli] of clients) {
    if (cli.roomId === room.id && cli.ws.readyState === 1) {
      send(cli.ws, 'room:state', snapshot);
    }
  }
}

function setupWSServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = url.parse(req.url);
    if (pathname === '/ws/cocreate') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    const ip = getClientIp(req);
    const clientId = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const cli = {
      id: clientId,
      ws,
      ip,
      userId: null,
      roomId: null,
      lastSeen: Date.now(),
      isAlive: true,
    };
    clients.set(clientId, cli);

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
      cli.isAlive = true;
      cli.lastSeen = Date.now();
    });

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        sendError(ws, 'INVALID_JSON', '消息格式错误');
        return;
      }
      cli.lastSeen = Date.now();
      handleMessage(cli, msg).catch((err) => {
        logger.error({ err: err.message, event: msg?.event }, 'WS handler error');
        sendError(ws, 'INTERNAL_ERROR', '服务器内部错误', msg?.requestId);
      });
    });

    ws.on('close', () => {
      handleDisconnect(cli);
      clients.delete(clientId);
    });

    ws.on('error', (err) => {
      logger.debug({ clientId, err: err.message }, 'WS error');
    });

    send(ws, 'hello', { clientId, serverTime: Date.now() });
  });

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const [, cli] of clients) {
      if (!cli.isAlive || now - cli.lastSeen > CLIENT_TIMEOUT_MS) {
        handleDisconnect(cli);
        try {
          cli.ws.terminate();
        } catch {}
        clients.delete(cli.id);
        continue;
      }
      cli.isAlive = false;
      try {
        cli.ws.ping();
      } catch {}
    }
  }, HEARTBEAT_INTERVAL);
  heartbeatTimer.unref();

  logger.info('WebSocket server attached to /ws/cocreate');
  return wss;
}

async function handleMessage(cli, msg) {
  const { event, data, requestId } = msg;

  switch (event) {
    case 'ping':
      send(cli.ws, 'pong', { t: Date.now() }, requestId);
      return;

    case 'room:create':
      return handleCreateRoom(cli, data, requestId);
    case 'room:join':
      return handleJoinRoom(cli, data, requestId);
    case 'room:reconnect':
      return handleReconnect(cli, data, requestId);
    case 'room:leave':
      return handleLeave(cli, requestId);
    case 'member:update':
      return handleMemberUpdate(cli, data, requestId);
    case 'member:typing':
      return handleTyping(cli, data, requestId);
    case 'member:kick':
      return handleKick(cli, data, requestId);
    case 'room:reset':
      return handleReset(cli, requestId);
    case 'analyze:request':
      return handleAnalyze(cli, requestId);
    default:
      sendError(cli.ws, 'UNKNOWN_EVENT', `未知事件: ${event}`, requestId);
  }
}

function requireInRoom(cli) {
  if (!cli.roomId || !cli.userId) return null;
  const room = roomManager.getRoom(cli.roomId);
  if (!room) return null;
  const member = room.members.get(cli.userId);
  if (!member) return null;
  return { room, member };
}

function handleCreateRoom(cli, data, requestId) {
  const userId = data?.userId || roomManager.generateMemberId();
  const name = data?.name || '房主';
  const result = roomManager.createRoom(userId, name, cli.ip);
  if (result.error) {
    sendError(cli.ws, result.error, result.message, requestId);
    return;
  }
  const { room, member } = result;
  cli.userId = userId;
  cli.roomId = room.id;
  roomManager.setMemberOnline(room.id, userId, true);
  const snapshot = roomManager.getRoomSnapshot(room);
  send(
    cli.ws,
    'room:created',
    {
      roomId: room.id,
      self: roomManager.getMemberSnapshot(room, member),
      hostId: room.hostId,
      snapshot,
    },
    requestId
  );
}

function handleJoinRoom(cli, data, requestId) {
  if (!data?.roomId) {
    sendError(cli.ws, 'INVALID_PARAM', '请输入房间号', requestId);
    return;
  }
  const userId = data?.userId || roomManager.generateMemberId();
  const name = data?.name || '';
  const roomId = String(data.roomId).toUpperCase().trim();
  const result = roomManager.joinRoom(roomId, userId, name);
  if (result.error) {
    sendError(cli.ws, result.error, result.message, requestId);
    return;
  }
  const { room, member } = result;
  cli.userId = userId;
  cli.roomId = room.id;
  roomManager.setMemberOnline(room.id, userId, true);

  const snapshot = roomManager.getRoomSnapshot(room);
  send(
    cli.ws,
    'room:joined',
    {
      roomId: room.id,
      self: roomManager.getMemberSnapshot(room, member),
      hostId: room.hostId,
      snapshot,
      rejoined: result.rejoined,
    },
    requestId
  );

  if (!result.rejoined) {
    broadcast(room, 'member:joined', { member: roomManager.getMemberSnapshot(room, member) }, userId);
    broadcastRoomState(room);
  }
}

function handleReconnect(cli, data, requestId) {
  if (!data?.roomId || !data?.userId) {
    sendError(cli.ws, 'INVALID_PARAM', '重连参数缺失', requestId);
    return;
  }
  const roomId = String(data.roomId).toUpperCase().trim();
  const userId = String(data.userId);
  const room = roomManager.getRoom(roomId);
  if (!room) {
    sendError(cli.ws, 'ROOM_NOT_FOUND', '房间不存在或已结束', requestId);
    return;
  }
  const member = room.members.get(userId);
  if (!member) {
    sendError(cli.ws, 'NOT_IN_ROOM', '你不在该房间中', requestId);
    return;
  }
  cli.userId = userId;
  cli.roomId = roomId;
  roomManager.setMemberOnline(roomId, userId, true);
  const snapshot = roomManager.getRoomSnapshot(room);
  send(
    cli.ws,
    'room:joined',
    {
      roomId,
      self: roomManager.getMemberSnapshot(room, member),
      hostId: room.hostId,
      snapshot,
      rejoined: true,
    },
    requestId
  );
  broadcastRoomState(room);
}

function handleLeave(cli, requestId) {
  const ctx = requireInRoom(cli);
  if (!ctx) {
    send(cli.ws, 'room:left', {}, requestId);
    return;
  }
  const { room } = ctx;
  const userId = cli.userId;
  roomManager.leaveRoom(room.id, userId);
  room.members.delete(userId);
  broadcast(room, 'member:left', { memberId: userId });
  broadcastRoomState(room);
  send(cli.ws, 'room:left', {}, requestId);
  cli.roomId = null;
}

function handleMemberUpdate(cli, data, requestId) {
  const ctx = requireInRoom(cli);
  if (!ctx) {
    sendError(cli.ws, 'NOT_IN_ROOM', '你不在房间中', requestId);
    return;
  }
  const { room } = ctx;
  const existingTimer = debounceTimers.get(cli.id);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    debounceTimers.delete(cli.id);
    const updates = {};
    if (data?.name !== undefined) updates.name = data.name;
    if (data?.text !== undefined) updates.text = data.text;
    const result = roomManager.updateMember(room.id, cli.userId, updates);
    if (result.error) return;
    broadcastRoomState(room);
  }, TEXT_DEBOUNCE_MS);
  debounceTimers.set(cli.id, timer);

  if (data?.name !== undefined) {
    roomManager.updateMember(room.id, cli.userId, { name: data.name });
  }
  send(cli.ws, 'member:update:ack', {}, requestId);
}

let lastTypingSent = new Map();
function handleTyping(cli, data, requestId) {
  const ctx = requireInRoom(cli);
  if (!ctx) return;
  const { room } = ctx;
  const isTyping = !!data?.isTyping;
  const now = Date.now();
  const last = lastTypingSent.get(cli.id) || 0;
  if (isTyping && now - last < TYPING_THROTTLE_MS) return;
  lastTypingSent.set(cli.id, now);
  roomManager.setTyping(room.id, cli.userId, isTyping);
  broadcastRoomState(room);
}

function handleKick(cli, data, requestId) {
  const ctx = requireInRoom(cli);
  if (!ctx) {
    sendError(cli.ws, 'NOT_IN_ROOM', '你不在房间中', requestId);
    return;
  }
  const { room } = ctx;
  const targetId = data?.targetId;
  if (!targetId) {
    sendError(cli.ws, 'INVALID_PARAM', '缺少目标成员', requestId);
    return;
  }
  const result = roomManager.kickMember(room.id, cli.userId, targetId);
  if (result.error) {
    sendError(cli.ws, result.error, result.message, requestId);
    return;
  }

  for (const [, c] of clients) {
    if (c.roomId === room.id && c.userId === targetId && c.ws.readyState === 1) {
      send(c.ws, 'member:kicked', { byId: cli.userId, reason: '你已被房主移出房间' });
      setTimeout(() => {
        try {
          c.ws.terminate();
        } catch {}
      }, 500);
    }
  }
  clients.forEach((c) => {
    if (c.userId === targetId && c.roomId === room.id) c.roomId = null;
  });

  broadcast(room, 'member:left', { memberId: targetId, kicked: true, byId: cli.userId });
  broadcastRoomState(room);
  send(cli.ws, 'member:kick:ack', { kickedId: targetId }, requestId);
}

function handleReset(cli, requestId) {
  const ctx = requireInRoom(cli);
  if (!ctx) {
    sendError(cli.ws, 'NOT_IN_ROOM', '你不在房间中', requestId);
    return;
  }
  const { room } = ctx;
  const result = roomManager.resetRoom(room.id, cli.userId);
  if (result.error) {
    sendError(cli.ws, result.error, result.message, requestId);
    return;
  }
  broadcastRoomState(room);
  send(cli.ws, 'room:reset:ack', {}, requestId);
}

async function handleAnalyze(cli, requestId) {
  const ctx = requireInRoom(cli);
  if (!ctx) {
    sendError(cli.ws, 'NOT_IN_ROOM', '你不在房间中', requestId);
    return;
  }
  const { room } = ctx;
  if (room.status === 'analyzing') {
    sendError(cli.ws, 'ALREADY_ANALYZING', 'AI 正在分析中，请稍候', requestId);
    return;
  }

  const texts = [];
  for (const m of room.members.values()) {
    if (m.text && m.text.trim()) texts.push(m.text.trim());
  }
  if (texts.length === 0) {
    sendError(cli.ws, 'NO_CONTENT', '还没有人输入内容', requestId);
    return;
  }

  roomManager.setRoomAnalyzing(room.id);
  broadcast(room, 'analyze:started', { triggeredBy: cli.userId });
  broadcastRoomState(room);

  try {
    const mergedText = texts.join('；');
    let analysis = await aiService.analyzeEmotion(mergedText, null).catch((err) => {
      logger.warn({ err: err.message }, 'AI analyze in WS failed, using fallback');
      return null;
    });

    if (!analysis) {
      const EMOTION_SPECTRUM = {
        nostalgia: { keywords: ['回忆', '旧时光', '温暖', '岁月'] },
        melancholy: { keywords: ['孤独', '思念', '忧伤', '夜晚'] },
        hope: { keywords: ['希望', '光', '明天', '远方'] },
        romance: { keywords: ['心动', '相遇', '温柔', '月光'] },
        tension: { keywords: ['紧张', '对峙', '危机', '雨夜'] },
        joy: { keywords: ['欢笑', '阳光', '朋友', '庆祝'] },
      };
      const keys = Object.keys(EMOTION_SPECTRUM);
      const randomEmotion = keys[Math.floor(Math.random() * keys.length)];
      const config = EMOTION_SPECTRUM[randomEmotion];
      analysis = {
        primaryEmotion: randomEmotion,
        intensity: Math.floor(Math.random() * 4) + 6,
        keywords: config.keywords,
        summary: `这是 ${texts.length} 位创作者的情绪融合。${randomEmotion}是主导情绪，交织着${config.keywords.join('、')}的意象。每个人的故事在这里相遇，汇成一部共同的电影。`,
      };
    }

    roomManager.setRoomAnalysis(room.id, analysis);
    broadcast(room, 'analyze:result', { analysis, triggeredBy: cli.userId });
    broadcastRoomState(room);
  } catch (err) {
    logger.error({ err: err.message }, 'WS analyze failed');
    room.status = 'collecting';
    broadcast(room, 'analyze:error', { message: 'AI 分析失败，请重试', triggeredBy: cli.userId });
    broadcastRoomState(room);
  }
}

function handleDisconnect(cli) {
  const existingTimer = debounceTimers.get(cli.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
    debounceTimers.delete(cli.id);
  }
  if (cli.roomId && cli.userId) {
    const room = roomManager.getRoom(cli.roomId);
    if (room) {
      roomManager.setMemberOnline(cli.roomId, cli.userId, false);
      broadcastRoomState(room);
    }
  }
}

module.exports = { setupWSServer };
