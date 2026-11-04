// Awakening (Giác Ngộ / Thức Tỉnh) rules, pure. Level-up is a gacha on data_tbl_awakening[level + 1] (item 4913 x item_num + silver,
// success rate + pity); the stat is the SUM of rows 1..level (client AwakenPanel; Go applied only the current row: plan §1.4).
// Go-invented constants (kept, marked in shared AWAKEN): pity +1% per miss, auto-buy 10 unbound gold per missing item.
// Talent points: addAwakenPoint / reduceAwakenPoint follow the Go validation; talent effects are not applied to stats (Go neither).

import { AWAKEN, type PropLine } from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { AwakenRow, AwakenSkillRow } from '../gamedata/feature-data';
import type { AwakenState } from './feature-state';
import type { Rng } from '../forge/craft-rules';

/** Refusal text, or null when the next awakening may be attempted. */
export function awakenGate(playerLevel: number, state: AwakenState, row: AwakenRow | undefined): string | null {
  if (state.level >= AWAKEN.EDGE) return '7 giác quan đều đã giác ngộ';
  if (!row) return 'Thiếu dữ liệu cấp giác ngộ';
  if (playerLevel < row.reqLevel) return `Cần đạt cấp ${row.reqLevel} để giác ngộ`;
  return null;
}

export type AwakenPlan =
  | { kind: 'needGold'; gold: number }
  | { kind: 'pay'; takeItems: number; boughtItems: number; gold: number };

/** Items to take from the bag and, with autoBuy, the missing ones paid in unbound gold; without autoBuy a short bag asks for gold. */
export function planAwakenCost(row: AwakenRow, itemHave: number, autoBuy: boolean): AwakenPlan {
  const missing = Math.max(0, row.itemNum - itemHave);
  if (missing > 0 && !autoBuy) return { kind: 'needGold', gold: missing * AWAKEN.BUY_GOLD_PER_ITEM };
  return { kind: 'pay', takeItems: row.itemNum - missing, boughtItems: missing, gold: missing * AWAKEN.BUY_GOLD_PER_ITEM };
}

/** One Bernoulli roll against `rate + pity` percent (rng in [0, 1)). */
export function awakenRoll(rng: Rng, rate: number, pity: number): boolean {
  return rng() * 100 < rate + pity;
}

export function awakenHit(state: AwakenState, row: AwakenRow): AwakenState {
  return { ...state, level: row.level, point: state.point + row.points, awakenAdd: 0 };
}

export function awakenMiss(state: AwakenState): AwakenState {
  return { ...state, awakenAdd: state.awakenAdd + AWAKEN.PITY_STEP };
}

/** Sum of the rows 1..level per prop id (the client's overview). */
export function awakenTotals(level: number, rowOf: (level: number) => AwakenRow | undefined): PropLine[] {
  const sum = new Map<number, number>();
  for (let l = 1; l <= level; l++) {
    for (const p of rowOf(l)?.props ?? []) sum.set(p.t, (sum.get(p.t) ?? 0) + p.v);
  }
  return [...sum.entries()].map(([t, v]) => ({ t, v: Math.round(v * 1e6) / 1e6 })).sort((a, b) => a.t - b.t);
}

export function awakenBonuses(level: number, rowOf: (level: number) => AwakenRow | undefined): Bonuses {
  const b = emptyBonuses();
  for (let l = 1; l <= level; l++) {
    for (const p of rowOf(l)?.props ?? []) addProp(b, BUFF_PROP, p.t, p.v, false);
  }
  return b;
}

export type PointResult = { ok: true; state: AwakenState } | { ok: false; note: string };

/** addAwakenPoint: needs the cost in free points, a level below max and enough points already spent (Go order). */
export function addSkillPoint(state: AwakenState, skill: AwakenSkillRow): PointResult {
  if (state.point < skill.cost) return { ok: false, note: 'Điểm giác ngộ không đủ, không thể học' };
  if ((state.pointDict[skill.code] ?? 0) >= skill.max) return { ok: false, note: 'Thiên phú này đã đạt cấp cao nhất' };
  if (state.pointUsed < skill.req) return { ok: false, note: `Cần ${skill.req} điểm đã phân phối` };
  return {
    ok: true,
    state: {
      ...state, point: state.point - skill.cost, pointUsed: state.pointUsed + skill.cost,
      pointDict: { ...state.pointDict, [skill.code]: (state.pointDict[skill.code] ?? 0) + 1 },
    },
  };
}

/** reduceAwakenPoint: refunds one level of a learned talent. */
export function reduceSkillPoint(state: AwakenState, skill: AwakenSkillRow): PointResult {
  const lv = state.pointDict[skill.code] ?? 0;
  if (lv <= 0) return { ok: false, note: 'Chưa học được thiên phú này' };
  const dict = { ...state.pointDict };
  if (lv - 1 <= 0) delete dict[skill.code];
  else dict[skill.code] = lv - 1;
  return { ok: true, state: { ...state, point: state.point + skill.cost, pointUsed: Math.max(0, state.pointUsed - skill.cost), pointDict: dict } };
}
