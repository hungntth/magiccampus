// Pure lotto rules: the plan row pool of a wish type, the weighted roll (Go rollPlan: proportional to the float `r`, uniform when no
// weight is positive, the last row as the float-edge fallback), the daily free-wish counter and the holding bag claim planning.

import { LOTTO_BAG_CAP, LOTTO_FREE_DAILY, type LottoEntry } from '@mc/shared';

/** data_tbl_plan row (columns the draw reads). */
export interface PlanRow {
  id: number;
  /** wish type 1..4 (column t) */
  t: number;
  /** item table: 29 item, 19 equipment (the only two H5 can grant) */
  ti: number;
  ii: number;
  n: number;
  q: number;
  b: number;
  r: number;
  qid: number;
}

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const toPlan = (r: Raw): PlanRow => ({
  id: num(r.id), t: num(r.t), ti: num(r.ti), ii: num(r.ii), n: Math.max(1, num(r.n, 1)), q: num(r.q), b: num(r.b), r: num(r.r), qid: num(r.qid, -1),
});

/** Rows H5 can grant: an item or equipment template, not tied to a quest. */
export const grantable = (p: PlanRow): boolean => (p.ti === 29 || p.ti === 19) && p.qid < 0 && p.ii > 0;

/** One weighted pick; `rng` returns [0, 1). */
export function rollPlan(pool: readonly PlanRow[], rng: () => number): PlanRow | null {
  if (pool.length === 0) return null;
  const total = pool.reduce((s, p) => s + (p.r > 0 ? p.r : 0), 0);
  if (total <= 0) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const roll = rng() * total;
  let acc = 0;
  for (const p of pool) {
    if (p.r <= 0) continue;
    acc += p.r;
    if (roll < acc) return p;
  }
  return pool[pool.length - 1];
}

export const toEntry = (p: PlanRow): LottoEntry => ({ ti: String(p.ti), ii: String(p.ii), n: p.n, q: String(p.q), b: p.b });

export interface FreeState {
  day: string;
  n: number;
}

/** Free wishes used on `today` (the counter restarts on a new day). */
export const freeUsed = (s: FreeState, today: string): number => (s.day === today ? s.n : 0);

/** Free wish: type 1, single draw, under the daily allowance. */
export const isFreeWish = (type: number, num: number, used: number): boolean => type === 1 && num === 1 && used < LOTTO_FREE_DAILY;

/** Whether `num` more entries fit the holding bag. */
export const bagHasRoom = (len: number, num: number): boolean => len + num <= LOTTO_BAG_CAP;
