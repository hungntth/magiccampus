// Pure daily answer rules (Go application/dailyanswer): the per-day state, the draw verdict (limit / free used / silver price), the
// no-repeat question pick and the selAnswer judgement (invalid / timeout / wrong / right). No Nest, no clock of its own.

import { DAILY_ANSWER, SelAnswerResult, answerCost } from '@mc/shared';
import { optionText, type AnswerRow } from '../gamedata/answer-quiz';

export interface AnswerState {
  day: string;
  n: number;
  qid: number;
  sentAt: number;
  asked: number[];
}

export const freshAnswerState = (day: string): AnswerState => ({ day, n: 0, qid: 0, sentAt: 0, asked: [] });

/** A state of another day starts fresh (lazy midnight rollover). */
export const stateForDay = (st: AnswerState | null, day: string): AnswerState =>
  st && st.day === day ? { ...st, asked: [...st.asked] } : freshAnswerState(day);

export type DrawPlan =
  | { flag: 3 }
  | { flag: 2; noMoney: boolean }
  | { flag: 1; cost: number };

/** getAnswer (paid = false) / getAnswerByMoney (paid = true): limit after 50, free used after 20 (or a paid draw without silver). */
export function planDraw(n: number, paid: boolean, level: number, silver: number): DrawPlan {
  if (n >= DAILY_ANSWER.MAX) return { flag: 3 };
  if (n >= DAILY_ANSWER.FREE && !paid) return { flag: 2, noMoney: false };
  const cost = answerCost(level, n + 1);
  if (cost > silver) return { flag: 2, noMoney: true };
  return { flag: 1, cost };
}

/** Uniformly random usable question that was not asked today; null when the pool is exhausted. */
export function pickDailyQuestion(rows: readonly AnswerRow[], asked: readonly number[], rng: () => number): AnswerRow | null {
  const taken = new Set(asked);
  const pool = rows.filter((r) => !taken.has(r.id));
  return pool.length === 0 ? null : pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** Judges selAnswer against the open question (the caller closes the question whatever the code is). */
export function judgeSelect(st: AnswerState, option: string, now: number, row: AnswerRow | undefined): number {
  if (st.qid === 0) return SelAnswerResult.INVALID;
  if (now > st.sentAt + DAILY_ANSWER.WINDOW_MS + DAILY_ANSWER.GRACE_MS) return SelAnswerResult.TIMEOUT;
  if (!row) return SelAnswerResult.INVALID;
  const key = option.trim().toUpperCase();
  if (!['A', 'B', 'C', 'D'].includes(key) || optionText(row, key) === '') return SelAnswerResult.INVALID;
  return key === row.r ? SelAnswerResult.RIGHT : SelAnswerResult.WRONG;
}
