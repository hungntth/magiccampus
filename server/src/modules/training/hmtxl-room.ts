// Pure HMTXL public-room transitions on the stored session (Go application/hmtxl service.go): enter (night block, one session,
// reward first), end (finished shares kept, the running one dropped) and the claim that folds a running session into the shares.
// Each returns the refusal text, or null / the value when it applied (the document is edited in place).

import { HMTXL_TEXT, hmtxlCleaning, hmtxlShares } from '@mc/shared';
import type { HmtxlDoc } from './training-doc';

export function enterRoom(h: HmtxlDoc, now: number): string | null {
  if (hmtxlCleaning(now)) return HMTXL_TEXT.CLEANING;
  if (h.st > 0) return HMTXL_TEXT.TRAINING;
  if (h.u > 0) return HMTXL_TEXT.PENDING;
  h.st = now;
  return null;
}

/** endHMTXLRoom(1): `{shares}` = every finished share now waiting for the reward. */
export function endRoom(h: HmtxlDoc, now: number): { shares: number } | string {
  if (h.st <= 0) return HMTXL_TEXT.NOT_TRAINING;
  h.u += hmtxlShares(h.st, now);
  h.st = 0;
  return { shares: h.u };
}

/** getHMTAward: every share (the running session's finished ones included); the session ends. 0 = nothing to claim. */
export function takeShares(h: HmtxlDoc, now: number): number {
  const shares = h.u + hmtxlShares(h.st, now);
  h.st = 0;
  h.u = 0;
  return shares;
}

/** Whether a reward is waiting (the panel's `awd`). */
export const awardWaiting = (h: HmtxlDoc, now: number): boolean => h.u > 0 || hmtxlShares(h.st, now) > 0;
