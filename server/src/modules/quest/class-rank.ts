// Class rank `cl` (M9 phase B, Go quest/class_rank.go + class-rank-promotion.md): finishing a chain's final quest raises the
// rank (never lowers it); the 3-1 turn-ins need the previous rank. Pure tables.

/** Final quest of each promotion chain -> the rank it grants (686-691 one per class). */
export const CLASS_RANK_PROMOTION: Readonly<Record<number, number>> = {
  686: 1, 687: 1, 688: 1, 689: 1, 690: 1, 691: 1, 677: 2, 2471: 3, 4045: 4, 5414: 5,
};

/** Turn-ins gated by the current rank (classRankTurnInRequirement). */
export const CLASS_RANK_TURN_IN: Readonly<Record<number, number>> = {
  143: 1, 287: 1, 639: 1, 640: 1, 643: 1, 644: 1,
  2464: 2, 2465: 2, 2466: 2, 2467: 2, 2468: 2, 2469: 2,
  4038: 3, 4039: 3, 4040: 3, 4041: 3, 4042: 3, 4043: 3,
  5407: 4, 5408: 4, 5409: 4, 5410: 4, 5411: 4, 5412: 4,
};

export const CLASS_RANK_REFUSAL = 'Cấp độ nghề chưa đủ để hoàn thành nhiệm vụ!';

export function turnInBlocked(questId: number, cl: number): boolean {
  const need = CLASS_RANK_TURN_IN[questId];
  return need !== undefined && cl < need;
}

/** The new rank after finishing `questId`, or null when it does not raise the current one. */
export function promotedRank(questId: number, cl: number): number | null {
  const rank = CLASS_RANK_PROMOTION[questId];
  return rank !== undefined && rank > cl ? rank : null;
}

/** Highest rank earned by a set of finished quests (backfill). */
export function rankFromHistory(questIds: Iterable<number>): number {
  let best = 0;
  for (const id of questIds) best = Math.max(best, CLASS_RANK_PROMOTION[id] ?? 0);
  return best;
}
