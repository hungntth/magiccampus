// Ranking rules (M6 phase D), pure: ordering and tie-break per category, guild-name join and the per-category cache with an injected clock.

import { RANK_TOP, type RankCategory, type RankGetReply, type RankRow } from '@mc/shared';

export interface RankChar {
  id: number;
  name: string;
  level: number;
  exp: number;
  money: number;
  moneyBind: number;
  /** Achievement points (character_achievements.achPoint), 0 without a state row. */
  achPoint: number;
}

/** Sort key per live category (bigger first); ties go to the lower character id (the older character). */
const keys: Partial<Record<RankCategory, (c: RankChar) => number[]>> = {
  exp: (c) => [c.level, c.exp],
  money: (c) => [c.moneyBind + c.money],
  achPoint: (c) => [c.achPoint],
};
const values: Partial<Record<RankCategory, (c: RankChar) => number>> = {
  exp: (c) => c.level,
  money: (c) => c.moneyBind + c.money,
  achPoint: (c) => c.achPoint,
};

export function isLive(category: RankCategory): boolean {
  return keys[category] !== undefined;
}

/** Top `limit` characters of a live category, best first. Categories without a data source give []. */
export function topChars(category: RankCategory, chars: readonly RankChar[], limit: number = RANK_TOP): RankChar[] {
  const key = keys[category];
  if (!key) return [];
  return [...chars]
    .filter((c) => category !== 'achPoint' || c.achPoint > 0) // nobody is ranked with 0 achievement points
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i += 1) if (ka[i] !== kb[i]) return kb[i] - ka[i];
      return a.id - b.id;
    })
    .slice(0, limit);
}

/** Wire rows for the picked characters; `guildOf` maps character id -> guild name (missing = no guild). */
export function toRows(category: RankCategory, picked: readonly RankChar[], guildOf: ReadonlyMap<number, string>): RankRow[] {
  const value = values[category];
  if (!value) return [];
  return picked.map((c) => ({ id: c.id, name: c.name, guild: guildOf.get(c.id) ?? '', value: value(c) }));
}

export function emptyReply(category: RankCategory): RankGetReply {
  return { name: category, data: [] };
}

/** Time-boxed cache keyed by category. Concurrent misses share one load. */
export class RankCache {
  private readonly entries = new Map<string, { at: number; value: Promise<RankGetReply> }>();

  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}

  get(category: RankCategory, load: () => Promise<RankGetReply>): Promise<RankGetReply> {
    const hit = this.entries.get(category);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const value = load();
    this.entries.set(category, { at: this.now(), value });
    // A failed load must not be served for the whole ttl.
    value.catch(() => {
      if (this.entries.get(category)?.value === value) this.entries.delete(category);
    });
    return value;
  }
}
