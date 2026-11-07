// Battle exp rate from active buffs (Go application/combat/exp_rate_buffs.go): buff prop 24 = character exp, 25 = pet exp (percent_flag 1).
// A value >= 100 is an exp book rate (multiplier value / 100, the highest one counts, rates do not stack); a smaller value is a
// +value % bonus that adds up. final = round(base * (100 + pct) / 100 * rate). Prop 69 (flat factor) and title / passive percents are
// not ported. Pure: the settle service reads the buffs.

import { buffProps } from '../buff/buff-props';

export interface ExpRate {
  charRate: number;
  petRate: number;
  charPct: number;
  petPct: number;
}

export const NEUTRAL_EXP_RATE: ExpRate = { charRate: 1, petRate: 1, charPct: 0, petPct: 0 };
const BOOK_RATE_FLOOR = 100;

/** The rates one buff template gives (neutral when it has no exp props, or its percent_flag is not 1). */
export function expRateOfBuff(tpl: Record<string, unknown> | undefined): ExpRate {
  const r = { ...NEUTRAL_EXP_RATE };
  const { percent, props } = buffProps(tpl);
  if (!percent) return r;
  for (const p of props) {
    if (p.num <= 0 || (p.prop !== 24 && p.prop !== 25)) continue;
    const char = p.prop === 24;
    if (p.num >= BOOK_RATE_FLOOR) {
      if (char) r.charRate = Math.max(r.charRate, p.num / 100);
      else r.petRate = Math.max(r.petRate, p.num / 100);
    } else if (char) r.charPct += p.num;
    else r.petPct += p.num;
  }
  return r;
}

/** Rates add up as Go Merge: the highest book rate, the sum of the percents. */
export function mergeExpRate(a: ExpRate, b: ExpRate): ExpRate {
  return {
    charRate: Math.max(a.charRate, b.charRate), petRate: Math.max(a.petRate, b.petRate),
    charPct: a.charPct + b.charPct, petPct: a.petPct + b.petPct,
  };
}

const apply = (base: number, pct: number, rate: number): number => {
  if (base <= 0) return base;
  const mult = Math.max(rate, 1) * (pct > 0 ? (100 + pct) / 100 : 1);
  return mult === 1 ? base : Math.round(base * mult);
};

export const charExp = (base: number, r: ExpRate): number => apply(base, r.charPct, r.charRate);
export const petExp = (base: number, r: ExpRate): number => apply(base, r.petPct, r.petRate);

/** Exp rate of a set of buff templates. */
export function expRateOfBuffs(templates: readonly (Record<string, unknown> | undefined)[]): ExpRate {
  return templates.reduce<ExpRate>((acc, t) => mergeExpRate(acc, expRateOfBuff(t)), NEUTRAL_EXP_RATE);
}
