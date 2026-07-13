/**
 * RoomManager — 多人共创房间状态管理
 * 职责：房间创建/销毁、成员管理、状态快照、过期清理
 */

const crypto = require('crypto');

const ROOM_EXPIRE_MS = 30 * 60 * 1000;
const MAX_MEMBERS_PER_ROOM = 50;
const MAX_ROOMS_PER_IP = 3;
const ROOM_CREATE_WINDOW_MS = 60 * 1000;
const COCREATE_AVATARS = ['clapper', 'masks', 'palette', 'camera', 'mic', 'music', 'edit', 'sparkles'];

const rooms = new Map();
const ipCreateLog = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars[crypto.randomInt(0, chars.length)];
  }
  return id;
}

function generateMemberId() {
  return 'u_' + crypto.randomBytes(6).toString('hex');
}

function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim().slice(0, 20);
  return trimmed;
}

function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text.trim().slice(0, 100);
}

function canCreateRoom(ip) {
  const now = Date.now();
  const logs = ipCreateLog.get(ip) || [];
  const recent = logs.filter((t) => now - t < ROOM_CREATE_WINDOW_MS);
  return recent.length < MAX_ROOMS_PER_IP;
}

function recordRoomCreate(ip) {
  const now = Date.now();
  const logs = ipCreateLog.get(ip) || [];
  logs.push(now);
  ipCreateLog.set(
    ip,
    logs.filter((t) => now - t < ROOM_CREATE_WINDOW_MS)
  );
}

function createRoom(hostId, hostName, ip) {
  if (!canCreateRoom(ip)) {
    return { error: 'RATE_LIMITED', message: '创建房间过于频繁，请稍后再试' };
  }

  let roomId;
  for (let i = 0; i < 10; i++) {
    roomId = generateRoomId();
    if (!rooms.has(roomId)) break;
  }
  if (!roomId || rooms.has(roomId)) {
    return { error: 'ID_COLLISION', message: '房间号生成失败，请重试' };
  }

  const hostAvatar = COCREATE_AVATARS[Math.floor(Math.random() * COCREATE_AVATARS.length)];
  const now = Date.now();

  const member = {
    id: hostId,
    name: sanitizeName(hostName) || '房主',
    avatar: hostAvatar,
    text: '',
    isTyping: false,
    isOnline: true,
    lastActiveAt: now,
    joinedAt: now,
  };

  const members = new Map();
  members.set(hostId, member);

  const room = {
    id: roomId,
    hostId,
    createdAt: now,
    lastActivityAt: now,
    status: 'collecting',
    members,
    analysis: null,
    ip,
  };

  rooms.set(roomId, room);
  recordRoomCreate(ip);

  return { room, member };
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function joinRoom(roomId, userId, userName) {
  const room = rooms.get(roomId);
  if (!room) {
    return { error: 'ROOM_NOT_FOUND', message: '房间不存在或已结束' };
  }
  if (room.members.size >= MAX_MEMBERS_PER_ROOM) {
    return { error: 'ROOM_FULL', message: '房间人数已满' };
  }

  const cleanName = sanitizeName(userName) || `创作者${room.members.size + 1}`;
  const avatar = COCREATE_AVATARS[room.members.size % COCREATE_AVATARS.length];
  const now = Date.now();

  const existing = room.members.get(userId);
  if (existing) {
    existing.isOnline = true;
    existing.name = cleanName;
    existing.lastActiveAt = now;
    room.lastActivityAt = now;
    return { room, member: existing, rejoined: true };
  }

  const member = {
    id: userId,
    name: cleanName,
    avatar,
    text: '',
    isTyping: false,
    isOnline: true,
    lastActiveAt: now,
    joinedAt: now,
  };

  room.members.set(userId, member);
  room.lastActivityAt = now;
  return { room, member, rejoined: false };
}

function leaveRoom(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const member = room.members.get(userId);
  if (!member) return false;
  member.isOnline = false;
  member.isTyping = false;
  room.lastActivityAt = Date.now();
  return true;
}

function setMemberOnline(roomId, userId, online) {
  const room = rooms.get(roomId);
  if (!room) return false;
  const member = room.members.get(userId);
  if (!member) return false;
  member.isOnline = online;
  if (!online) member.isTyping = false;
  room.lastActivityAt = Date.now();
  return true;
}

function updateMember(roomId, userId, updates) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'ROOM_NOT_FOUND' };
  const member = room.members.get(userId);
  if (!member) return { error: 'NOT_IN_ROOM' };

  if (updates.name !== undefined) {
    member.name = sanitizeName(updates.name) || member.name;
  }
  if (updates.text !== undefined) {
    member.text = sanitizeText(updates.text);
  }
  member.lastActiveAt = Date.now();
  room.lastActivityAt = member.lastActiveAt;
  return { room, member };
}

