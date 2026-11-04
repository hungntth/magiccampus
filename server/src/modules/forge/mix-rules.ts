// Pure rules of material mixing and gem upgrade (legacy mix.go / jewel.go R28, R38): attempts of "One" and "All",
// the per-attempt success roll and the product colour. Rates live in @mc/shared (mixRate, jewelRate).

import { MAX_MATERIAL_COLOR, MIX_MAX, MIX_MIN } from '@mc/shared';
import type { Rng } from './craft-rules';

/** Item template kinds that can be mixed (5 gem, 6 material). */
export const MIXABLE_KINDS: readonly number[] = [5, 6];
/** Gem item template type (data_tbl_item_template.type). */
export const GEM_TYPE = 503;

export const validMixNum = (n: number): boolean => Number.isInteger(n) && n >= MIX_MIN && n <= MIX_MAX;

/** Attempts of one request: "One" = a single attempt, "All" = floor(stack / num). 0 when the stack is too small. */
export function mixAttempts(all: boolean, stack: number, num: number): number {
  if (stack < num) return 0;
  return all ? Math.floor(stack / num) : 1;
}

/** Successful attempts out of `attempts`, each rolled against `ratePct`. */
export function rollAttempts(attempts: number, ratePct: number, rng: Rng): number {
  let ok = 0;
  for (let i = 0; i < attempts; i++) if (rng() * 100 < ratePct) ok++;
  return ok;
}

/** ColorCode of the mixed product (capped at 5). */
export const mixProductColor = (colorCode: number): number => Math.min(MAX_MATERIAL_COLOR, colorCode + 1);

/** Mixing a ColorCode-5 stack is pointless (H5 refuses it instead of wasting the materials). */
export const mixCapped = (colorCode: number): boolean => colorCode >= MAX_MATERIAL_COLOR;
