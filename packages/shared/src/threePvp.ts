// Chiến Trường Dũng Sĩ (3v3 room PvP, M14 phase H): constants, the room wire shapes and the pushes (legacy Flash names: checkPVPLine,
// initPVPRoom, onPushPVPQueue, onRefreshPVPPoint, ...). Pure rules (pairing, points, medals, schedule) live in threePvpRules.ts.

import { MAX_LEVEL } from './character.js';

export const THREE_PVP = {
  MAP_ID: 73,
  /** Entry teleport (initPVPRoom) and the fallback exit when no origin is remembered. */
  ENTRY: { x: 2600, y: 760 },
  EXIT_FALLBACK: { map: 38, x: 2090, y: 890 },
  MIN_LEVEL: 50,
  MAX_LEVEL,
  SEATS: 3,
  ACTIVITY_ID: 22,
  NPC_ID: 1860,
  SHOP_ID: 85,
  SHOP_SLOT: 4354,
  /** Shop price type 7 (CURRENCY_GROUPPVP_MEDAL) pays in currency 225 `threePvpPnt`. */
  SHOP_PRICE_TYPE: 7,
  CURRENCY_ID: 225,
  EVENT: 'threepvp',
  EVENT_MEDAL: 'threepvp_medal',
  EVENT_TITLE: 'threepvp_title',
  /** Weekly window: Friday (JS weekday 5) 19:00-22:00 UTC+7; announcements at 18:30 and 18:55. */
  WEEKDAY: 5,
  START_MIN: 19 * 60,
  END_MIN: 22 * 60,
  ANNOUNCE_MIN: [18 * 60 + 30, 18 * 60 + 55],
  /** After the end: wait for the last arena battle, at most this long, then settle. */
  SETTLE_CAP_MS: 5 * 60_000,
  /** Map 73 is emptied this long after the settlement. */
  SETTLE_GRACE_MS: 60_000,
  GM_DEFAULT_MINUTES: 15,
  GM_MIN_MINUTES: 5,
  GM_MAX_MINUTES: 180,
  MATCH_INTERVAL_MS: 5_000,
  TICK_MS: 1_000,
  WIN_REST_MS: 20_000,
  LOSS_REST_MS: 15_000,
  /** Points by room size at the start of the match (index = size - 1). */
  WIN_POINTS: [3, 6, 10],
  LOSS_POINTS: [1, 2, 3],
  MEDAL_PER_POINT: 10,
  /** Settlement pays players ranked within this many places. */
  MAX_RANKED: 1000,
  RANK_BONUS: [
    { upTo: 1, bonus: 500 }, { upTo: 3, bonus: 300 }, { upTo: 10, bonus: 200 }, { upTo: 50, bonus: 100 },
  ],
  /** Losses in a row from which a room gets the consolation buff 2435, then 2436 .. 2439 (3 h each). */
  STREAK_START: 5,
  STREAK_BUFFS: [2435, 2436, 2437, 2438, 2439],
  STREAK_BUFF_SECONDS: 3 * 3600,
  /** NPC 1860: lifetime medals -> title (30 days, once per UTC+7 month). */
  TITLES: [
    { titleId: 220, medals: 1200 }, { titleId: 221, medals: 2400 }, { titleId: 222, medals: 4000 }, { titleId: 223, medals: 6000 },
    { titleId: 224, medals: 10000 }, { titleId: 225, medals: 16000 }, { titleId: 226, medals: 24000 }, { titleId: 227, medals: 32000 },
    { titleId: 228, medals: 40000 }, { titleId: 229, medals: 50000 },
  ],
  TITLE_DAYS: 30,
  TOP_N: 20,
  INVITE_MAX: 20,
  PASS_MAX_DIGITS: 6,
  /** Delay of the pushes that must arrive after the RPC reply (the client panel has to be visible first). */
  LATER_MS: 400,
} as const;

