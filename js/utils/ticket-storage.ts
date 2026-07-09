/**
 * 造境 ZaoJing — 旅行票根存储模块
 * 基于 smartSet / smartGet 实现票根数据的持久化，
 * 大图（data URL）会由 smartSet 自动路由到 IndexedDB，避免 localStorage 配额溢出。
 * 所有票根以 JSON 数组形式存储在单个 key（zaojing_tickets）下，便于整体读写与清理。
 */

import { smartSet, smartGet, smartDelete } from './storage.js';
import { logger } from './logger.js';

/** 所有票根的统一存储键 */
const TICKETS_KEY = 'zaojing_tickets';

/**
 * 票根数据结构
 * 描述一次旅行票根生成结果的完整信息，包含渲染图、原图与情绪分析等元数据。
 */
export interface TicketItem {
  /** 唯一标识 */
  id: string;
  /** 创建时间戳（毫秒） */
  createdAt: number;
  /** 目的地名称 */
  destination: string;
  /** 旅行日期（YYYY-MM-DD） */
  date: string;
  /** 心情文案 */
  moodText: string;
  /** 使用的风格 ID */
  styleId: string;
  /** 画面比例 */
  format: 'vertical' | 'square' | 'horizontal';
  /** 情绪分析结果 */
  emotion: {
    /** 主情绪标签 */
    primary: string;
    /** 情绪强度（0-1） */
    intensity: number;
    /** 情绪标签集合 */
    tags: string[];
    /** 场景类型 */
    sceneType: string;
  };
  /** 动画类型标识 */
  animationType: string;
  /** 渲染后的票根图片 data URL */
  ticketDataUrl: string;
  /** 原始照片 data URL */
  photoDataUrl: string;
  /** 风格推荐理由（可选） */
  styleReason?: string;
}

/**
 * 生成类似 nanoid 的唯一 ID
 * 使用时间戳（36 进制）+ 随机串，保证同一会话内的唯一性。
 * @returns 唯一 ID 字符串
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 读取当前全部票根（内部方法）
 * 从存储中读取并解析票根数组，若读取或解析失败则返回空数组。
 * @returns 票根数组（未排序）
 */
async function readTickets(): Promise<TicketItem[]> {
  try {
    const stored = await smartGet<TicketItem[]>(TICKETS_KEY);
    if (!stored) return [];
    // smartGet 对 JSON 数据会自动解析，但也可能返回字符串
    const tickets =
      typeof stored === 'string' ? (JSON.parse(stored) as TicketItem[]) : stored;
    return Array.isArray(tickets) ? tickets : [];
  } catch (e) {
    logger.warn('[TicketStorage] 读取票根失败:', e);
    return [];
  }
}

/**
 * 写入全部票根（内部方法）
 * 将票根数组序列化后整体存入存储，大图会自动路由到 IndexedDB。
 * @param tickets 票根数组
 */
async function writeTickets(tickets: TicketItem[]): Promise<void> {
  await smartSet(TICKETS_KEY, tickets);
}

/**
 * 保存一张票根
 * 自动生成 id 与 createdAt（若未提供），追加到现有票根列表后持久化。
 * @param ticket 待保存的票根数据
 */
export async function saveTicket(ticket: TicketItem): Promise<void> {
  try {
    const tickets = await readTickets();
    // 补充默认字段，保证数据完整性
    const newTicket: TicketItem = {
      ...ticket,
      id: ticket.id || generateId(),
      createdAt: ticket.createdAt || Date.now(),
    };
    tickets.push(newTicket);
    await writeTickets(tickets);
  } catch (e) {
    logger.warn('[TicketStorage] 保存票根失败:', e);
  }
}

/**
 * 获取全部票根
 * 按 createdAt 降序排列（最新的在前），便于列表展示。
 * @returns 排序后的票根数组
 */
export async function getAllTickets(): Promise<TicketItem[]> {
  try {
    const tickets = await readTickets();
    return tickets.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    logger.warn('[TicketStorage] 获取票根列表失败:', e);
    return [];
  }
}

/**
 * 删除指定 ID 的票根
 * @param id 票根唯一标识
 */
export async function deleteTicket(id: string): Promise<void> {
  try {
    const tickets = await readTickets();
    const filtered = tickets.filter((t) => t.id !== id);
    await writeTickets(filtered);
  } catch (e) {
    logger.warn('[TicketStorage] 删除票根失败:', e);
  }
}

/**
 * 清空全部票根
 * 直接清除存储中的票根键，释放空间。
 */
export async function clearAllTickets(): Promise<void> {
  try {
    await smartDelete(TICKETS_KEY);
  } catch (e) {
    logger.warn('[TicketStorage] 清空票根失败:', e);
  }
}

/**
 * 获取单张票根
 * @param id 票根唯一标识
 * @returns 匹配的票根，未找到时返回 null
 */
export async function getTicket(id: string): Promise<TicketItem | null> {
  try {
    const tickets = await readTickets();
    const found = tickets.find((t) => t.id === id);
    return found ?? null;
  } catch (e) {
    logger.warn('[TicketStorage] 获取票根详情失败:', e);
    return null;
  }
}
