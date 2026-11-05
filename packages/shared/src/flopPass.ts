// M10 phase F: Lật Bài Truyền Thuyết (flop pass, Flash FlopPassPanel, activity icon 40). Wire shapes, tuning constants, the weekly window
// (Monday 00:00 UTC+7; play until Saturday 00:00, rank awards from Saturday 00:15) and texts. Research: legacy 2026-10-22_09_FLOP_PASS.
// RPCs: initFlopPassData, getFlopPassConf, flopCard(card), flopDelBoss, flopReborn, flopRestart, freshCharFlopPassItemByClient, loadFlopRank,
// takeFlopRankAward. Pushes: onPassCard, onFlopDelBossClient, onFlopRestart, onFreshCharFlopPassItemByClient, onTakeFlopRankAward, onUPP.

import { DAY_MS, startOfDayMs, vnDate } from './dayKey.js';

export const FLOP = {
  ACTIVITY_ID: 40,
  STAGES: 9,
  CARDS: 9,
  MAX_KILLS: 3,
  MIN_LEVEL: 30,
  RANK_SIZE: 10,
  /** conf.ri is keyed rank + 10. */
  RANK_KEY_BASE: 10,
  FLIP_COST: 10,
  REFRESH_COST: 20,
  REBORN_COST: 30,
  RESTART_COST: 50,
  FREE_RESTARTS_DAILY: 20,
  /** 1 = not RenRen (prices not divided, no special-points caption). */
  CONF_FLAG: 1,
  SERVER_ID: 1,
  /** Rank score = passes * SCORE_BASE + (SCORE_BASE - 1 - secondsIntoCycle): ties go to who got there first. */
  SCORE_BASE: 10_000_000,
} as const;

/** Kill-boss tiers: the n-th kill of a stage needs stage >= `stage` and costs `price`. */
export const FLOP_KILL_TIERS: Readonly<Record<number, { stage: number; price: number }>> = {
  1: { stage: 2, price: 20 }, 2: { stage: 3, price: 40 }, 3: { stage: 4, price: 80 },
};

export interface FlopInit {
  cf: number;
  s: number;
  v: number;
}

/** charInfo: p passes, award = rank award taken, ii = chosen reward index per stage, ci = run. */
export interface FlopCharInfo {
  p: number;
  award: boolean;
  ii: Record<string, number>;
  ci: { i: number; s: boolean; db: number; dbd: Record<string, true> };
}

/** conf reward row: {iid, n} as Flash; `name` / `iconCode` are the H5 extension (the client has no item table). */
export interface FlopRewardRow {
  iid: number;
  n: number;
  name?: string;
  iconCode?: string;
}

export interface FlopConf {
  pr: number;
  r: number;
  rb: number;
  db: Record<string, { s: number; p: number }>;
  pi: Record<string, Record<string, FlopRewardRow>>;
  ri: Record<string, Record<string, FlopRewardRow>>;
  start: number;
  end: number;
}

export interface FlopConfReply {
  conf: FlopConf;
  ci: FlopCharInfo;
  v: number;
}

export interface FlopRankRow {
  s: number;
  n: string;
  p: number;
  c: number;
}

export interface FlopRankReply {
  v: number;
  f: boolean;
  info: FlopRankRow[];
}

/** onPassCard(charInfo, card, bossNum). */
export type OnPassCardArgs = [info: FlopCharInfo, card: number, bossNum: number];
/** onFlopDelBossClient(db, dbd). */
export type OnFlopDelBossArgs = [db: number, dbd: Record<string, true>];

export interface FlopWindow {
  /** Monday 00:00 UTC+7 as epoch ms, and the cycle id (YYYYMMDD of that Monday). */
  start: number;
  cycle: number;
  end: number;
  playEnd: number;
  awardStart: number;
}

const AWARD_WINDOW_MS = 2 * DAY_MS;
const AWARD_DELAY_MS = 15 * 60_000;

/** The weekly window containing `ms`. */
export function flopWindow(ms: number): FlopWindow {
  const sinceMonday = (vnDate(ms).weekday + 6) % 7;
  const start = startOfDayMs(ms - sinceMonday * DAY_MS);
  const v = vnDate(start);
  const end = start + 7 * DAY_MS;
  const playEnd = end - AWARD_WINDOW_MS;
  return { start, cycle: v.year * 10_000 + v.month * 100 + v.day, end, playEnd, awardStart: playEnd + AWARD_DELAY_MS };
}

export const flopCanPlay = (w: FlopWindow, ms: number): boolean => ms >= w.start && ms < w.playEnd;
export const flopCanTakeAward = (w: FlopWindow, ms: number): boolean => ms >= w.awardStart && ms < w.end;

/** Rank score of `passes` reached `secondsIntoCycle` seconds after the cycle start. */
export const flopScore = (passes: number, secondsIntoCycle: number): number =>
  passes * FLOP.SCORE_BASE + (FLOP.SCORE_BASE - 1 - Math.min(Math.max(0, Math.floor(secondsIntoCycle)), FLOP.SCORE_BASE - 1));

export const flopPassesOf = (score: number): number => Math.floor(score / FLOP.SCORE_BASE);

export const FLOP_TEXT = {
  TITLE: 'Lật Bài Truyền Thuyết',
  LEVEL: 'Người chơi đạt cấp 30 trở lên mới có thể tham gia Lật Bài Truyền Thuyết.',
  CLOSED: 'Sự kiện Lật Bài Truyền Thuyết hiện không mở.',
  DEAD: 'Bạn đã lật trúng BOSS, hãy Hồi sinh hoặc Làm lại từ đầu.',
  ALIVE: 'Hiện không cần hồi sinh.',
  NO_KILL: 'Ải này không thể diệt boss',
  NO_GOLD: 'Không đủ vàng.',
  BAG_FULL: 'Túi đồ đã đầy, không thể nhận thưởng.',
  AWARD_CLOSED: 'Chưa đến thời gian nhận thưởng xếp hạng.',
  NOT_RANKED: 'Bạn không có trong danh sách nhận thưởng xếp hạng.',
  AWARD_TAKEN: 'Bạn đã nhận thưởng xếp hạng rồi.',
  RULES: [
    '1. Có 9 ải, mỗi ải lật 1 lá bài. Ải thứ L giấu L-1 lá BOSS. Lật trúng bài an toàn sẽ nhận phần thưởng của ải và qua ải tiếp theo.',
    '2. Lật trúng BOSS thì kết thúc lượt, có thể làm lại từ ải 1 hoặc trả phí hồi sinh ở ải hiện tại (BOSS đã diệt vẫn giữ nguyên, các lá còn lại được xáo lại).',
    '3. Làm mới để đổi phần thưởng các ải. Mỗi ải có thể tiêu diệt tối đa 3 BOSS với phí tăng dần.',
    '4. Xếp hạng theo số ải đã vượt trong tuần. Thời gian chơi từ thứ Hai đến hết thứ Sáu, thưởng xếp hạng nhận từ 00:15 thứ Bảy.',
  ],
} as const;
