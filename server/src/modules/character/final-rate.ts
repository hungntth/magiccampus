// getFinalPraDef / finalPraMagDef reply shape (Go handlers/character/stats.go:13-57, pet/refresh.go): `{key, value}` when the
// first argument is a non-empty string, else the bare value. The 2nd / 3rd arguments (client value, cid) are ignored. Pure.

import type { FinalRateKey, FinalRateReply } from '@mc/shared';
import type { Bonuses } from './character-stats';

export function finalRateReply(arg0: unknown, value: number): FinalRateReply | number {
  return typeof arg0 === 'string' && arg0 !== '' ? { key: arg0, value } : value;
}

export function rateOf(rates: Readonly<Record<string, number>>, key: FinalRateKey): number {
  const v = Number(rates[key] ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** A pet's secondary rates: its gear plus its passive skills (pets have no buffs / features). */
export function petRates(b: { gear?: Pick<Bonuses, 'rates'>; passive?: Pick<Bonuses, 'rates'> }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const src of [b.gear?.rates, b.passive?.rates]) {
    for (const [k, v] of Object.entries(src ?? {})) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
