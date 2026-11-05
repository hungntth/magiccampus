// Pure settlement plan of one quiz participant (Go rewards.go): exp = BASIC_GET_EXP[level] x points x 0.13, Túi Quà Đố Vui bags by
// the points tier plus 3 / 2 / 1 for ranks 1-3, the rank buff of ranks 1-3, and the onQuestionNote text. Nothing for 0 points.
// The mail texts (sender, title, body) are Go rewards.go / config.go verbatim.

import { QUIZ_END_NOTE, QUIZ_RANK_REWARDS, quizExp, quizGiftCount } from '@mc/shared';

export interface SettlePlan {
  exp: number;
  /** bags from the points tier */
  tierBags: number;
  /** extra bags of ranks 1-3 */
  rankBags: number;
  buffId: number | null;
}

export function settlePlan(points: number, rank: number, level: number): SettlePlan | null {
  if (points <= 0) return null;
  const r = rank >= 0 && rank < QUIZ_RANK_REWARDS.length ? QUIZ_RANK_REWARDS[rank] : null;
  return { exp: quizExp(level, points), tierBags: quizGiftCount(points), rankBags: r?.bags ?? 0, buffId: r?.buffId ?? null };
}

export const totalBags = (p: SettlePlan): number => p.tierBags + p.rankBags;

export interface NoteInput {
  points: number;
  plan: SettlePlan;
  /** display name of the mailed bag item (template name), default Túi Quà Đố Vui */
  bagName?: string;
  rank: number;
  buffName: string | null;
}

/** onQuestionNote text (Go settle): end note, points and exp, bags, rank buff. */
export function settleNote(n: NoteInput): string {
  let note = `${QUIZ_END_NOTE} Bạn đạt ${n.points} điểm, nhận được ${n.plan.exp} kinh nghiệm.`;
  const bags = totalBags(n.plan);
  if (bags > 0) note += ` ${n.bagName ?? 'Túi Quà Đố Vui'} x${bags} đã được gửi qua thư.`; // Go rewards.go: the bags always travel by system mail
  if (n.buffName) note += ` Bạn đứng hạng ${n.rank + 1}, nhận hiệu ứng ${n.buffName} đến kỳ thi sau.`;
  return note;
}

export const QUIZ_MAIL = {
  SENDER: 'Đố Vui Có Thưởng',
  TITLE: 'Phần thưởng Đố Vui Có Thưởng',
} as const;

/** Go rewards.go:109 — points, 1-based rank. */
export const quizMailText = (points: number, rank: number): string =>
  `Chúc mừng bạn đạt ${points} điểm, xếp hạng ${rank + 1} trong Đố Vui Có Thưởng. Phần thưởng đính kèm thư.`;
