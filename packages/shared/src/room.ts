// Team rooms ("Chiêu mộ nhóm" recruit board, M14 phase F): limits, the hard-coded recruit catalog, RPC args, replies and pushes
// (legacy Group.as / GroupRecruit*Panel names), plus pure helpers shared by the server rules and the client panels.

import { MAX_LEVEL } from './character.js';
import { startOfDayMs, DAY_MS } from './dayKey.js';

export const ROOM = {
  /** A room is a party: same member cap. */
  memberLimit: 5,
  /** Scheduled time must be 5 min .. 2 h ahead (client MIN_BOOK_INTERVAL / MAX_BOOK_INTERVAL). */
  minWindowMs: 300_000,
  maxWindowMs: 7_200_000,
  /** Same leader cannot create a room again within this window. */
  createCooldownMs: 300_000,
  /** The recruit panel needs this level (GROUP_RECRUIT_PANEL_S[11]). */
  minUiLevel: 30,
  /** H5: a room is dissolved this long after its scheduled time (open question 10; Go never did). */
  expireAfterMs: 1_800_000,
  /** H5: an application waits this long before it lapses. */
  applyTtlMs: 600_000,
  /** H5: pending applications per room. */
  maxApplicants: 20,
} as const;

export type RecruitType = 1 | 2 | 3;

export interface RecruitEntry {
  fid: number;
  type: RecruitType;
  name: string;
  minLevel: number;
}

/** `application/group/catalog.go:12-30` (hard-coded in Go; the Flash client reads its own xmlWill with the same ids). */
export const RECRUIT_CATALOG: readonly RecruitEntry[] = [
  { fid: 1, type: 1, name: 'Mê Huyễn Thụ Động (Dễ)', minLevel: 50 },
  { fid: 2, type: 1, name: 'Đại Mạc Bảo Khố (Dễ)', minLevel: 60 },
  { fid: 3, type: 1, name: 'Lục Dã Bí Cảnh (Dễ)', minLevel: 80 },
  { fid: 4, type: 1, name: 'Liệt Diễm Thâm Uyên (Dễ)', minLevel: 90 },
  { fid: 5, type: 1, name: 'Liệt Diễm Thâm Uyên (Thường)', minLevel: 90 },
  { fid: 6, type: 1, name: 'Liệt Diễm Thâm Uyên (Khó)', minLevel: 90 },
  { fid: 7, type: 1, name: 'Trùng Phản Lang Huyệt (Dễ)', minLevel: 100 },
  { fid: 8, type: 1, name: 'Trùng Phản Lang Huyệt (Thường)', minLevel: 100 },
  { fid: 9, type: 1, name: 'Trùng Phản Lang Huyệt (Khó)', minLevel: 100 },
  { fid: 10, type: 1, name: 'Hấp Huyết Quỷ Lạc Viên (Dễ)', minLevel: 120 },
  { fid: 11, type: 1, name: 'Hấp Huyết Quỷ Lạc Viên (Thường)', minLevel: 120 },
  { fid: 12, type: 1, name: 'Hấp Huyết Quỷ Lạc Viên (Khó)', minLevel: 120 },
  { fid: 13, type: 2, name: 'Vô Ưu Bảo Vệ Chiến', minLevel: 30 },
  { fid: 14, type: 2, name: 'Ác Linh Hiện Thế', minLevel: 50 },
  { fid: 15, type: 3, name: 'Huyền Thưởng Nhiệm Vụ', minLevel: 10 },
  { fid: 16, type: 3, name: 'Trừ Ma Nhiệm Vụ', minLevel: 50 },
  { fid: 17, type: 3, name: 'Thần Tu Nhiệm Vụ', minLevel: 50 },
];

export const RECRUIT_TYPE_NAMES: Readonly<Record<RecruitType, string>> = { 1: 'Phụ bản', 2: 'Hoạt động', 3: 'Nhiệm vụ' };

/** Player-visible room texts (GROUP_RECRUIT_PANEL_S where the client has one). */
export const ROOM_TEXT = {
  LEVEL_UI: 'Người chơi cấp 30 trở lên mới được mời nhóm！', // [11]
  COOLDOWN: 'Thời gian cách nhau giữa 2 lần mời phải trên 5 phút！', // [37]
  EXPIRED: 'Thời gian hẹn trước đã hết, nhóm mời giải tán！', // [35]
  APPLY: (name: string): string => `${name}xin gia nhập nhóm của bạn, hãy mau xử lý！`, // [34]
  JOINED: (name: string): string => `${name}gia nhập nhóm！`, // [30]
  BAD_WILL: 'Thông tin chiêu mộ không hợp lệ',
  BAD_TIME: 'Thời gian hẹn phải sau 5 phút và trong vòng 2 giờ',
  LEVEL_LOW: 'Cấp độ không đủ yêu cầu của nhóm',
  NO_ROOM: 'Nhóm chiêu mộ không tồn tại',
  NOT_IN_ROOM: 'Bạn không ở trong nhóm chiêu mộ',
  NOT_LEADER: 'Chỉ nhóm trưởng mới làm được việc này',
  FULL: 'Nhóm đã đủ người',
  IN_GROUP: 'Bạn đã có nhóm',
  ALREADY_APPLIED: 'Bạn đã xin gia nhập một nhóm khác, hãy chờ trả lời',
  APPLY_FULL: 'Danh sách xin gia nhập của nhóm đã đầy',
  NOT_APPLICANT: 'Người này không còn xin gia nhập nhóm',
  HAS_ROOM: 'Nhóm của bạn đã đăng chiêu mộ rồi',
  NOT_TEAM_LEADER: 'Hãy để nhóm trưởng đăng chiêu mộ',
  NOT_MEMBER: 'Người này không ở trong nhóm',
  SELF: 'Không thể tự thao tác với chính mình',
} as const;

