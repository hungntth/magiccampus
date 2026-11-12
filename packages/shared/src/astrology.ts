// Năng Lượng Tự Nhiên (astrology, legacy AstrologicPanel.as, strip id 28) contract + pure rules (M13 phase F). RPCs (Flash names): getAstrologicData() -> null + push
// onGetAstrologicData, refreshStars() -> null + onAstrologicStarsRefresh(refreshLeft, [sid x3]), pickStar(sid) -> null + onAddMoney(s) + onPickStar,
// lookFormula(fid) -> {id, formula}. Cycle = noon to noon UTC+7; the six formulas of a cycle are server-wide and derived from the cycle key.

import { DAY_MS, dayKey, startOfDayMs } from './dayKey.js';

export const ASTRO = {
  FREE_PICKS: 12,
  FREE_REFRESHES: 10,
  CANDIDATES: 3,
  COLLECT_KEEP: 4,
  SID_MIN: 1,
  SID_MAX: 12,
  /** npPnt (Năng Lượng Tự Nhiên, currency 236) per pick. */
  NP_PER_PICK: 12,
  REFRESH_GOLD: 5,
  PICK_GOLD_BASE: 5,
  /** First completion of a formula per player per cycle: `mult`, paying `aid x (mult + 1)` (QA 2026-10-22: 90 -> 990). */
  FIRST_MULT: 10,
  RESET_HOUR: 12,
  RECORD_LENGTH: 12,
  FORMULA_COUNT: 6,
} as const;

export const ASTRO_AWARDS: readonly number[] = [90, 90, 140, 140, 195, 195];

/** Elements 1..12 (ASTROLOGIC_PANEL_U[1..12]). */
export const ASTRO_ELEMENTS: readonly string[] = ['Thổ', 'Diệm', 'Thủy', 'Điện', 'Băng', 'Thánh', 'Ám', 'Lôi', 'Phong', 'Quang', 'Hỏa', 'Sương'];

/** Length of formula `fid` 0..5: 2, 2, 3, 3, 4, 4. */
export const formulaLength = (fid: number): number => Math.floor(fid / 2) + 2;

/** Gold to peek a hidden formula: 180 (fid 0-1), 280 (2-3), 380 (4-5). */
export const lookFormulaCost = (fid: number): number => (fid <= 1 ? 180 : fid <= 3 ? 280 : 380);

/** Gold of the next paid pick. */
export const pickGoldCost = (buyPickCount: number): number => ASTRO.PICK_GOLD_BASE + Math.max(0, buyPickCount);

/** Cycle id (the UTC+7 date of the moment 12 hours before `ms`): changes every day at 12:00 UTC+7. */
export const cycleKey = (ms: number): string => dayKey(ms - ASTRO.RESET_HOUR * 3_600_000);

/** Epoch ms when the cycle containing `ms` ends. */
export const cycleEndMs = (ms: number): number => startOfDayMs(ms - ASTRO.RESET_HOUR * 3_600_000) + DAY_MS + ASTRO.RESET_HOUR * 3_600_000;

function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The six formulas of a cycle (distinct element ids inside each, deterministic from the key; the same on every server instance). */
export function cycleFormulas(cycle: string): number[][] {
  const rnd = mulberry32(seedOf(`astrology:${cycle}`));
  const out: number[][] = [];
  for (let fid = 0; fid < ASTRO.FORMULA_COUNT; fid++) {
    const pool = Array.from({ length: ASTRO.SID_MAX }, (_, i) => i + ASTRO.SID_MIN);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    out.push(pool.slice(0, formulaLength(fid)));
  }
  return out;
}

/** The completed formula index when the tail of `collected` equals a formula in order (longest wins), else -1. */
export function matchFormula(formulas: readonly (readonly number[])[], collected: readonly number[]): number {
  for (let fid = formulas.length - 1; fid >= 0; fid--) {
    const f = formulas[fid];
    if (f.length === 0 || collected.length < f.length) continue;
    const tail = collected.slice(collected.length - f.length);
    if (f.every((s, i) => tail[i] === s)) return fid;
  }
  return -1;
}

