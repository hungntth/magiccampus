// Pure star rules (legacy star.go R30-R33 with the H5 decisions): success rate by the client display index, a failed
// roll keeps the star, `starAll` keeps rolling while stones and the target allow. Randomness is injectable.

import { MAX_STAR, starRate, type EquipProperties } from '@mc/shared';
import type { Rng } from './craft-rules';

export interface StarPlan {
  /** Rolls made (each spends `count` stones). */
  attempts: number;
  /** Star level after all rolls. */
  star: number;
  /** Result of the last roll. */
  lastSuccess: boolean;
}

/**
 * Simulates the rolls: every attempt spends `count` stones, succeeds with `starRate(star, count)` percent and raises the
 * star by one; a failure changes nothing. Stops at `target`, when stones run out, or after `maxAttempts`.
 */
export function planStars(
  star: number, stones: number, count: number, target: number, maxAttempts: number, rng: Rng,
): StarPlan {
  let s = star;
  let left = stones;
  let attempts = 0;
  let last = false;
  const goal = Math.min(MAX_STAR, target);
  while (s < goal && left >= count && attempts < maxAttempts) {
    attempts++;
    left -= count;
    last = rng() * 100 < starRate(s, count);
    if (last) s++;
  }
  return { attempts, star: s, lastSuccess: last };
}

/** Star stone count per attempt: an integer 1..5. */
export const validStoneCount = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 5;

/** Star target of starAll: an integer 1..10. */
export const validStarTarget = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= MAX_STAR;

/** Instance star value (rows default to 0). */
export const starOf = (row: { star?: number; properties?: EquipProperties }): number => Math.max(0, Math.trunc(row.star ?? 0));
