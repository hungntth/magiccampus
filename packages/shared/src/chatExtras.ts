// Chat leftovers (M14 phase G): headline speaker (channel 6, Loa Lớn Siêu Cấp), the player-paid chat ban and its texts, the private chat
// header, the GM inbox limits and pure helpers (plain-text length, ban duration / time formatting) usable on server and client.

import { vnDate } from './dayKey.js';

/** Headline channel (Flash ITEM_HEADLINE_SPEAKER 2297, SYSTEMBARCANVAS_S[0]: fewer than 50 plain characters, kept 30 min). */
export const HEADLINE = { itemId: 2297, maxChars: 49, ttlMs: 1_800_000 } as const;

export const HEADLINE_TEXT = {
  TOO_LONG: 'Chữ điền vào quá dài.',
  NO_SPEAKER: 'Bạn không có đủ loa lớn để phát ngôn đầu bảng.', // CALLBACK_S[188]
  CONFIRM: 'Gửi thông báo lên đầu bảng cần tốn 1 Loa Lớn Siêu Cấp, xác nhận tiếp tục?', // SYSTEMBARCANVAS_S[18]
} as const;

/** Player-paid chat ban (owner rule 2026-11-02): 100 unbound gold to ban, 100 to lift; 20 min, or 12 h with a positive 4th arg. */
export const CHAT_BAN = {
  priceGold: 100,
  shortMs: 1_200_000,
  longMs: 43_200_000,
  liftCommands: ['/huycam', '/huycamchat'],
} as const;

/** `onSystemMidMsgOrNote` texts of the ban flow (Go `handlers/chat/ban_chat.go`). */
export const CHAT_BAN_TEXT = {
  NOT_FOUND: 'Không tìm thấy người chơi này.',
  SELF: 'Không thể tự cấm chat chính mình.',
  OFFLINE: (name: string): string => `${name} không online, không thể cấm chat.`,
  ALREADY: (name: string, left: string): string => `${name} đang bị cấm chat, còn ${left}.`,
  NEED_GOLD: 'Cần 100 vàng để cấm chat.',
  BANNED: (left: string): string => `Bạn đang bị cấm chat, còn ${left}. Gõ /huycam ở khung chat để trả 100 vàng huỷ cấm.`,
  ACTOR_DONE: (target: string, label: string): string => `Đã tốn 100 vàng cấm chat ${target} trong ${label}.`,
  TARGET_TOLD: (actor: string, label: string, until: string): string =>
    `Bạn bị ${actor} cấm chat trong ${label} (đến ${until}). Gõ /huycam ở khung chat để trả 100 vàng huỷ cấm.`,
  NOT_BANNED: 'Bạn không bị cấm chat.',
  LIFT_NEED_GOLD: (left: string): string => `Cần 100 vàng để huỷ cấm chat (còn ${left}).`,
  LIFT_DONE: 'Đã tốn 100 vàng huỷ cấm chat.',
  LIFT_TOLD: (name: string): string => `${name} đã trả 100 vàng để huỷ lệnh cấm chat của bạn.`,
} as const;

/** `chatGM(message, playerId, gmName)`: the H5 GM inbox (decision 12). */
export const GM_MESSAGE = { maxChars: 500, sentNote: 'Đã gửi tới GM', noGmNote: 'Hiện chưa có GM trực tuyến, tin nhắn đã được lưu lại' } as const;

/** `createChatPanel(targetId)` / `getChatPanel(targetId, name)` result: the private-chat window header. */
export interface ChatPanelHeader {
  id: number;
  name: string;
  classId?: number;
  exp?: number;
  level?: number;
  iconCode?: string;
}

const ENTITIES: Readonly<Record<string, string>> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&amp;': '&' };

/** Plain-text length of a chat message: tags stripped, entities unescaped, trimmed, counted in characters (Go `prepareHeadline`). */
export function plainLength(msg: string): number {
  const stripped = msg.replace(/<[^>]*>/g, '').replace(/&(?:lt|gt|quot|apos|nbsp|amp|#39);/g, (e) => ENTITIES[e] ?? e);
  return Array.from(stripped.trim()).length;
}

export interface BanDuration {
  ms: number;
  label: string;
}

/** `banChatByPlayer(id, name, delPass, hours?)`: any positive 4th argument means 12 h, otherwise 20 minutes. */
export function banDuration(hoursArg: unknown): BanDuration {
  const n = Number(hoursArg);
  return Number.isFinite(n) && n > 0 ? { ms: CHAT_BAN.longMs, label: '12 giờ' } : { ms: CHAT_BAN.shortMs, label: '20 phút' };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** "HH:MM DD/MM" in UTC+7 (the legacy server clock). */
export function formatBanUntil(ms: number): string {
  const v = vnDate(ms);
  return `${pad(v.hour)}:${pad(v.minute)} ${pad(v.day)}/${pad(v.month)}`;
}

/** Remaining ban time: "N phút" (rounded up) or "H giờ M phút". */
export function formatBanLeft(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

/** True for `/huycam` and `/huycamchat` (case-insensitive, whole message). */
export function isBanLiftCommand(msg: string): boolean {
  const lower = msg.trim().toLowerCase();
  return CHAT_BAN.liftCommands.some((c) => c === lower);
}
