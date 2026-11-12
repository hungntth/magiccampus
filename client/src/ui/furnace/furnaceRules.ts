// Pure totals of the Lò Luyện Thần Bí window: whole-stack item selection and clamped score counts.

import type { FurnaceItemRow, FurnaceScoreRow } from '@mc/shared';

/** Crystals from the selected stacks (the whole stack is smelted). */
export const itemsTotal = (items: readonly FurnaceItemRow[], selected: ReadonlySet<number>): number =>
  items.reduce((n, r) => (selected.has(r.id) ? n + r.value * r.num : n), 0);

/** Typed count clamped to 0..owned (NaN / fractions become 0 / floor). */
export const clampCount = (raw: number, owned: number): number => (Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 0), Math.max(owned, 0)) : 0);

export const scoreCrystals = (row: FurnaceScoreRow, count: number): number => row.value * clampCount(count, row.owned);

export const scoresTotal = (scores: readonly FurnaceScoreRow[], counts: Readonly<Record<number, number>>): number =>
  scores.reduce((n, r) => n + scoreCrystals(r, counts[r.type] ?? 0), 0);

/** `{type: count}` of the rows with a positive clamped count, the MysteryExchangeScore argument. */
export function scorePayload(scores: readonly FurnaceScoreRow[], counts: Readonly<Record<number, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of scores) {
    const c = clampCount(counts[r.type] ?? 0, r.owned);
    if (c > 0) out[String(r.type)] = c;
  }
  return out;
}

/** `{instanceId: true}` of the selected stacks that still exist, the MysteryExchangeItem argument. */
export function itemPayload(items: readonly FurnaceItemRow[], selected: ReadonlySet<number>): Record<string, true> {
  const out: Record<string, true> = {};
  for (const r of items) if (selected.has(r.id)) out[String(r.id)] = true;
  return out;
}