/** `createRoom` argument (`hour` / `minute` are the Vietnam wall-clock time of the planned run). */
export interface CreateRoomArg {
  minLevel: number;
  maxLevel: number;
  fid: number;
  type: number;
  hour: number;
  minute: number;
}

/** `setRoomConfig` argument: every field optional; `time` re-schedules. */
export interface SetRoomConfigArg {
  minLevel?: number;
  maxLevel?: number;
  fid?: number;
  type?: number;
  time?: { hour: number; minute: number };
}

export interface RoomMemberRow {
  cid: number;
  name: string;
  level: number;
  classId: number;
}

/** One open room as listed on the board. `time` = scheduled epoch ms. */
export interface RoomListRow {
  roomNo: number;
  cid: number;
  leaderName: string;
  minLevel: number;
  maxLevel: number;
  fid: number;
  type: number;
  time: number;
  memberNum: number;
}

/** `getRoomList()` result and `onGetRoomList` push. `st` = 1 when the caller is in a room or has a pending application. */
export interface RoomListReply {
  st: 0 | 1;
  d: RoomListRow[];
}

export interface MyRoomView {
  roomNo: number;
  cid: number;
  fid: number;
  type: number;
  time: number;
  minLevel: number;
  maxLevel: number;
  members: RoomMemberRow[];
  /** Pending applicants; only the leader sees them. */
  applyList: RoomMemberRow[];
}

/** `getMyRoom()` result / `onGetMyRoom` push: f 0 none, 1 in a room (d set), 2 pending application (d = that room, empty applyList). */
export interface MyRoomReply {
  f: 0 | 1 | 2;
  d?: MyRoomView;
}

/** `onApplyListChange`: an applicant appeared (`f` true) or was dropped (false). */
export interface ApplyListChangePush {
  f: boolean;
  d: RoomMemberRow;
  leaderId?: number;
}

/** `onSetRoomConfig` (extra keys beyond `fid` / `time` are harmless for the legacy panel). */
export interface SetRoomConfigPush {
  fid: number;
  type: number;
  minLevel: number;
  maxLevel: number;
  time: number;
}

/** `onRoomSay` is positional: `[cid, name, text]`. */
export type RoomSayPush = [number, string, string];

/** One party in `groupListOfMap` (the IMPanel group tab). */
export interface GroupListRow {
  groupId: number;
  cid: number;
  name: string;
  level: number;
  classId: number;
  memberNum: number;
}

export interface GroupListReply {
  success: boolean;
  groups: GroupListRow[];
}

/** `getGroupMemberPosistion(cid)` (sic) reply; the client shows the map name and `floor(x / 10), floor(y / 10)`. */
export interface GroupMemberPos {
  success: boolean;
  map: number;
  x: number;
  y: number;
}

/** The scheduled ad of a room (server state, also shown on the board). */
export interface RoomAd {
  fid: number;
  type: number;
  minLevel: number;
  maxLevel: number;
  scheduledAt: number;
}

export function recruitEntry(fid: number): RecruitEntry | undefined {
  return RECRUIT_CATALOG.find((e) => e.fid === fid);
}

/**
 * Next occurrence of hh:mm (Vietnam time): today when still ahead, else tomorrow, as epoch ms. Null when the clock fields are
 * invalid or the delay falls outside 5 min .. 2 h.
 */
export function nextScheduledAt(now: number, hour: number, minute: number): number | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  let at = startOfDayMs(now) + hour * 3_600_000 + minute * 60_000;
  if (at <= now) at += DAY_MS;
  const delay = at - now;
  return delay >= ROOM.minWindowMs && delay <= ROOM.maxWindowMs ? at : null;
}

export type WillCheck = { ok: true } | { ok: false; note: string };

/** Catalog + level range check of a recruit ad (Go `validateWill`): fid exists, type matches, minLevel >= catalog, actor level >= minLevel. */
export function validateRecruitWill(will: { fid: number; type: number; minLevel: number; maxLevel: number }, actorLevel: number): WillCheck {
  const entry = recruitEntry(will.fid);
  if (!entry || entry.type !== will.type) return { ok: false, note: ROOM_TEXT.BAD_WILL };
  if (!Number.isInteger(will.minLevel) || !Number.isInteger(will.maxLevel)) return { ok: false, note: ROOM_TEXT.BAD_WILL };
  if (will.minLevel < entry.minLevel || will.maxLevel < will.minLevel || will.maxLevel > MAX_LEVEL) return { ok: false, note: ROOM_TEXT.BAD_WILL };
  if (actorLevel < will.minLevel) return { ok: false, note: ROOM_TEXT.LEVEL_LOW };
  return { ok: true };
}

/** True once a room is past its scheduled time plus the grace window. */
export function roomExpired(ad: Pick<RoomAd, 'scheduledAt'>, now: number): boolean {
  return now > ad.scheduledAt + ROOM.expireAfterMs;
}