function setTyping(roomId, userId, isTyping) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'ROOM_NOT_FOUND' };
  const member = room.members.get(userId);
  if (!member) return { error: 'NOT_IN_ROOM' };
  member.isTyping = !!isTyping;
  member.lastActiveAt = Date.now();
  room.lastActivityAt = member.lastActiveAt;
  return { room };
}

function kickMember(roomId, kickerId, targetId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'ROOM_NOT_FOUND' };
  if (room.hostId !== kickerId) return { error: 'NOT_HOST', message: '只有房主可以踢人' };
  if (kickerId === targetId) return { error: 'CANNOT_KICK_SELF', message: '不能踢自己' };
  const target = room.members.get(targetId);
  if (!target) return { error: 'MEMBER_NOT_FOUND', message: '该成员不在房间中' };
  room.members.delete(targetId);
  room.lastActivityAt = Date.now();
  return { room, kickedId: targetId };
}

function resetRoom(roomId, requesterId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'ROOM_NOT_FOUND' };
  if (room.hostId !== requesterId) return { error: 'NOT_HOST', message: '只有房主可以重置房间' };
  for (const m of room.members.values()) {
    m.text = '';
    m.isTyping = false;
  }
  room.analysis = null;
  room.status = 'collecting';
  room.lastActivityAt = Date.now();
  return { room };
}

function setRoomAnalyzing(roomId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'ROOM_NOT_FOUND' };
  room.status = 'analyzing';
  room.lastActivityAt = Date.now();
  return { room };
}

function setRoomAnalysis(roomId, analysis) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'ROOM_NOT_FOUND' };
  room.analysis = analysis;
  room.status = 'completed';
  room.lastActivityAt = Date.now();
  return { room };
}

function getMemberSnapshot(room, member) {
  return {
    id: member.id,
    name: member.name,
    avatar: member.avatar,
    text: member.text,
    isTyping: member.isTyping,
    isOnline: member.isOnline,
    isHost: member.id === room.hostId,
  };
}

function getRoomSnapshot(room) {
  const members = [];
  for (const m of room.members.values()) {
    members.push(getMemberSnapshot(room, m));
  }
  return {
    roomId: room.id,
    hostId: room.hostId,
    status: room.status,
    members,
    analysis: room.analysis,
    memberCount: members.length,
    onlineCount: members.filter((m) => m.isOnline).length,
  };
}

function cleanupExpiredRooms() {
  const now = Date.now();
  let cleaned = 0;
  for (const [roomId, room] of rooms.entries()) {
    const hasOnline = Array.from(room.members.values()).some((m) => m.isOnline);
    if (!hasOnline && now - room.lastActivityAt > ROOM_EXPIRE_MS) {
      rooms.delete(roomId);
      cleaned++;
    }
  }
  const ipNow = Date.now();
  for (const [ip, logs] of ipCreateLog.entries()) {
    const fresh = logs.filter((t) => ipNow - t < ROOM_CREATE_WINDOW_MS);
    if (fresh.length === 0) {
      ipCreateLog.delete(ip);
    } else {
      ipCreateLog.set(ip, fresh);
    }
  }
  return cleaned;
}

function getRoomCount() {
  return rooms.size;
}

setInterval(cleanupExpiredRooms, 5 * 60 * 1000).unref();

module.exports = {
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  setMemberOnline,
  updateMember,
  setTyping,
  kickMember,
  resetRoom,
  setRoomAnalyzing,
  setRoomAnalysis,
  getRoomSnapshot,
  getMemberSnapshot,
  generateMemberId,
  cleanupExpiredRooms,
  getRoomCount,
  COCREATE_AVATARS,
};
