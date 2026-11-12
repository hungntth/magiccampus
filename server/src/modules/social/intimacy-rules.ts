// Pure intimacy rules: the per-player team-gain throttle (shared by won group battles and the online-party tick), the
// teammate selection of the tick (AFK members neither gain nor give) and the gift request check. Unit-tested in
// intimacy-rules.test.ts.

import { INTIMACY_ITEM_MAX_QTY, TEAM_INTIMACY, intimacyItemAmount } from '@mc/shared';

/** One claim per player per interval: true (and the stamp moves) when the player may gain now. */
export class TeamThrottle {
  private readonly last = new Map<number, number>();

  constructor(private readonly intervalMs: number = TEAM_INTIMACY.intervalMs) {}

  claim(characterId: number, now: number): boolean {
    const prev = this.last.get(characterId);
    if (prev !== undefined && now - prev < this.intervalMs) return false;
    this.last.set(characterId, now);
    return true;
  }

  /** Drops a stale stamp (older than the interval): keeps the map small without reopening a live throttle window. */
  forget(characterId: number, now: number): void {
    const prev = this.last.get(characterId);
    if (prev !== undefined && now - prev >= this.intervalMs) this.last.delete(characterId);
  }

  get size(): number {
    return this.last.size;
  }
}

/** Members of `party` that `self` gains from on the tick: others, not AFK, online; nothing when `self` is AFK. */
export function tickTargets(members: readonly number[], afk: ReadonlySet<number>, self: number, online: (cid: number) => boolean): number[] {
  if (afk.has(self)) return [];
  return members.filter((m) => m !== self && !afk.has(m) && online(m));
}

/** Validated `useIntimacyItem` arguments: a known template, a positive integer quantity and the total gain. */
export function giftPlan(templateId: unknown, qty: unknown): { templateId: number; qty: number; total: number } | null {
  const tid = Number(templateId);
  const n = Number(qty);
  const amount = Number.isInteger(tid) ? intimacyItemAmount(tid) : null;
  if (amount === null || !Number.isInteger(n) || n < 1 || n > INTIMACY_ITEM_MAX_QTY) return null;
  return { templateId: tid, qty: n, total: amount * n };
}
