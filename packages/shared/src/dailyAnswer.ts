// M10 phase G daily answer (Flash AnswerPanel, NPC 9001 "Sứ Giả Đố Vui"): constants, the onGetAnswer push shape, the selAnswer
// result codes and the pure price / reward formulas. RPCs: getAnswer, getAnswerByMoney (null reply, the answer is the push
// onGetAnswer), selAnswer(opt) -> code. Rules from Go application/dailyanswer/config.go.

import { basicExp, basicMoney } from './rewardScale.js';

export const DAILY_ANSWER = {
  NPC_ID: 9001,
  /** questions 1..20 of a day are free */
  FREE: 20,
  /** questions drawn per day (the open one counts) */
  MAX: 50,
  MONEY_FACTOR: 0.083,
  /** right answer: exp = BASIC_GET_EXP[level] x 0.5 */
  EXP_FACTOR: 0.5,
  WINDOW_MS: 15_000,
  GRACE_MS: 2_000,
} as const;

/** onGetAnswer flag: 1 = a question in `d`, 2 = free answers used up (or a paid draw without silver), 3 = daily limit. */
export interface GetAnswerPush {
  f: 1 | 2 | 3;
  /** questions drawn today, including the open one */
  n: number;
  d?: { t: string; a: string; b: string; c: string; d: string };
}

/** selAnswer reply codes. */
export const SelAnswerResult = { RIGHT: 1, WRONG: 2, INVALID: 3, TIMEOUT: 4 } as const;

/** Silver (money) price of the k-th question of the day: free up to 20, then round(BASIC_GET_MONEY x 0.083 x ceil((k - 20) / 10)). */
export function answerCost(level: number, k: number): number {
  if (k <= DAILY_ANSWER.FREE) return 0;
  return Math.round(basicMoney(level) * DAILY_ANSWER.MONEY_FACTOR * Math.ceil((k - DAILY_ANSWER.FREE) / 10));
}

/** Exp of one right answer (Go int64 truncation of BASIC_GET_EXP x 0.5). */
export function answerExp(level: number): number {
  return Math.floor(basicExp(level) * DAILY_ANSWER.EXP_FACTOR);
}
