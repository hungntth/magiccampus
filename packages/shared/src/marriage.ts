// M14 phases D / E: marriage wire contract shared by server and client. Phase D (core): tuning, NPC 215 / 852 menu funcs, panel rows
// (onInitMarriageSekList / onInitCharMarriageList), onInitCouple, couple rank, the world onSysEvent union and the couple reward
// ids. Phase E (wedding hall) tiers and booking rows live here too; its pure rules and texts are in wedding.ts. RPCs: initMarriage,
// marriageSeeking, marriageRequest, marriageReqFeedback, cancelMarriageSekInfo, getCoupleRank, useGoodCard, acceptNpcMarriage;
// pushes: onInitMarriageSekList, onInitCharMarriageList, onInitCouple, onSysEvent, onConfirmAlert.

import { DAY_MS, VN_OFFSET_MS, startOfDayMs } from './dayKey.js';

export const MARRIAGE = {
  minLevel: 30,
  seekCost: 1_000_000,
  dailyRequests: 5,
  rankPage: 48,
  /** Seek board size (Go ListSeeking(100)). */
  seekListMax: 100,
  /** Rows of the caller's own proposal list. */
  requestListMax: 100,
  /** NPC proposal window (Go npcProposalTTL, an assumption: the client has no timer). */
  npcProposalMs: 60_000,
  /** The hall tier picked at the NPC stays valid this long (phase E). */
  tierPickMs: 30 * 60_000,
  /** marriage_requests TTL (plan decision 7). */
  requestTtlDays: 30,
  /** Seek / proposal text cap (H5 hygiene, Flash has a text box without a documented cap). */
  contentMax: 100,
  /** Divorce card template (Thẻ Ly Hôn). */
  divorceCardTid: 122,
} as const;

/** Cupid (Anh Vũ Cảnh, map 34) and Nguyệt Lão (placed on the placeholder map 100 in the data: only hooked, not reachable). */
export const NPC_MARRIAGE = {
  npcIds: [215, 852],
  funcPrefix: 'marriage_',
  questFunc: (npcId: number): string => `open_npc_interaction_${npcId}`,
  /** Phase E: Nguyệt Lão is a per-viewer instance NPC on Anh Vũ Cảnh, next to Cupid (its own row stands on the empty map 100). */
  hub: { mapId: 34, x: 1300, y: 1230 },
} as const;

export const MARRIAGE_FUNC = {
  wed: 'marriage_wed',
  guide: 'marriage_guide',
  /** Phase E: `marriage_book_1..3` store the hall tier and open the booking panel. */
  book: (tier: number): string => `marriage_book_${tier}`,
  bookPrefix: 'marriage_book_',
  list: 'marriage_list',
} as const;

/** Wire ring / hall tier of a marriage: 1 Thông Thường, 2 Cao Cấp, 3 Quý Giá (a new marriage starts at 1). */
export type RingType = 1 | 2 | 3;

/** Wedding hall tiers (WEDDING_BOOK_PANEL_U[18], phase E). */
export interface WeddingTier {
  type: RingType;
  label: string;
  cost: number;
  mapId: number;
  ring: number;
  giftBag: number;
  invite: number;
  guestBag: number;
}

export const WEDDING_TIERS: readonly WeddingTier[] = [
  { type: 1, label: 'Thông Thường', cost: 2_990_000, mapId: 64, ring: 1707, giftBag: 1687, invite: 1691, guestBag: 1715 },
  { type: 2, label: 'Cao Cấp', cost: 3_990_000, mapId: 63, ring: 1708, giftBag: 1688, invite: 1692, guestBag: 1716 },
  { type: 3, label: 'Quý Giá', cost: 5_000_000, mapId: 65, ring: 1709, giftBag: 1689, invite: 1693, guestBag: 1717 },
];

export const WEDDING = {
  openMs: 60 * 60_000,
  slotGapMs: 30 * 60_000,
  maxAheadMs: 24 * 60 * 60_000,
  afterRingMs: 10 * 60_000,
  invitesPerCard: 10,
  redBagSilver: 300_000,
} as const;

export function weddingTier(type: number): WeddingTier | undefined {
  return WEDDING_TIERS.find((t) => t.type === type);
}

/** Titles a divorce revokes from both partners (Go coupleTitleIDs; title 126 stays, it is a hall memory). */
export const COUPLE_TITLE_IDS: readonly number[] = [61, 62, 63, 102, 103, 104, 106, 108, 134];

