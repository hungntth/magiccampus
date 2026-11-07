// Stacking math of BuffService.grant (legacy application/item remainingBuffTime + the food / wedding candy AddOrRefresh requests):
// eating the same food again ADDS the remaining time (timed) or the remaining battles (battle-count) to the new amount.

import { BuffType } from '@mc/shared';

export interface GrantOptions {
  /** Add the existing row's remaining seconds (timed) / battles (battle-count) to the granted amount. */
  addRemaining?: boolean;
  /** > 0 makes a battle-count buff (BuffType.BATTLE, no expiry) with this many battles. */
  battles?: number;
}

export interface ExistingBuff {
  expiresAt: Date | null;
  battlesLeft: number;
}

export interface StackedGrant {
  seconds: number;
  battles: number;
}

/** Whole seconds left of a timed row (0 when permanent / per-battle / expired). */
export function remainingSeconds(row: ExistingBuff | null | undefined, now: number): number {
  if (!row?.expiresAt) return 0;
  return Math.max(0, Math.ceil((row.expiresAt.getTime() - now) / 1000));
}

/** The seconds / battles a grant writes once the existing row is added when `addRemaining` is set. */
export function stackGrant(
  existing: ExistingBuff | null | undefined, seconds: number, opts: GrantOptions, now: number,
): StackedGrant {
  const battles = Math.max(0, Math.trunc(opts.battles ?? 0));
  if (battles > 0) {
    // a battle-count row has no expiry; a timed row of the same buff does not carry battles
    const left = opts.addRemaining && existing && !existing.expiresAt ? Math.max(0, existing.battlesLeft) : 0;
    return { seconds: 0, battles: battles + left };
  }
  const carried = opts.addRemaining ? remainingSeconds(existing, now) : 0;
  return { seconds: seconds > 0 ? seconds + carried : seconds, battles: 0 };
}

/** The persisted type of a grant: battle-count, timed, or the template default (unique / permanent). */
export function grantBuffType(stacked: StackedGrant, templateType: number): number {
  if (stacked.battles > 0) return BuffType.BATTLE;
  if (stacked.seconds > 0) return BuffType.TIMED;
  return templateType === BuffType.UNIQUE ? BuffType.UNIQUE : BuffType.PERMANENT;
}

export interface BattleChargeRow {
  _id: number;
  buffType: number;
  battlesLeft: number;
}

/** One finished battle: every battle-count row loses a charge; rows at their last charge are removed. */
export function planBattleCharges(rows: readonly BattleChargeRow[]): { update: { id: number; left: number }[]; remove: number[] } {
  const update: { id: number; left: number }[] = [];
  const remove: number[] = [];
  for (const r of rows) {
    if (r.buffType !== BuffType.BATTLE || r.battlesLeft <= 0) continue;
    const left = r.battlesLeft - 1;
    if (left <= 0) remove.push(r._id);
    else update.push({ id: r._id, left });
  }
  return { update, remove };
}
