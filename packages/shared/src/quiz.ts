// M10 phase G quiz event "Đố Vui Có Thưởng" (activity icon 16, Flash QuestioningPanel): tuning constants, RPC reply shapes, pushes and
// the pure rules (points, gift tiers, exp, schedule in UTC+7). Wire contract: legacy research 2026-10-23_09 part 1.
// RPCs: canQuest, subQuestionApply, subAnswer(opt), useFDJ, useXYX, useXLY(cid), dropQuestion.
// Pushes: updateActivityState {id 16}, onStartQuestion(bool), onShowQuestion {qid, qnum}, onQuestionRank, onQuestionNote(text).

import { DAY_MS, startOfDayMs, vnDate } from './dayKey.js';
import { basicExp } from './rewardScale.js';

export const QUIZ = {
  ACTIVITY_ID: 16,
  MIN_LEVEL: 10,
  QUESTIONS: 30,
  REGISTRATION_MS: 300_000,
  READ_MS: 10_000,
  WRITE_MS: 15_000,
  GRACE_MS: 1_000,
  ITEM_USES: 3,
  RANK_ROWS: 50,
  POINTS_MAX: 20,
  POINTS_MIN: 5,
  EXP_FACTOR: 0.13,
  /** Tuesday / Thursday / Saturday (JS getDay numbering) at 20:00 UTC+7 */
  WEEKDAYS: [2, 4, 6] as readonly number[],
  START_HOUR: 20,
  START_MINUTE: 0,
  /** Túi Quà Đố Vui (unpacked at grant: 1 Tinh Hồn Linh Giáp + 1 Hoàng Kim Lễ) */
  GIFT_BAG: 4875,
  /** rank buff lasts until the next start, at least a day */
  RANK_BUFF_MIN_MS: DAY_MS,
} as const;

/** Whole answer cycle of one question: read + write + grace. */
export const QUIZ_CYCLE_MS = QUIZ.READ_MS + QUIZ.WRITE_MS + QUIZ.GRACE_MS;

export const QUIZ_GIFT_TIERS: readonly { minPoints: number; count: number }[] = [
  { minPoints: 60, count: 1 }, { minPoints: 200, count: 2 }, { minPoints: 350, count: 3 }, { minPoints: 500, count: 4 },
];

/** Ranks 1-3: buff template and extra bags (Hạng Nhất / Nhì / Ba Trả Lời Câu Hỏi). */
export const QUIZ_RANK_REWARDS: readonly { buffId: number; bags: number }[] = [
  { buffId: 2098, bags: 3 }, { buffId: 2097, bags: 2 }, { buffId: 2096, bags: 1 },
];

/** subAnswer reply codes (wrong is -1 here, unlike selAnswer). */
export const QuizAnswerCode = { RIGHT: 1, WRONG: -1, EARLY: 2, LATE: 3, ALREADY: 4 } as const;

export const QUIZ_END_NOTE = 'Cuộc thi trả lời câu hỏi đã kết thúc, hệ thống sẽ phát phần thưởng kinh nghiệm dựa vào số điểm bạn đạt được.';

/** subQuestionApply reply: {apply:true} already registered, {f:true,...} registered, {f:false} closed / level too low. */
export interface QuizApplyReply {
  apply?: true;
  f?: boolean;
  rtime?: number;
  wtime?: number;
  qnum?: number;
  sec?: number;
}

/** Question text and options (the Flash client looked them up in data_tbl_answer by qid; the H5 client has no such table). */
export interface QuizQuestionText {
  t: string;
  a: string;
  b: string;
  c: string;
  d: string;
}

/** onShowQuestion payload: qid of data_tbl_answer, qnum = 0-based index, `q` = H5 extension with the question text (never the key). */
export interface QuizShowPush {
  qid: number;
  qnum: number;
  q?: QuizQuestionText;
}

/** onQuestionRank payload: top rows (cl = class id 1..6) and the receiver's own 0-based order and points. */
export interface QuizRankPush {
  rank: { cid: number; cName: string; pnt: number; cl: number }[];
  self: { order: number; pnt: number };
}

/** useFDJ / useXYX / useXLY reply: `{f:false}` means nothing happens. */
export interface QuizItemReply {
  f: boolean;
  /** useFDJ: the removed wrong option */
  d?: string;
  /** useXLY: the copied option and the subAnswer code of submitting it */
  a?: string;
  aR?: number;
  /** uses so far */
  num?: number;
}

/** Points of a right answer: 5 + round(15 x (1 - elapsed / 15 s)) from the start of the write phase, doubled with Sao May Mắn. */
export function quizPoints(elapsedMs: number, double: boolean): number {
  const elapsed = Math.max(0, Math.min(QUIZ.WRITE_MS, elapsedMs));
  const left = 1 - elapsed / QUIZ.WRITE_MS;
  const pts = QUIZ.POINTS_MIN + Math.round((QUIZ.POINTS_MAX - QUIZ.POINTS_MIN) * left);
  return double ? pts * 2 : pts;
}

/** Túi Quà Đố Vui count for the final points (highest tier reached). */
export function quizGiftCount(points: number): number {
  let n = 0;
  for (const t of QUIZ_GIFT_TIERS) if (points >= t.minPoints && t.count > n) n = t.count;
  return n;
}

/** Settlement exp: BASIC_GET_EXP[level] x points x 0.13 (truncated). */
export function quizExp(level: number, points: number): number {
  return points <= 0 ? 0 : Math.floor(basicExp(level) * points * QUIZ.EXP_FACTOR);
}

/** Start (epoch ms) of the contest on the UTC+7 day containing `ms`, or null when that weekday has none. */
export function quizStartOn(ms: number): number | null {
  const day = startOfDayMs(ms);
  if (!QUIZ.WEEKDAYS.includes(vnDate(day + 3_600_000).weekday)) return null;
  return day + QUIZ.START_HOUR * 3_600_000 + QUIZ.START_MINUTE * 60_000;
}

/** The scheduled registration start whose window [start, start + 300 s) contains `ms`, else null. */
export function quizRegistrationStart(ms: number): number | null {
  const start = quizStartOn(ms);
  return start !== null && ms >= start && ms < start + QUIZ.REGISTRATION_MS ? start : null;
}

/** First scheduled start at or after `ms` (within the next 8 days). */
export function nextQuizStart(ms: number): number {
  for (let i = 0; i <= 7; i++) {
    const start = quizStartOn(ms + i * DAY_MS);
    if (start !== null && start >= ms) return start;
  }
  return ms + DAY_MS;
}

/** Duration (ms) of the rank buff granted at `ms`: until the next scheduled start, at least a day. */
export function quizRankBuffMs(ms: number): number {
  return Math.max(QUIZ.RANK_BUFF_MIN_MS, nextQuizStart(ms) - ms);
}

/** Registered player row used by the pure ranking (points desc, then registration order). */
export interface QuizRankable {
  seq: number;
  points: number;
}

export function quizOrder<T extends QuizRankable>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.points - a.points || a.seq - b.seq);
}

/** Class id the client maps through MAP_ID_BY_CLASS: 1..6, anything else 1. */
export function quizClientClass(classId: number): number {
  return classId >= 1 && classId <= 6 ? classId : 1;
}