/** Npnt paid by a completion: `aid` for a repeat, `aid x (FIRST_MULT + 1)` the first time in the cycle. */
export const formulaAmount = (aid: number, mult: number): number => (mult === 1 ? aid : aid * (mult + 1));

// --- Wire types ---

export interface AstrologicRecord {
  /** formula index as a string; the client renders row `int(aid) + 1` */
  aid: string;
  cid: number;
  name: string;
}

export interface AstrologicData {
  award: number[];
  award_record: AstrologicRecord[];
  buyPickCount: number;
  /** six slots, null while hidden */
  formula: (number[] | null)[];
  pickCount: number;
  refreshCount: number;
  starsNow: number[];
  starsToPick: number[];
}

export interface PickStarResult {
  aid: number;
  fid: string;
  formula: number[];
  mult: number;
  stars: number[];
}

export interface PickStarPush {
  buyTimes: number;
  leftTimes: number;
  newStars: number[];
  refreshTimes: number;
  sid: number;
  result?: PickStarResult;
}

export interface LookFormulaReply {
  id: number;
  formula: number[];
}

export const ASTRO_TEXT = {
  TITLE: 'Năng Lượng Tự Nhiên',
  TODAY: 'Công Thức Nguyên Tố hôm nay',
  RECORD: 'Kỷ Lục',
  REFRESH: 'Làm Mới',
  PICK: 'Thu thập',
  HELP: 'Cách Chơi',
  FREE_REFRESH: (left: number): string => `Miễn phí Làm Mới: ${left}/${ASTRO.FREE_REFRESHES}`,
  FREE_PICK: (left: number): string => `Miễn phí Thu thập: ${left}/${ASTRO.FREE_PICKS}`,
  PAID_REFRESH: `Làm Mới mất: ${ASTRO.REFRESH_GOLD} vàng`,
  PAID_PICK: (gold: number): string => `Thu thập sẽ Tiêu hao:${gold} vàng`,
  CONFIRM_PICK: (gold: number): string => `Thu thập sẽ tiêu phí ${gold} vàng, Xác nhận?`,
  CONFIRM_REFRESH: `Làm Mới sẽ tiêu phí ${ASTRO.REFRESH_GOLD} vàng, Xác nhận?`,
  CONFIRM_LOOK: (gold: number): string => `Nhìn Trộm công thức sẽ tiêu phí ${gold} vàng, Xác nhận?`,
  LOOK: 'Xem',
  CHOOSE: 'Chọn Nguyên Tố cần thu thập',
  AWARD: (n: number): string => `Thưởng ${n} điểm Năng Lượng Tự Nhiên`,
  FIRST_BONUS: 'Hoàn thành c.thức bất kỳ đầu tiên sẽ x10 ph.thưởng!',
  KEEP_NOTE: 'Thu thập Ng.Tố 5 thì Ng.Tố 1 sẽ tự mất',
  GAIN: (n: number): string => `Nhận:    ${n} Năng Lượng Tự Nhiên`,
  HELP_BODY:
    'Thu thập nguyên tố theo công thức thứ tự sẽ nhận thưởng, cứ 12h trưa mỗi ngày sẽ làm mới công thức. Mỗi chu kỳ (từ 12h trưa hôm nay đến 12h trưa ngày mai) có 10 lượt làm mới và 12 lượt thu thập miễn phí, muốn thêm lượt phải dùng vàng. Lần đầu hoàn thành một công thức nhận x10 phần thưởng.',
  RECORD_ROW: (row: number, name: string): string => `Hàng ${row}: ${name}`,
  ANNOUNCE: (name: string, row: number, amount: number): string => `${name} đã hoàn thành Công Thức Nguyên Tố hàng ${row}, nhận được ${amount} Năng Lượng Tự Nhiên, thật là may mắn!`,
  NO_GOLD: 'Vàng không đủ.',
  BAD_STAR: 'Nguyên tố đã thay đổi, hãy chọn lại.',
  BAD_FORMULA: 'Công thức không hợp lệ.',
} as const;
