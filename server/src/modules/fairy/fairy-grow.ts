// Pure fairyGrowUp rules (Go application/fairy/grow.go + grow_curve.go): the per-cultivation growth gain follows the owner's level curve, a small
// crit gives x10, a big crit lifts gexp to the next grow-level threshold (silver cultivations may only small-crit), gexp is capped at the
// last threshold. Type 0 = 100 000 silver and one of the 20 daily cultivations, type 1 = 39 gold, type 2 = up to 20 gold cultivations
// charged per cultivation actually run (stops early at the grow cap or when the wallet runs out).

import { FAIRY, FAIRY_GROW_EXP, type FairyFailCode, type FairyInfo } from '@mc/shared';

/** Crit odds per mille (Go critBigPermille / critSmallPermille). // Go-invented */
export const GROW_CRIT = { BIG_PERMILLE: 5, SMALL_PERMILLE: 50, SMALL_MULT: 10 } as const;
export const CRIT = { NONE: 0, SMALL: 1, BIG: 2 } as const;

/** Owner pace rule of 2026-10-25 (Go grow_curve.go): normal cultivations per grow level, interpolated per segment. // Go-invented */
const GROW_CURVE: readonly { from: number; to: number; fromCount: number; toCount: number }[] = [
  { from: 1, to: 20, fromCount: 2, toCount: 18 },
  { from: 21, to: 30, fromCount: 40, toCount: 80 },
  { from: 31, to: 40, fromCount: 80, toCount: 120 },
  { from: 41, to: 50, fromCount: 150, toCount: 330 },
];
const GROW_MIN_GAIN = 100; // Go-invented

/** Server grow level: thresholds met (gexp 0..499 -> 0), capped at 50 (Go gexpToLv, not the client quirk). */
export function growLevelOf(gexp: number): number {
  let lv = 0;
  for (const t of FAIRY_GROW_EXP) {
    if (gexp >= t) lv++;
    else break;
  }
  return Math.min(lv, FAIRY.GROW_MAX);
}

/** Normal cultivations needed for the grow level after `lv`. */
export function growCultivations(lv: number): number {
  const level = lv + 1;
  const last = GROW_CURVE[GROW_CURVE.length - 1];
  if (level >= last.to) return last.toCount;
  for (const seg of GROW_CURVE) {
    if (level < seg.from || level > seg.to) continue;
    const num = (seg.toCount - seg.fromCount) * (level - seg.from);
    const den = seg.to - seg.from;
    return seg.fromCount + Math.floor((2 * num + den) / (2 * den));
  }
  return GROW_CURVE[0].fromCount;
}

function growSpan(lv: number): number {
  const i = Math.min(lv, FAIRY_GROW_EXP.length - 1);
  return i <= 0 ? FAIRY_GROW_EXP[0] : FAIRY_GROW_EXP[i] - FAIRY_GROW_EXP[i - 1];
}

/** Base growth of one normal cultivation at the current grow level. */
export const growBaseGain = (lv: number): number => Math.max(GROW_MIN_GAIN, Math.floor(growSpan(lv) / growCultivations(lv)));

/** Growth of one cultivation with crit tier `cri`. */
export function growGain(gexp: number, cri: number): number {
  const lv = growLevelOf(gexp);
  let gain = growBaseGain(lv);
  if (cri === CRIT.SMALL) gain *= GROW_CRIT.SMALL_MULT;
  else if (cri === CRIT.BIG && lv < FAIRY_GROW_EXP.length && FAIRY_GROW_EXP[lv] - gexp > gain) gain = FAIRY_GROW_EXP[lv] - gexp;
  return gain;
}

/** Crit tier from a die in [0, 1). */
export function rollCrit(rng: () => number): number {
  const r = Math.floor(rng() * 1000);
  if (r < GROW_CRIT.BIG_PERMILLE) return CRIT.BIG;
  return r < GROW_CRIT.BIG_PERMILLE + GROW_CRIT.SMALL_PERMILLE ? CRIT.SMALL : CRIT.NONE;
}

export interface GrowPlan {
  /** Growth gained by the whole call. */
  exp: number;
  /** Crit tier of the last cultivation. */
  cri: number;
  /** Cultivations run (each is paid). */
  done: number;
  gexp: number;
  gnum: number;
}

export const growUnitCost = (type: number): number => (type === FAIRY.GROW_TYPE.MONEY ? FAIRY.GROW_COST_MONEY : FAIRY.GROW_COST_GOLD);

/**
 * fairyGrowUp(type) on `f` (daily counters already refreshed). `affordable` = cultivations the wallet pays for (balance / unit cost).
 * Does not mutate `f`; the caller charges `done x growUnitCost(type)` before it writes gexp / gnum.
 */
export function planGrow(f: FairyInfo, type: number, affordable: number, rng: () => number): GrowPlan | { error: FairyFailCode } {
  if (type !== FAIRY.GROW_TYPE.MONEY && type !== FAIRY.GROW_TYPE.GOLD && type !== FAIRY.GROW_TYPE.BATCH) return { error: 'out' };
  if (growLevelOf(f.gexp) >= FAIRY.GROW_MAX) return { error: 'lv' };
  const silver = type === FAIRY.GROW_TYPE.MONEY;
  if (silver && f.flag.gnum <= 0) return { error: 'out' };
  if (affordable < 1) return { error: 'rmb' };
  const cap = FAIRY_GROW_EXP[FAIRY_GROW_EXP.length - 1];
  const max = Math.min(type === FAIRY.GROW_TYPE.BATCH ? FAIRY.GROW_BATCH : 1, affordable);
  let gexp = f.gexp;
  let gnum = f.flag.gnum;
  let exp = 0;
  let cri: number = CRIT.NONE;
  let done = 0;
  while (done < max && !(silver && gnum <= 0) && growLevelOf(gexp) < FAIRY.GROW_MAX) {
    let c: number = rollCrit(rng);
    if (silver && c === CRIT.BIG) c = CRIT.SMALL;
    const gain = Math.min(growGain(gexp, c), cap - gexp);
    gexp += gain;
    exp += gain;
    if (silver) gnum--;
    cri = c;
    done++;
  }
  return done === 0 ? { error: 'out' } : { exp, cri, done, gexp, gnum };
}
