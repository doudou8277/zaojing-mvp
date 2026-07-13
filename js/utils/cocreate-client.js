/**
 * CocreateClient — 多人共创 WebSocket 客户端
 * 封装重连、心跳、事件分发、防抖 typing/update
 */

import { logger } from '../utils/logger.js';

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;
const HEARTBEAT_INTERVAL = 25000;
const TEXT_DEBOUNCE_MS = 300;

const STORAGE_KEY = 'zaojing_cocreate_user';

function loadLocalUser() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.id) return data;
    }
  } catch {}
  return null;
}

function saveLocalUser(user) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {}
}

function generateTempId() {
  return 'u_' + Math.random().toString(36).slice(2, 10);
}

class CocreateClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.textDebounceTimer = null;
    this.pendingText = null;
    this.lastTypingSent = 0;
    this.sendQueue = [];

    this.userId = null;
    this.userName = '';
    this.userAvatar = '';
    this.roomId = null;
    this.isHost = false;
    this.snapshot = null;
    this.intentionalClose = false;

    const saved = loadLocalUser();
    if (saved) {
      this.userId = saved.id;
      this.userName = saved.name || '';
      this.userAvatar = saved.avatar || '';
    } else {
      this.userId = generateTempId();
    }
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const set = this.listeners.get(event);
    if (set) set.delete(handler);
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const h of set) {
        try {
          h(data);
        } catch (e) {
          logger.warn('[WS] listener error:', e);
        }
      }
    }
  }

  getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws/cocreate`;
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.intentionalClose = false;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(this.getWsUrl());
    } catch (e) {
      logger.warn('[WS] connect failed:', e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      logger.info('[WS] connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.emit('connected');
      if (this.roomId) {
        this._sendNow('room:reconnect', { roomId: this.roomId, userId: this.userId });
      }
      this.flushQueue();
    };

    this.ws.onmessage = (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch {
        return;
      }
      this._handleMessage(msg);
    };

    this.ws.onclose = () => {
      logger.info('[WS] closed');
      this.connected = false;
      this.stopHeartbeat();
      this.emit('disconnected');
      if (!this.intentionalClose) this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      logger.warn('[WS] error:', err);
    };
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.sendQueue = [];
    if (this.textDebounceTimer) {
      clearTimeout(this.textDebounceTimer);
      this.textDebounceTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connected = false;
  }

  scheduleReconnect() {
    if (this.intentionalClose) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.emit('reconnect-failed');
      return;
    }
    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5);
    logger.info(`[WS] reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this._send('ping', { t: Date.now() });
      }
    }, HEARTBEAT_INTERVAL);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _sendNow(event, data) {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(JSON.stringify({ event, data }));
      return true;
    } catch (e) {
      logger.warn('[WS] send failed:', e);
      return false;
    }
  }

  _send(event, data) {
    if (this.connected && this.ws && this.ws.readyState === 1) {
      return this._sendNow(event, data);
    }
    this.sendQueue.push({ event, data });
    if (!this.ws || this.ws.readyState === 2 || this.ws.readyState === 3) {
      this.connect();
    }
    return true;
  }

  flushQueue() {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) return;
    const queue = this.sendQueue;
    this.sendQueue = [];
    for (const msg of queue) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch (e) {
        logger.warn('[WS] flushQueue send failed:', e);
      }
    }
  }

  _handleMessage(msg) {
    const { event, data } = msg;
    switch (event) {
      case 'hello':
        break;
      case 'pong':
        break;
      case 'room:created':
        this.roomId = data.roomId;
        this.isHost = data.hostId === this.userId;
        this.snapshot = data.snapshot;
        this._updateLocalUser(data.self);
        this.emit('room:created', data);
        this.emit('room:state', data.snapshot);
        break;
      case 'room:joined':
        this.roomId = data.roomId;
        this.isHost = data.hostId === this.userId;
        this.snapshot = data.snapshot;
        this._updateLocalUser(data.self);
        this.emit('room:joined', data);
        this.emit('room:state', data.snapshot);
        break;
      case 'room:left':
        this.roomId = null;
        this.isHost = false;
        this.snapshot = null;
        this.emit('room:left', data);
        break;
      case 'room:state':
        this.snapshot = data;
        this.isHost = data.hostId === this.userId;
        this.emit('room:state', data);
        break;
      case 'room:error':
        this.emit('room:error', data);
        break;
      case 'member:joined':
        this.emit('member:joined', data);
        break;
      case 'member:left':
        this.emit('member:left', data);
        break;
      case 'member:kicked':
        this.emit('kicked', data);
        this.roomId = null;
        this.isHost = false;
        this.snapshot = null;
        break;
      case 'analyze:started':
        this.emit('analyze:started', data);
        break;
      case 'analyze:result':
        this.emit('analyze:result', data);
        break;
      case 'analyze:error':
        this.emit('analyze:error', data);
        break;
      case 'member:update:ack':
      case 'member:kick:ack':
      case 'room:reset:ack':
        break;
      default:
        this.emit(event, data);
    }
  }

  _updateLocalUser(self) {
    if (!self) return;
    if (self.name) this.userName = self.name;
    if (self.avatar) this.userAvatar = self.avatar;
    saveLocalUser({ id: this.userId, name: this.userName, avatar: this.userAvatar });
  }

  createRoom(name) {
    this.userName = (name || '').trim() || '房主';
    saveLocalUser({ id: this.userId, name: this.userName, avatar: this.userAvatar });
    this.connect();
    return this._send('room:create', { userId: this.userId, name: this.userName });
  }

  joinRoom(roomId, name) {
    this.userName = (name || '').trim() || `创作者`;
    saveLocalUser({ id: this.userId, name: this.userName, avatar: this.userAvatar });
    this.connect();
    return this._send('room:join', { userId: this.userId, roomId, name: this.userName });
  }

  leaveRoom() {
    if (this.roomId) {
      this._send('room:leave', {});
    }
  }

  setName(name) {
    this.userName = name;
    saveLocalUser({ id: this.userId, name: this.userName, avatar: this.userAvatar });
    this._send('member:update', { name });
  }

  updateText(text) {
    this.pendingText = text;
    if (this.textDebounceTimer) clearTimeout(this.textDebounceTimer);
    this.textDebounceTimer = setTimeout(() => {
      this.textDebounceTimer = null;
      if (this.pendingText !== null) {
        this._send('member:update', { text: this.pendingText });
        this.pendingText = null;
      }
    }, TEXT_DEBOUNCE_MS);
  }

  setTyping(isTyping) {
    const now = Date.now();
    if (isTyping && now - this.lastTypingSent < 500) return;
    this.lastTypingSent = now;
    this._send('member:typing', { isTyping });
  }

  kickMember(targetId) {
    this._send('member:kick', { targetId });
  }

  resetRoom() {
    this._send('room:reset', {});
  }

  requestAnalyze() {
    this._send('analyze:request', {});
  }

  isConnected() {
    return this.connected;
  }

  getRoomId() {
    return this.roomId;
  }
  getSnapshot() {
    return this.snapshot;
  }
  getSelfId() {
    return this.userId;
  }
  getSelf() {
    if (!this.snapshot) return null;
    return this.snapshot.members.find((m) => m.id === this.userId) || null;
  }
}

const instance = new CocreateClient();

function getInviteUrl(roomId) {
  return `${location.origin}${location.pathname}#cocreate?room=${roomId}`;
}

export { CocreateClient, instance as cocreateClient, getInviteUrl };
