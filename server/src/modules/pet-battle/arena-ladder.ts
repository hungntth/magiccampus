// Pure positional ladder of the pet arena (Go domain/petarena/ladder.go): one contiguous 1..N order per level group. A lower-ranked
// challenger that beats a higher-ranked defender takes the defender's rank and everyone in between shifts down by one; any other result
// leaves the order alone. Rows without a stored rank in the group join at the bottom by registration time; the first read of a group with
// no stored ranks seeds the order from rating (descending, ties by registration time then character id). Ids in, ids out: no Mongo.

export interface LadderRow {
  characterId: number;
  /** Stored 1-based rank in THIS group, 0 when the row has none (new, or it changed group). */
  rank: number;
  createdAt: number;
  rating: number;
}

const byRegistration = (a: LadderRow, b: LadderRow): number => a.createdAt - b.createdAt || a.characterId - b.characterId;

/** Whether any row of the group already holds a stored rank (else the ladder is seeded from rating). */
export const isSeeded = (rows: readonly LadderRow[]): boolean => rows.some((r) => r.rank > 0);

/** Ranked rows by stored rank, then unranked ones by registration order. */
export function sortLadder(rows: readonly LadderRow[]): number[] {
  return [...rows]
    .sort((a, b) => {
      if ((a.rank > 0) !== (b.rank > 0)) return a.rank > 0 ? -1 : 1;
      return a.rank - b.rank || byRegistration(a, b);
    })
    .map((r) => r.characterId);
}

/** First read of a group: rating descending, ties by registration order. */
export function seedLadder(rows: readonly LadderRow[]): number[] {
  return [...rows].sort((a, b) => b.rating - a.rating || byRegistration(a, b)).map((r) => r.characterId);
}

/** The group order a read should use: the stored one, or the seeded one when no rank exists yet. */
export const orderOf = (rows: readonly LadderRow[]): number[] => (isSeeded(rows) ? sortLadder(rows) : seedLadder(rows));

/** Ranks that must be (re)written so the stored ranks equal the 1-based positions of `order`: id -> new rank (unchanged rows are absent). */
export function rankChanges(order: readonly number[], stored: ReadonlyMap<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  order.forEach((id, i) => {
    if (stored.get(id) !== i + 1) out.set(id, i + 1);
  });
  return out;
}

/** The order after `attacker` beat `defender`; `moved` is false when the attacker was already above (or either is missing). */
export function applyChallengeWin(order: readonly number[], attacker: number, defender: number): { order: number[]; moved: boolean } {
  const att = order.indexOf(attacker);
  const def = order.indexOf(defender);
  if (att < 0 || def < 0 || att <= def) return { order: [...order], moved: false };
  return { order: [...order.slice(0, def), attacker, ...order.slice(def, att), ...order.slice(att + 1)], moved: true };
}

/** 1-based position, 0 when absent. */
export const positionOf = (order: readonly number[], characterId: number): number => order.indexOf(characterId) + 1;