export const THREE_PVP_TEXT = {
  CLOSED: 'Chiến Trường Dũng Sĩ hiện chưa mở cửa.',
  LEVEL: 'Cần đạt cấp 50 mới có thể tham gia Chiến Trường Dũng Sĩ.',
  NOT_ON_MAP: 'Hãy vào Chiến Trường Dũng Sĩ trước.',
  IN_ROOM: 'Bạn đã ở trong một phòng.',
  NOT_IN_ROOM: 'Bạn không ở trong phòng nào.',
  NO_ROOM: 'Phòng không tồn tại.',
  FULL: 'Phòng đã đủ người.',
  QUEUED: 'Phòng đang sắp xếp thi đấu, không thể gia nhập.',
  QUEUED_ACT: 'Phòng đang sắp xếp thi đấu, không thể thao tác.',
  LEVEL_RANGE: 'Cấp độ không phù hợp yêu cầu, không thể gia nhập',
  BAD_PASS: 'Sai mật mã',
  NOT_LEADER: 'Chỉ trưởng phòng mới làm được việc này.',
  BAD_PASS_FORMAT: 'Mật mã chỉ gồm số, tối đa 6 chữ số.',
  INVITE_DECLINED: 'Lời mời bị từ chối %>_<%',
  MANUAL_PVP: 'Không thể khiêu chiến tại Chiến Trường Dũng Sĩ, hệ thống sẽ tự sắp xếp đối thủ.',
  FIGHTING: 'Không thể thao tác khi đang thi đấu.',
  PARTY_LEFT: 'Đã rời nhóm để vào Chiến Trường Dũng Sĩ.',
  REST: (s: number): string => `Đội của bạn nghỉ ${s} giây…`,
  ANNOUNCE: (min: number): string => `Chiến Trường Dũng Sĩ sẽ mở cửa sau ${min} phút nữa, các dũng sĩ cấp 50 trở lên hãy chuẩn bị!`,
  OPENED: 'Chiến Trường Dũng Sĩ đã mở cửa! Các dũng sĩ cấp 50 trở lên hãy nhanh chóng tham gia.',
  SETTLING: 'Chiến Trường Dũng Sĩ đã kết thúc, đang tổng kết thành tích.',
} as const;

export interface PvpRoomMember {
  cid: number;
  name: string;
  level: number;
  /** 1 = ready. */
  state: number;
}

/** One room as the client reads it: seats "1" (leader) .. "3"; empty seats are absent. */
export interface PvpRoom {
  id: number;
  leaderId: number;
  pass: string;
  limit: { lev: { min: number; max: number } };
  memberList: Record<string, PvpRoomMember>;
}

/** `initPVPRoom` / `leftPVPGroup` result: every room by id. */
export type PvpRoomMap = Record<string, PvpRoom>;

/** `onPushPVPQueue`: type 1 = a member's ready flag (index = seat 2 or 3, never 1), type 2 = the room queue (state 2 queued, 0 cancelled). */
export type PvpQueuePush = { type: 1; index: number; cid: number; state: number } | { type: 2; state: number };

/** `onUpdatePVPRoom`. */
export type UpdatePvpRoomPush =
  | { type: 'level'; roomId: number; lev: { min: number; max: number } }
  | { type: 'pass'; roomId: number; pass: string };

/** `onRefreshPVPPoint` after each counted match. */
export interface RefreshPvpPointPush {
  type: 'PVPResult';
  score: number;
  oldScore: number;
  isWinner: boolean;
}

/** `onUpdateMyPoint`: own rank (0 = unranked) and total points of the run. */
export interface UpdateMyPointPush {
  rank: number;
  point: number;
}

/** `inviteByLeader` (quickInvite): `index` is the room id. */
export interface InviteByLeaderPush {
  cid: number;
  index: number;
  name: string;
}

/** `showPVPGroupResultAlert` at settlement: `point` and `pvpPoint` both carry the medals paid. */
export interface PvpGroupResultAlert {
  rank: number;
  point: number;
  pvpPoint: number;
}

/** `getLastPVPRank` row. */
export interface LastPvpRankRow {
  name: string;
  rank: number;
  pnt: number;
}

/** `updateActivityState` flags of icon 22. */
export const THREE_PVP_FLAG = { CLOSED: 0, FIGHTING: 2 } as const;
