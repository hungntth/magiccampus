// Pure TXKC state rules (Go application/txkc state.go / progress.go): the season (calendar month, UTC+7), the day / week roll-overs
// of a stored state, the panel period, task progress from diary counts and the onTXKCGetData payload.

import {
  daysInMonth, dayKey, monthKey, startOfMonthMs, txkcLevel, txkcLevelExp, txkcTaskWire, vnDate, weekKey, TXKC, TXKC_DAILY_TASKS,
  TXKC_WEEKLY_TASKS, type TxkcData, type TxkcTaskDef,
} from '@mc/shared';
import type { TxkcDoc } from './training-doc';

/** Diary counts of a period: per diary task id, plus the activity points earned. */
export interface TxkcCounts {
  tasks: Readonly<Record<string, number>>;
  vitality: number;
}

export const NO_COUNTS: TxkcCounts = { tasks: {}, vitality: 0 };

export interface TxkcPeriod {
  season: string;
  day: string;
  week: string; // Monday of the week
  start: string;
  end: string;
  days: number; // days left in the season, today included
}

export function txkcPeriod(now: number): TxkcPeriod {
  const v = vnDate(now);
  const dim = daysInMonth(v.year, v.month);
  const first = dayKey(startOfMonthMs(now));
  return { season: monthKey(now), day: dayKey(now), week: weekKey(now), start: first, end: `${first.slice(0, 8)}${String(dim).padStart(2, '0')}`, days: dim - v.day + 1 };
}

export const newTxkc = (p: TxkcPeriod): TxkcDoc => ({
  season: p.season, exp: 0, adv: 0, awd1: 0, awd2: 0, day: p.day, dopen: 0, dc: {}, sp: 0, week: p.week, wc: {},
});

/** Stored state (or none) rolled to the period: a new season wipes everything, a new day closes the dailies, a new week clears the claims. */
export function rollTxkc(stored: TxkcDoc | null, p: TxkcPeriod): TxkcDoc {
  if (!stored || stored.season !== p.season) return newTxkc(p);
  const s: TxkcDoc = { ...stored, dc: { ...stored.dc }, wc: { ...stored.wc } };
  if (s.day !== p.day) Object.assign(s, { day: p.day, dopen: 0, dc: {}, sp: 0 });
  if (s.week !== p.week) Object.assign(s, { week: p.week, wc: {} });
  return s;
}

/** Adds course exp (capped at 70 levels). */
export const addTxkcExp = (s: TxkcDoc, n: number): void => {
  s.exp = Math.min(TXKC.MAX_LEVEL * TXKC.LEVEL_EXP, s.exp + n);
};

export function taskProgress(c: TxkcCounts, t: TxkcTaskDef): number {
  return t.vitality ? c.vitality : t.diary.reduce((n, id) => n + (c.tasks[String(id)] ?? 0), 0);
}

export const taskDone = (c: TxkcCounts, t: TxkcTaskDef): boolean => taskProgress(c, t) >= t.need;

export const taskDef = (defs: readonly TxkcTaskDef[], id: number): TxkcTaskDef | undefined => defs.find((t) => t.id === id);

function wire(c: TxkcCounts, defs: readonly TxkcTaskDef[], claimed: Readonly<Record<string, 1>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of defs) out[String(t.id)] = txkcTaskWire(taskProgress(c, t), t.need, claimed[String(t.id)] === 1);
  return out;
}

/** onTXKCGetData payload; `dd` / `spIndex` only once the daily tasks are opened. */
export function buildTxkcData(s: TxkcDoc, p: TxkcPeriod, today: TxkcCounts, week: TxkcCounts): TxkcData {
  const flag: TxkcData['flag'] = {
    lev: txkcLevel(s.exp), exp: txkcLevelExp(s.exp), p: s.adv, awd1: s.awd1, awd2: s.awd2, wd: wire(week, TXKC_WEEKLY_TASKS, s.wc),
  };
  if (s.dopen === 1) {
    flag.dd = wire(today, TXKC_DAILY_TASKS, s.dc);
    flag.spIndex = s.sp;
  }
  return { start: p.start, end: p.end, days: p.days, flag };
}
