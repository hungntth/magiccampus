// M10 phase H: Phòng Tu Luyện Ảo Ma (Flash XiulianshiPanel, strip id 81) and Ảo Ma Tháp (NPCs 1135 / 1136). RPCs getHMTXLSData,
// enterPubRoom, endHMTXLRoom(1), getHMTAward, onResetHMTProgress(cid), enterAdvRoom (closed); pushes onHMTXLSData, onHMTXLSMSG(text),
// resetHMTAlert(gold). Pure rules (room shares, night block, tower floors, guardian scaling) shared by the server and the panel.

import { basicExp } from './rewardScale.js';
import { vnDate } from './dayKey.js';

export const HMTXL = {
  SHARE_MINUTES: 10,
  MAX_SHARES: 54, // 9 h
  CLEAN_FROM: 3, // no entry 03:00-08:00 (UTC+7)
  CLEAN_TO: 8,
  EXP_FACTOR: 0.05,
  CRYSTAL_BASE_RATE: 30, // percent per share
  MAX_LISTED: 4,
  FEATURE_ID: 81,
} as const;

export const HMT_TOWER = {
  FLOORS: 400,
  MIN_LEVEL: 60,
  RESET_GOLD: 999,
  MAP: 515,
  EXIT_MAP: 38,
  KEEPER_NPC: 1135,
  PORTER_NPC: 1136,
  TIER_FLOORS: 100,
  MAX_TIER: 4,
  GUARDIAN_NPC_BASE: 1137,
  GUARDIAN_CREATURE_BASE: 763,
  GUARDIAN_COUNT: 6,
  ESCORT_CREATURES: [769, 770, 771, 772, 773, 774] as readonly number[],
  LEVEL_MIN: 60,
  LEVEL_MAX: 200,
  ATTR_MIN: 0.1,
} as const;

/** One trainer line of the room (Go plist entry / nmldata). `iconCode` is a resource code string. */
export interface HmtxlTrainer {
  name: string;
  iconCode: string;
}

/** onHMTXLSData payload. `plist` is keyed "1".."4" (Go); `lev` is omitted until a tower floor is cleared; `awd` while a reward waits. */
export interface HmtxlData {
  pubdata: { plist: Record<string, HmtxlTrainer>; plistadv: Record<string, never>; flagat: 0 };
  now: number;
  lev?: number;
  nmldata?: HmtxlTrainer & { st: number };
  awd?: true;
}

export const HMTXL_TEXT = {
  CLEANING: 'Từ 3 – 8 giờ mỗi ngày là thời gian sắp xếp, không thể tu luyện',
  TRAINING: 'Bạn đang tu luyện.',
  NOT_TRAINING: 'Bạn chưa vào phòng tu luyện.',
  PENDING: 'Hãy nhận thưởng tu luyện trước khi tu luyện lại.',
  NO_AWARD: 'Chưa có phần thưởng tu luyện (cần tu luyện đủ 10 phút).',
  ADV_CLOSED: 'Phòng Tu Luyện Cao Cấp chưa mở. Hãy vào Phòng Tu Luyện Công Cộng.',
  BUSY: 'Hệ thống bận, vui lòng thử lại sau.',
  LOG_ENTER: 'Bắt đầu tu luyện ở Phòng Tu Luyện Công Cộng.',
  LOG_END: (shares: number): string => `Kết thúc tu luyện, tích lũy ${shares} phần thưởng.`,
  LOG_AWARD: (exp: number, crystal: number): string => `Nhận thưởng tu luyện: ${exp} exp, ${crystal} Tinh Hoa Hắc Diệu Thạch.`,
} as const;

/** True during the 03:00-08:00 (UTC+7) cleaning window. */
export function hmtxlCleaning(nowMs: number): boolean {
  const h = vnDate(nowMs).hour;
  return h >= HMTXL.CLEAN_FROM && h < HMTXL.CLEAN_TO;
}

/** Full 10-minute shares of a session started at `startMs` (0 = not training), capped at 54. */
export function hmtxlShares(startMs: number, nowMs: number): number {
  if (startMs <= 0) return 0;
  const n = Math.floor((nowMs - startMs) / (HMTXL.SHARE_MINUTES * 60_000));
  return Math.max(0, Math.min(HMTXL.MAX_SHARES, n));
}

