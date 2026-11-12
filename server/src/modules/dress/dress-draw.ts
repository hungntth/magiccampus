// Tủ Đồ draw pools and weighted roll (Go application/dress/draw_rules.go). OWNER-CONFIDENTIAL: the weights below live in code only and
// never reach a player-visible text or the wire. Chip pool = every type-2 recipe, set pool = type-1 recipes with is_open > 0; a rare
// fashion / flyer set and its chip weigh less than a normal one. Dress 1072 (Yasuo) never rolls (default `excluded_ids` of the Go knob).

import type { Rng } from '../forge/craft-rules';
import type { DressDef, RecipeDef } from '../gamedata/dress-data';

const NORMAL_WEIGHT = 100;
const RARE_FASHION_WEIGHT = 9;
const RARE_FLYER_WEIGHT = 9;
/** Fashions from the position of this dress on count as rare (Trung Thu and later). */
const FASHION_ANCHOR_DRESS_ID = 1044;
const RARE_FLYER_IDS: ReadonlySet<number> = new Set([2017, 2018, 2019, 2020, 2021, 2022]);
const EXCLUDED_DRESS_IDS: ReadonlySet<number> = new Set([1072]);

export interface PoolEntry {
  recipeId: number;
  weight: number;
}

export interface Pools {
  chips: PoolEntry[];
  sets: PoolEntry[];
  /** Set recipe ids that are announced when drawn. */
  rareSets: ReadonlySet<number>;
}

/** Whether a dress is a rare (announced, low-weight) one. */
export function isRareDress(d: DressDef, anchorPosition: number): boolean {
  return d.type === 1 ? d.position >= anchorPosition : RARE_FLYER_IDS.has(d.id);
}

export function buildPools(dresses: readonly DressDef[], recipes: readonly RecipeDef[]): Pools {
  const byRecipe = new Map(dresses.map((d) => [d.recipeId, d]));
  const anchor = dresses.find((d) => d.id === FASHION_ANCHOR_DRESS_ID)?.position ?? Infinity;
  const weightOf = (d: DressDef | undefined): number => {
    if (!d) return NORMAL_WEIGHT;
    if (EXCLUDED_DRESS_IDS.has(d.id)) return 0;
    if (!isRareDress(d, anchor)) return NORMAL_WEIGHT;
    return d.type === 1 ? RARE_FASHION_WEIGHT : RARE_FLYER_WEIGHT;
  };
  const chips: PoolEntry[] = [];
  const sets: PoolEntry[] = [];
  const rareSets = new Set<number>();
  for (const r of recipes) {
    if (r.type === 2 && r.product > 0) {
      const weight = weightOf(byRecipe.get(r.product));
      if (weight > 0) chips.push({ recipeId: r.id, weight });
    } else if (r.type === 1 && r.isOpen) {
      const d = byRecipe.get(r.id);
      const weight = weightOf(d);
      if (weight > 0) sets.push({ recipeId: r.id, weight });
      if (weight > 0 && d && isRareDress(d, anchor)) rareSets.add(r.id);
    }
  }
  return { chips, sets, rareSets };
}

/** Weighted pick (cumulative weights, `rng` in [0, 1)); null when the pool is empty. */
export function rollPool(pool: readonly PoolEntry[], rng: Rng): number | null {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  if (total <= 0) return null;
  let r = Math.min(total - 1, Math.floor(rng() * total));
  for (const e of pool) {
    if (r < e.weight) return e.recipeId;
    r -= e.weight;
  }
  return pool[pool.length - 1].recipeId;
}
