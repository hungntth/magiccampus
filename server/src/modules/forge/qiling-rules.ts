// Pure Ky Linh / Trung Chu rules (legacy domain/item/qiling*.go, application/item/qiling.go): the three-line roll with distinct props
// from the slot plan, value tiers over [max/10, max], the value-only reroll Trung Chu uses, the stone plan and the stat bonus of the
// worn lines (set bonus by full lines). Caps and tiers are Go-invented (tables in @mc/shared). No Nest / Mongo here.

import {
  QILING_COST, QILING_LINE_COUNT, QILING_LOCK_COST, QILING_MAX, QILING_PLANS, QILING_REBUILD_COST, QILING_STONE_GOLD, QILING_SUFFIX, QILING_TIERS,
  qilingFullCount, qilingSetBonusPercent, qilingStatValue, type QilingLine,
} from '@mc/shared';
import { BUFF_PROP, addProp, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { Rng } from './craft-rules';

export type QilingLocks = readonly [boolean, boolean, boolean];

const pick = (rng: Rng, n: number): number => Math.min(n - 1, Math.floor(rng() * n));
const roundTo = (v: number, decimals: number): number => {
  const p = 10 ** decimals;
  return Math.round(v * p) / p;
};

/** Rounds a rolled value to the prop's unit (1, 0.001, 0.00001) and keeps it inside [max/10, max); the full value is exactly max. */
function quantize(t: number, v: number, max: number, full: boolean): number {
  if (full) return max;
  const suffix = QILING_SUFFIX[t] ?? 1;
  const [step, decimals] = suffix === 1 ? [1, 0] : suffix === 2 ? [0.001, 3] : [0.00001, 5];
  let out = roundTo(v, decimals);
  const floor = roundTo(max / 10, decimals);
  if (out < floor) out = floor;
  if (out >= max) out = roundTo(max - step, decimals);
  return out;
}

/** One line of prop `t`: tier by weight, value spread over the tier range (Go rollQiLingValue). */
export function rollQilingValue(t: number, rng: Rng): QilingLine {
  const max = QILING_MAX[t] ?? 0;
  const total = QILING_TIERS.reduce((n, tier) => n + tier.weight, 0);
  let roll = pick(rng, total);
  let tier = QILING_TIERS[QILING_TIERS.length - 1];
  for (const candidate of QILING_TIERS) {
    if (roll < candidate.weight) {
      tier = candidate;
      break;
    }
    roll -= candidate.weight;
  }
  const ratio = tier.hi > tier.lo ? tier.lo + ((tier.hi - tier.lo) * pick(rng, 1001)) / 1000 : tier.lo;
  return { t, v: quantize(t, max * ratio, max, ratio >= 1), max };
}

function pickProp(rng: Rng, plan: readonly { t: number; r: number }[], used: ReadonlySet<number>): number {
  const open = plan.filter((c) => !used.has(c.t) && (QILING_MAX[c.t] ?? 0) > 0);
  let roll = pick(rng, open.reduce((n, c) => n + c.r, 0) || 1);
  for (const c of open) {
    if (roll < c.r) return c.t;
    roll -= c.r;
  }
  return 0;
}

/** Ky Linh: three new lines with distinct props from the slot's plan (locked lines of `current` are kept); [] when the plan cannot fill them. */
export function rollQilingLines(rng: Rng, slot: number, current: readonly QilingLine[], locked: QilingLocks = [false, false, false]): QilingLine[] {
  const plan = QILING_PLANS[slot];
  if (!plan || plan.length < QILING_LINE_COUNT) return [];
  const used = new Set<number>();
  const out: (QilingLine | undefined)[] = [];
  for (let i = 0; i < QILING_LINE_COUNT; i++) {
    if (locked[i] && current[i]) {
      out[i] = current[i];
      used.add(current[i].t);
    }
  }
  for (let i = 0; i < QILING_LINE_COUNT; i++) {
    if (out[i]) continue;
    const t = pickProp(rng, plan, used);
    if (t <= 0) return [];
    used.add(t);
    out[i] = rollQilingValue(t, rng);
  }
  return out as QilingLine[];
}

/** Trung Chu (owner rule 2026-10-24): every prop stays, the unlocked lines get a new value; a prop without a cap keeps its value. */
export function rerollQilingValues(rng: Rng, current: readonly QilingLine[], locked: QilingLocks): QilingLine[] {
  if (current.length !== QILING_LINE_COUNT) return [];
  return current.map((line, i) => (locked[i] || (QILING_MAX[line.t] ?? 0) <= 0 ? line : rollQilingValue(line.t, rng)));
}

export interface QilingPlan {
  need: number;
  have: number;
  missing: number;
  /** Gold an "auto" buy of the missing stones costs. */
  gold: number;
}

/** Stones for one Ky Linh (4) or Trung Chu (6 + 5 per lock); null when Trung Chu locks every line (nothing would change). */
export function planQiling(rebuild: boolean, locks: QilingLocks, have: number): QilingPlan | null {
  const locked = locks.filter(Boolean).length;
  if (rebuild && locked >= QILING_LINE_COUNT) return null;
  const need = rebuild ? QILING_REBUILD_COST + locked * QILING_LOCK_COST : QILING_COST;
  const missing = Math.max(0, need - have);
  return { need, have, missing, gold: missing * QILING_STONE_GOLD };
}

/**
 * Stat bonus of every worn Ky Linh piece (each entry = its three lines): every line adds its prop (flat props rounded, rates as points)
 * scaled by the set bonus of the full lines over all pieces. Props 32 / 58 (debuff hit / resist) have no H5 stat and add nothing.
 */
export function qilingBonusOf(pieces: readonly (readonly QilingLine[])[]): Bonuses {
  const b = emptyBonuses();
  const all = pieces.flat();
  const scale = 1 + qilingSetBonusPercent(qilingFullCount(all)) / 100;
  for (const l of all) {
    const entry = BUFF_PROP[l.t];
    if (!entry) continue;
    const value = qilingStatValue(l) * scale;
    addProp(b, BUFF_PROP, l.t, entry.target.kind === 'rate' ? value : Math.round(value), false);
  }
  return b;
}