/** Couple battle skills: level rows per family, level 1 first (3305 Đồng Khí Liên Chi, 3774 Sống Chết Có Nhau). Granted on marriage. */
export const COUPLE_SKILL_LEVELS: readonly (readonly number[])[] = [
  [3305, 5418, 5419, 5420, 5421, 5422, 5423, 5424, 5425, 5426],
  [3774, 5427, 5428, 5429, 5430, 5431, 5432, 5433, 5434, 5435],
];
export const COUPLE_SKILL_STARTERS: readonly number[] = COUPLE_SKILL_LEVELS.map((l) => l[0]);
export const COUPLE_SKILL_IDS: readonly number[] = COUPLE_SKILL_LEVELS.flat();

/** Seek-board row (`onInitMarriageSekList`). `exp` is the cumulative exp (Flash derives the level), `pop` is always 0. */
export interface MarriageSekRow {
  cid: number;
  name: string;
  classId: number;
  gender: number;
  exp: number;
  online: boolean;
  flag: number;
  content: string;
  addDate: number;
  pop: 0;
}

/** First row of `onInitCharMarriageList` when the caller has an ad. */
export interface MarriageOwnAd {
  type: 0;
  cid: number;
  content: string;
  flag: number;
  addDate: number;
}

/** A proposal involving the caller; `name` is "From|To", the person fields describe the proposer. flag 0 open / 1 accepted / 2 refused. */
export interface MarriageReqRow {
  id: number;
  type: 1;
  cid: number;
  targetId: number;
  name: string;
  classId: number;
  gender: number;
  exp: number;
  online: boolean;
  content: string;
  addDate: number;
  flag: number;
}

export type CharMarriageRow = MarriageOwnAd | MarriageReqRow;

/** `onInitCouple` payload (`null` when single); `time` is "YYYY-MM-DD HH:mm:ss" (UTC+7). */
export interface CouplePush {
  maleId: number;
  maleName: string;
  femaleId: number;
  femaleName: string;
  type: number;
  time: string;
}

export type InitCouplePush = CouplePush | null;

export interface CoupleRankRow {
  maleName: string;
  femaleName: string;
  type: number;
  /** Intimacy of the pair (Flash field name). */
  luxtime: number;
  time: string;
}

export interface CoupleRankReply {
  data: CoupleRankRow[];
  num: number;
  start: number;
}

/** World `onSysEvent` union: 117 hall opened, 118 hall booked, 119 rings exchanged (phase E), 120 seeking ad. Unknown t is ignored. */
export type SysEventPush =
  | { t: 117; c1: number; n1: string; c2: number; n2: string }
  | { t: 118; c: number; n: string; h: number; m: number; l: number }
  | { t: 119; c1: number; n1: string; c2: number; n2: string }
  | { t: 120; c: number; n: string; update: boolean };

export interface BookWeddingArg {
  line: number;
  hour: number;
  minute: number;
  /** 0 open hall, 1 invitation only. */
  flag: number;
}

/** `onInitBookList` row (phase E). */
export interface BookRow {
  cid: number;
  pid: number;
  cname: string;
  pname: string;
  line: number;
  date: number;
  flag: number;
}

/** Client-side player state set by onInitCouple (Flash player.cpid): the partner character id, 0 when single. */
export interface CoupleState {
  cpid: number;
}

