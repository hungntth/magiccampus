// Pure part of the config-driven prize pools (Go domain/gachabox + application/item/gacha_config.go): one box per item template, each entry is
// one prize (equipment 19, item 29, basic currency 30, game currency 35, special 36, pet 12) with an amount range, a weight, an optional
// equipment display colour and a bind mode. The roll picks one weighted entry (weight / sum of weights), then a uniform amount.

export const GACHA_BIND = { INHERIT: 0, BOUND: 1, UNBOUND: 2 } as const;
const MAX_COLOR = 4;
const MAX_WEIGHT = 1_000_000;
const MAX_COUNT = 1_000_000_000;
const PRIZE_TYPES: ReadonlySet<number> = new Set([12, 19, 29, 30, 35, 36]);
const SPECIAL_KEYS: ReadonlySet<string> = new Set(['soulPnt', 'carveKP', 'merit']);

export interface GachaEntry {
  itemId: number;
  sortOrder: number;
  prizeType: number;
  prizeId: number;
  prizeKey: string;
  label: string;
  countMin: number;
  countMax: number;
  weight: number;
  /** Equipment display colour 0..4, -1 = none. */
  color: number;
  bindMode: number;
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

export function toGachaEntry(r: Record<string, unknown>): GachaEntry {
  return {
    itemId: num(r.item_id), sortOrder: num(r.sort_order), prizeType: num(r.prize_type), prizeId: num(r.prize_id),
    prizeKey: String(r.prize_key ?? ''), label: String(r.label ?? ''), countMin: num(r.count_min), countMax: num(r.count_max),
    weight: num(r.weight), color: r.color === null || r.color === undefined ? -1 : num(r.color, -1), bindMode: num(r.bind_mode),
  };
}

/** Go Entry.Valid (pet grow rate aside). */
export function isValidEntry(e: GachaEntry): boolean {
  if (!PRIZE_TYPES.has(e.prizeType) || e.weight < 0 || e.weight > MAX_WEIGHT) return false;
  if (e.countMin <= 0 || e.countMax < e.countMin || e.countMax > MAX_COUNT) return false;
  if (e.bindMode < 0 || e.bindMode > 2) return false;
  if (e.color !== -1 && (e.color < 0 || e.color > MAX_COLOR)) return false;
  if (e.prizeType === 36) return SPECIAL_KEYS.has(e.prizeKey);
  if (e.prizeType === 12) return e.prizeId > 0 && e.countMin === 1 && e.countMax === 1;
  if (e.prizeType === 30) return e.prizeId >= 0;
  return e.prizeId > 0;
}

/** Entries that can be rolled: valid with a positive weight (Go Box.Weighted). */
export const weighted = (entries: readonly GachaEntry[]): GachaEntry[] => entries.filter((e) => isValidEntry(e) && e.weight > 0);

/** One roll: `rng(n)` returns an integer in [0, n). Null when the box has no weighted entry. */
export function rollGacha(entries: readonly GachaEntry[], rng: (n: number) => number): { entry: GachaEntry; count: number } | null {
  const pool = weighted(entries);
  if (pool.length === 0) return null;
  let pick = rng(pool.reduce((s, e) => s + e.weight, 0));
  let chosen = pool[pool.length - 1];
  for (const e of pool) {
    if (pick < e.weight) {
      chosen = e;
      break;
    }
    pick -= e.weight;
  }
  const count = chosen.countMax > chosen.countMin ? chosen.countMin + rng(chosen.countMax - chosen.countMin + 1) : chosen.countMin;
  return { entry: chosen, count };
}

/** Bind flag of the prize: inherit the box's, always bound, never bound. */
export function entryBound(e: GachaEntry, boxBound: boolean): boolean {
  if (e.bindMode === GACHA_BIND.BOUND) return true;
  if (e.bindMode === GACHA_BIND.UNBOUND) return false;
  return boxBound;
}

/** Award-row quality of an equipment display colour (Go displayColorStyleQuality): colour * 5, so the award colour code is the colour. */
export const colorQuality = (color: number): number => (color >= 0 && color <= MAX_COLOR ? color * 5 : 0);
