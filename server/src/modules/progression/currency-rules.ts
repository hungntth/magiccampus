// Pure currency guards and Mongo operations (M7 foundation): amount validation and the conditional-$inc spend / capped credit
// that CurrencyService runs. Kept free of Nest / Mongoose so the guards are unit-testable.

import { MAX_CURRENCY, type CurrencyKey } from '@mc/shared';

/** A positive integer amount within the per-balance cap, else null. */
export function parseAmount(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= MAX_CURRENCY ? n : null;
}

export const currencyPath = (key: CurrencyKey): string => `currencies.${key}`;

/** Atomic spend: the filter fails (matched 0) when the balance is below the cost, so it can never go negative. */
export function spendOp(characterId: number, key: CurrencyKey, cost: number): {
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
} {
  const path = currencyPath(key);
  return { filter: { _id: characterId, [path]: { $gte: cost } }, update: { $inc: { [path]: -cost } } };
}

/** Atomic credit as a pipeline update: missing balance counts as 0 and the result is capped at MAX_CURRENCY. */
export function creditPipeline(key: CurrencyKey, amount: number): Record<string, unknown>[] {
  const path = currencyPath(key);
  return [{ $set: { [path]: { $min: [MAX_CURRENCY, { $add: [{ $ifNull: [`$${path}`, 0] }, amount] }] } } }];
}