export const MARRIAGE_TEXT = {
  seekLevel: `Người chơi cấp độ từ ${MARRIAGE.minLevel} trở lên mới có thể gửi thông tin tìm người yêu`,
  requestLevel: `Người chơi cấp độ từ ${MARRIAGE.minLevel} trở lên mới có thể cầu hôn`,
  sameGender: 'Không thể cầu hôn người cùng giới',
  married: 'Bạn hoặc đối phương đã kết hôn.',
  targetMarried: 'Đối phương đã kết hôn.',
  samePerson: 'Không thể cầu hôn chính mình.',
  notFound: 'Không tìm thấy người chơi này.',
  noMoney: 'Không đủ bạc để đăng tin tìm người yêu (cần 1.000.000 bạc).',
  oncePerTarget: 'Trong 1 ngày chỉ có thể cầu hôn 1 người 1 lần.',
  dailyCap: `Trong 1 ngày chỉ có thể cầu hôn tối đa ${MARRIAGE.dailyRequests} người.`,
  noRequest: 'Lời cầu hôn không tồn tại.',
  proposalGone: 'Lời cầu hôn không còn hiệu lực.',
  single: 'Bạn chưa kết hôn.',
  noCard: 'Bạn không có Thẻ Ly Hôn.',
  cardConfirm: 'Dùng Thẻ Ly Hôn sẽ giải trừ quan hệ hôn nhân với bạn đời, bạn có chắc chắn không?',
  partnerDivorced: 'Bạn đời của bạn đã dùng Thẻ Ly Hôn, quan hệ hôn nhân đã được giải trừ.',
  npcNeedTeam: 'Hãy lập đội 2 người (một nam, một nữ) rồi để đội trưởng đến gặp ta.',
  npcNeedLeader: 'Chỉ đội trưởng mới có thể cầu hôn.',
  npcOffline: 'Đối phương không trực tuyến.',
  npcFar: 'Hai người phải cùng có mặt ở đây.',
  npcBothLevel: `Cả hai người phải đạt cấp ${MARRIAGE.minLevel} trở lên mới có thể kết hôn.`,
  npcSameGender: 'Không thể kết hôn với người cùng giới.',
  npcSent: (name: string): string => `Đã gửi lời cầu hôn đến ${name}, hãy chờ đối phương đồng ý.`,
  npcAsk: (name: string): string => `${name} muốn cùng bạn kết thành phu thê, trước mặt thần tình yêu thề non hẹn biển. Bạn có đồng ý không?`,
  wedded: 'Chúc mừng! Hai người đã chính thức kết hôn. Hãy đến Cupid đặt lễ đường để tổ chức hôn lễ và trao nhẫn.',
  worldWedded: (a: string, b: string): string => `Chúc mừng ${a} và ${b} đã nên duyên vợ chồng, chúc hai người trăm năm hạnh phúc!`,
  seekLine: (name: string, update: boolean): string =>
    update ? `${name} vừa cập nhật thông tin tìm người yêu.` : `${name} đang tìm người yêu, hãy mở bảng Kết Hôn để xem.`,
} as const;

/** Marriage guide shown through onSystemSay lines by the NPC menu. */
export const MARRIAGE_GUIDE: readonly string[] = [
  'Hướng dẫn kết hôn',
  '1. Cách nhanh: một nam một nữ (cấp 30 trở lên, chưa kết hôn) lập đội 2 người, đội trưởng chọn "Kết hôn" tại Cupid; đối phương đồng ý là hai người chính thức kết hôn.',
  '2. Hoặc mở bảng Hảo hữu, nhấn nút Kết Hôn để đăng tin tìm người yêu (tốn 1 triệu bạc) hoặc cầu hôn người đang tìm người yêu; khi đối phương chấp nhận, hai người chính thức kết hôn.',
  '3. Mỗi ngày chỉ cầu hôn tối đa 5 người, mỗi người 1 lần.',
  '4. Vợ chồng nhận kỹ năng phu thê; dùng Thẻ Ly Hôn để giải trừ quan hệ hôn nhân.',
];

/** Day gate of `marriageRequest`: null when allowed, else the refusal. `sent` = this proposer's requests (any age). */
export function dailyRequestCheck(
  sent: readonly { toId: number; addDate: number }[], targetId: number, now: number,
): 'oncePerTarget' | 'dailyCap' | null {
  const dayStart = startOfDayMs(now);
  let today = 0;
  for (const r of sent) {
    if (r.addDate < dayStart) continue;
    if (r.toId === targetId) return 'oncePerTarget';
    today++;
  }
  return today >= MARRIAGE.dailyRequests ? 'dailyCap' : null;
}

/** "YYYY-MM-DD HH:mm:ss" of an epoch-ms timestamp in UTC+7 (Go formatted the server clock the same way). */
export function formatCoupleTime(ms: number): string {
  const d = new Date(ms + VN_OFFSET_MS);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Cutoff of the 30-day request window (used by clients to hide stale rows). */
export const REQUEST_TTL_MS = MARRIAGE.requestTtlDays * DAY_MS;

/** Ring tier label for the couple header. */
export function ringLabel(type: number): string {
  return weddingTier(type)?.label ?? 'Thông Thường';
}
