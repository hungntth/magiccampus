// Auto-task ("Tự động hoàn thành phụ bản", Flash AutoTaskPanel / AutoTaskBox): the GamePredef.TASK rows 1-16, the EXP_SWEEP /
// MONEY_SWEEP multipliers, the payload of getAutoTaskData / onAutoTaskStart and the pure quote helpers (gold quote, free runs,
// reward) shared by the server and the panel. Pure: usable in Node and the browser.

import { basicExp, basicMoney } from './rewardScale.js';

/** One GamePredef.TASK row; `time` is the length of one battle in ms. */
export interface AutoTaskDef {
  name: string;
  time: number;
  battleCount: number;
  money: number; // silver (money) charged at start
  gold: number; // quick finish price of the whole task
  dungeon: string; // DungeonDef.key
  difficulty: number; // 1 Dễ / 2 Thường / 3 Khó within the panel group
}

const BATTLE_MS = 180_000;
const row = (name: string, battleCount: number, money: number, gold: number, dungeon: string, difficulty: number): AutoTaskDef => ({
  name, time: BATTLE_MS, battleCount, money, gold, dungeon, difficulty,
});

export const AUTO_TASKS: Readonly<Record<number, AutoTaskDef>> = {
  1: row('Mê Huyễn Động', 6, 200000, 9, 'mehuyen', 1),
  2: row('Kho Báu Đại Mạc', 6, 200000, 9, 'khobau', 1),
  3: row('Lục Tiên Cảnh', 6, 200000, 9, 'luctien', 1),
  4: row('Liệt Diễm Thâm Uyên (Dễ)', 7, 150000, 10, 'lietdiem', 1),
  5: row('Liệt Diễm Thâm Uyên (Thường)', 7, 200000, 10, 'lietdiem', 2),
  6: row('Liệt Diễm Thâm Uyên (Khó)', 8, 250000, 12, 'lietdiem', 3),
  7: row('Trở Về Lang Huyệt (Dễ)', 7, 150000, 10, 'langhuyet', 1),
  8: row('Trở Về Lang Huyệt (Thường)', 7, 200000, 10, 'langhuyet', 2),
  9: row('Trở Về Lang Huyệt (Khó)', 8, 250000, 12, 'langhuyet', 3),
  10: row('Quỷ Hút Máu', 7, 150000, 10, 'quyhutmau', 1),
  11: row('Quỷ Hút Máu (Thường)', 7, 200000, 10, 'quyhutmau', 2),
  12: row('Quỷ Hút Máu (Khó)', 8, 200000, 12, 'quyhutmau', 3),
  13: row('Thế Giới Số (Dễ)', 7, 100000, 10, 'thegioiso', 1),
  14: row('Thế Giới Số (Thường)', 7, 150000, 10, 'thegioiso', 2),
  15: row('Thế Giới Số (Khó)', 8, 200000, 12, 'thegioiso', 3),
  16: row('Thám Hiểm Di Tích', 8, 200000, 12, 'thamhiem', 1),
};

/** Item 3630 Sách Tự Động Hoàn Thành Phụ Bản: one per run once the free runs are used. */
export const AUTO_TASK_BOOK = 3630;

/** The eight panel rows (base tid); rows 4 / 7 / 10 / 13 own tid..tid+2 (Dễ / Thường / Khó combo, AutoTaskBox `dif`). */
export const AUTO_TASK_ROWS: readonly number[] = [1, 2, 3, 4, 7, 10, 13, 16];
export const AUTO_TASK_COMBO_BASES: readonly number[] = [4, 7, 10, 13];
export const AUTO_TASK_DIFFICULTY_NAMES: readonly string[] = ['Dễ', 'Thường', 'Khó'];

/** Base tid of the difficulty group a task belongs to (every other tid is its own group). */
export function autoTaskGroupBase(tid: number): number {
  for (const base of AUTO_TASK_COMBO_BASES) if (tid >= base && tid <= base + 2) return base;
  return tid;
}

/** Free runs per day (TASKSWEEPPANEL_U[21]): level 100-119 one, 120+ two. */
export function autoTaskFreeRuns(level: number): number {
  if (level >= 120) return 2;
  if (level >= 100) return 1;
  return 0;
}

export const autoTaskDuration = (t: AutoTaskDef): number => t.time * t.battleCount;

/** Go QuickGold: `ceil(gold × remaining / total)` (at least 1 while time remains, full price for a queued task). */
export function autoTaskQuickGold(t: AutoTaskDef, remainingMs: number): number {
  const total = autoTaskDuration(t);
  if (total <= 0 || remainingMs >= total) return t.gold;
  if (remainingMs <= 0) return 0;
  return Math.max(1, Math.ceil((t.gold * remainingMs) / total));
}

/** GamePredef.EXP_SWEEP: exp = BASIC_GET_EXP[level] × factor per battle (task 16 has no client row: 2.5). */
export const AUTO_TASK_EXP_FACTOR: Readonly<Record<number, number>> = {
  1: 1.5, 2: 2.8, 3: 2.4, 4: 1.8, 5: 2.28, 6: 2.5, 7: 2.1, 8: 2.6, 9: 2.88, 10: 2.14, 11: 2.85, 12: 3.12, 13: 2.14, 14: 2.85, 15: 3.12,
};
export const AUTO_TASK_DEFAULT_EXP_FACTOR = 2.5;
/** GamePredef.MONEY_SWEEP: bound silver = BASIC_GET_MONEY[level] × 0.3 for battles 1-5 of tasks 10-15 only. */
export const AUTO_TASK_MONEY_FACTOR = 0.3;
export const AUTO_TASK_MONEY_BATTLES = 5;

/** Sweep reward of `battles` finished battles (the per-battle rounded sums of Go autotask.Reward). */
export function autoTaskReward(tid: number, battles: number, level: number): { exp: number; moneyBind: number } {
  const factor = AUTO_TASK_EXP_FACTOR[tid] ?? AUTO_TASK_DEFAULT_EXP_FACTOR;
  const hasMoney = tid >= 10 && tid <= 15;
  let exp = 0;
  let moneyBind = 0;
  for (let i = 1; i <= battles; i++) {
    exp += Math.round(basicExp(level) * factor);
    if (hasMoney && i <= AUTO_TASK_MONEY_BATTLES) moneyBind += Math.round(basicMoney(level) * AUTO_TASK_MONEY_FACTOR);
  }
  return { exp, moneyBind };
}

/**
 * getAutoTaskData reply and onAutoTaskStart push. The panel reads `data.data` (running task, `{}` when idle), `data.queue` and
 * `data.finish`, so all three stay nested under `data`. `ct` is the server clock in ms (countdowns run from `st` against it).
 */
export interface AutoTaskPayload {
  todayNum: number; // free runs a day for the level
  useNum: number; // free runs used today
  data: {
    data: { id?: number; st?: number };
    queue: Record<string, 1>;
    finish: Record<string, number>;
  };
  ct: number;
}