const clampFloor = (f: number): number => Math.max(0, Math.min(HMT_TOWER.FLOORS, Math.trunc(Number.isFinite(f) ? f : 0)));

/** 1 + best / 200 (3x at floor 400). */
export const hmtRewardFactor = (best: number): number => 1 + clampFloor(best) / 200;

/** Percent chance per share of 1 Tinh Hoa Hắc Diệu Thạch: 30 + best / 20 (50 at floor 400). */
export const hmtCrystalRate = (best: number): number => HMTXL.CRYSTAL_BASE_RATE + Math.floor(clampFloor(best) / 20);

/** Exp of `shares` shares at a level (Go: BASIC_GET_EXP[level] x 0.05 x rewardFactor x shares, truncated). */
export function hmtxlExp(level: number, shares: number, best: number): number {
  return Math.trunc(basicExp(level) * HMTXL.EXP_FACTOR * hmtRewardFactor(best) * shares);
}

/** Room tier of the panel (best / 100 capped at 4); undefined while no floor is cleared (the panel shows "Tham gia Ảo Ma Tháp"). */
export function hmtTier(best: number): number | undefined {
  if (best <= 0) return undefined;
  return Math.min(HMT_TOWER.MAX_TIER, Math.floor(best / HMT_TOWER.TIER_FLOORS));
}

/** XLS_PANEL[4] room label from `lev`; XLS_PANEL[8] without it. */
export function hmtxlRoomLabel(lev: number | undefined): string {
  if (lev === undefined) return 'Tham gia Ảo Ma Tháp';
  const n = Math.trunc(lev);
  if (n >= HMT_TOWER.MAX_TIER) return `Phòng tu luyện tầng ${n * 100}~∞`;
  if (n <= 0) return 'Phòng tu luyện tầng 1~99';
  return `Phòng tu luyện tầng ${n * 100}~${n * 100 + 99}`;
}

export const hmtValidFloor = (floor: number): number => Math.max(1, Math.min(HMT_TOWER.FLOORS, Math.trunc(floor) || 1));

/** Floor to enter: highest cleared + 1, 400 once everything is cleared. */
export const hmtNextFloor = (best: number): number => (best >= HMT_TOWER.FLOORS ? HMT_TOWER.FLOORS : best < 0 ? 1 : best + 1);

/** Guardian NPC (1137-1142) and creature (763-768) of a floor: index (n - 1) % 6. */
export const hmtGuardianNpc = (floor: number): number => HMT_TOWER.GUARDIAN_NPC_BASE + ((hmtValidFloor(floor) - 1) % HMT_TOWER.GUARDIAN_COUNT);
export const hmtGuardianCreature = (floor: number): number =>
  HMT_TOWER.GUARDIAN_CREATURE_BASE + ((hmtValidFloor(floor) - 1) % HMT_TOWER.GUARDIAN_COUNT);

/** Level 60 + (n - 1) x 140 / 399 (integer division). */
export const hmtFloorLevel = (floor: number): number =>
  HMT_TOWER.LEVEL_MIN + Math.floor(((hmtValidFloor(floor) - 1) * (HMT_TOWER.LEVEL_MAX - HMT_TOWER.LEVEL_MIN)) / (HMT_TOWER.FLOORS - 1));

/** Guardian attribute factor 0.1 + 0.9 x (n - 1) / 399. */
export const hmtGuardianFactor = (floor: number): number =>
  HMT_TOWER.ATTR_MIN + ((1 - HMT_TOWER.ATTR_MIN) * (hmtValidFloor(floor) - 1)) / (HMT_TOWER.FLOORS - 1);

/** Escorts: floor / 100, at most 3 (and at most the six escort creatures). */
export const hmtEscortCount = (floor: number): number =>
  Math.min(3, HMT_TOWER.ESCORT_CREATURES.length, Math.floor(hmtValidFloor(floor) / HMT_TOWER.TIER_FLOORS));
