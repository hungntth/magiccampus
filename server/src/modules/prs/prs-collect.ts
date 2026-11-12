// Chân Hồn Thần Thú collect drop table (Go domain/prs/collect_rates.go + application/prs/collect.go), pure with an injectable rng in [0, 1).
// Source: game_tuning_prs_collect key prs_collect_rates (JSON). Broken JSON -> all defaults, a bad / missing field -> that field's default,
// empty or all-zero chip_weights -> the default weights. Defaults = client help text PRS_PANEL[38] (free 10 %, gold 20 %, six guarantee one)
// plus the Go amounts (30 stone per collect, 10 crystal per chipless gold collect, uniform chip ids 1..10).

import { PRS } from '@mc/shared';

export interface CollectRates {
  freeChipPercent: number;
  goldChipPercent: number;
  sixGuaranteed: number;
  freeStone: number;
  goldStone: number;
  goldCrystalNoChip: number;
  chipWeights: Map<number, number>;
}

// Go-invented: the amounts and the uniform weights (no legacy table holds them).
const DEFAULT_STONE = 30;
const DEFAULT_CRYSTAL = 10;
const DEFAULT_CHIP_IDS = 10;
const MAX_AMOUNT = 100_000;
const MAX_WEIGHT = 1_000_000;

export function defaultChipWeights(): Map<number, number> {
  return new Map(Array.from({ length: DEFAULT_CHIP_IDS }, (_, i) => [i + 1, 1]));
}

export function defaultCollectRates(): CollectRates {
  return {
    freeChipPercent: 10, goldChipPercent: 20, sixGuaranteed: 1, freeStone: DEFAULT_STONE, goldStone: DEFAULT_STONE,
    goldCrystalNoChip: DEFAULT_CRYSTAL, chipWeights: defaultChipWeights(),
  };
}

const percent = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? v : undefined);
const amount = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_AMOUNT ? v : undefined);

export function parseCollectRates(raw: string): CollectRates {
  const out = defaultCollectRates();
  let r: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
    r = v as Record<string, unknown>;
  } catch {
    return out;
  }
  out.freeChipPercent = percent(r.free_chip_percent) ?? out.freeChipPercent;
  out.goldChipPercent = percent(r.gold_chip_percent) ?? out.goldChipPercent;
  const six = r.six_collect_guaranteed_chips;
  if (typeof six === 'number' && Number.isInteger(six) && six >= 0 && six <= PRS.SIX_TIMES) out.sixGuaranteed = six;
  out.freeStone = amount(r.free_stone) ?? out.freeStone;
  out.goldStone = amount(r.gold_stone) ?? out.goldStone;
  out.goldCrystalNoChip = amount(r.gold_crystal_no_chip) ?? out.goldCrystalNoChip;
  const weights = new Map<number, number>();
  const w = r.chip_weights;
  if (w && typeof w === 'object' && !Array.isArray(w)) {
    for (const [k, v] of Object.entries(w as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && id > 0 && typeof v === 'number' && Number.isInteger(v) && v > 0) weights.set(id, Math.min(v, MAX_WEIGHT));
    }
  }
  if (weights.size > 0) out.chipWeights = weights;
  return out;
}

export interface ChipPool {
  ids: number[];
  weights: number[];
  total: number;
}

/** Weighted pool over the ids that exist in data_tbl_prs_chip (sorted by id, like Go). */
export function chipPool(weights: ReadonlyMap<number, number>, exists: (id: number) => boolean): ChipPool {
  const ids = [...weights.keys()].filter((id) => (weights.get(id) ?? 0) > 0 && exists(id)).sort((a, b) => a - b);
  const ws = ids.map((id) => weights.get(id)!);
  return { ids, weights: ws, total: ws.reduce((a, b) => a + b, 0) };
}

/** One weighted chip id (null on an empty pool). */
export function pickChip(pool: ChipPool, rng: () => number): number | null {
  if (pool.total <= 0) return null;
  let roll = Math.floor(rng() * pool.total);
  for (let i = 0; i < pool.ids.length; i++) {
    roll -= pool.weights[i]!;
    if (roll < 0) return pool.ids[i]!;
  }
  return pool.ids[pool.ids.length - 1]!;
}

const chance = (p: number, rng: () => number): boolean => (p <= 0 ? false : p >= 100 ? true : rng() * 100 < p);

export type CollectKind = 'free' | 'gold' | 'six';

export interface CollectPlan {
  /** fragment draws */
  chips: number;
  stone: number;
  crystal: number;
}

/** Fragments and currency gains of one button: free = one free roll; gold = one gold roll; six = six gold rolls raised to the guarantee. */
export function planCollect(kind: CollectKind, rates: CollectRates, rng: () => number): CollectPlan {
  if (kind === 'free') return { chips: chance(rates.freeChipPercent, rng) ? 1 : 0, stone: rates.freeStone, crystal: 0 };
  const times = kind === 'six' ? PRS.SIX_TIMES : 1;
  let chips = 0;
  for (let i = 0; i < times; i++) if (chance(rates.goldChipPercent, rng)) chips++;
  if (kind === 'six') chips = Math.max(chips, Math.min(times, rates.sixGuaranteed));
  return { chips, stone: rates.goldStone * times, crystal: rates.goldCrystalNoChip * (times - chips) };
}

/** `n` weighted draws; null on an empty pool. */
export function drawChips(pool: ChipPool, n: number, rng: () => number): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const id = pickChip(pool, rng);
    if (id === null) return null;
    out.push(id);
  }
  return out;
}
