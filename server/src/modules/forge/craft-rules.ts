// Pure crafting rules (legacy craft.go R25): material level, the four colour-bucket rates (fixed table when every
// material is level 2..6, else data_tbl_recipe_plan), bucket roll with the failure remainder, prefix and quality.
// All randomness comes from an injectable Rng so tests can drive it.

export type Rng = () => number;
/** makePer1..4 = colour 2 (green), 3 (blue), 4 (purple), 5 (orange). */
export type Rates = [number, number, number, number];

export interface RecipePlanRow {
  st: number;
  rate: number;
}

/** What the rates need to know about one selected material. */
export interface MaterialInfo {
  colorCode: number; // instance ColorCode
  tplLevel: number; // template level || item_level
  tplColorCode: number; // template color_code
  tplColor: number; // template color (-1 for base materials)
}

export const LEVEL_RATES: Record<number, Rates> = {
  2: [100, 0, 0, 0], 3: [0, 100, 0, 0], 4: [0, 0, 100, 0], 5: [0, 0, 95, 5], 6: [0, 0, 0, 100],
};

/** Level-6 materials need equipment of at least this level (Go uses `< 60` as the refusal). */
export const LEVEL6_MIN_REQ = 60;

const colorToLevel = (c: number): number => (c > 0 ? c + 1 : 0);

/** Material level: template level, else from the template colour, else from the instance ColorCode (c -> c + 1). */
export function materialLevel(m: MaterialInfo): number {
  return m.tplLevel || colorToLevel(m.tplColorCode) || colorToLevel(m.tplColor) || colorToLevel(m.colorCode);
}

/** Lowest material tier used by the no-plan fallback: instance ColorCode, else template colour, else 1. */
function fallbackTier(mats: readonly MaterialInfo[]): number {
  const tiers = mats.map((m) => (m.colorCode > 0 ? m.colorCode : m.tplColorCode > 0 ? m.tplColorCode : 1));
  return Math.min(...tiers);
}

/** Plan rows `st` 1..4 -> colour code 2..4 (st 1 and 2 both -> 2), summed per colour bucket. */
function planRates(plans: readonly RecipePlanRow[]): Rates {
  const r: Rates = [0, 0, 0, 0];
  for (const p of plans) {
    const cc = p.st >= 2 && p.st <= 5 ? p.st : p.st === 1 ? 2 : 0;
    if (cc >= 2 && p.rate > 0) r[cc - 2] += p.rate;
  }
  return r;
}

/** Rates of a craft, or 'blocked' when a level-6 material meets equipment below level 60. */
export function craftRates(
  mats: readonly MaterialInfo[], equipReqLevel: number, plans: readonly RecipePlanRow[],
): Rates | 'blocked' {
  const levels = mats.map(materialLevel);
  if (levels.length > 0 && levels.every((l) => l >= 2 && l <= 6)) {
    if (levels.some((l) => l >= 6) && equipReqLevel > 0 && equipReqLevel < LEVEL6_MIN_REQ) return 'blocked';
    return [...LEVEL_RATES[Math.min(...levels)]] as Rates;
  }
  const r = planRates(plans);
  if (r.some((x) => x > 0)) return r;
  const out: Rates = [0, 0, 0, 0];
  out[Math.min(3, Math.max(0, fallbackTier(mats) - 2))] = 100;
  return out;
}

/** Bucket 1..4 (colour 2..5) or 0 = failure. The pool is max(total, 100): the first `pool - total` is failure. */
export function rollBucket(r: Rates, rng: Rng): number {
  const total = r.reduce((a, b) => a + Math.max(b, 0), 0);
  const pool = Math.max(total, 100);
  let pos = rng() * pool;
  const fail = pool - total;
  if (pos < fail) return 0;
  pos -= fail;
  for (let i = 0; i < 4; i++) {
    if (r[i] <= 0) continue;
    if (pos < r[i]) return i + 1;
    pos -= r[i];
  }
  const last = r.map((x, i) => (x > 0 ? i + 1 : 0)).filter((i) => i > 0).pop();
  return last ?? 0;
}

const highestBucket = (r: Rates): number => r.map((x, i) => (x > 0 ? i + 1 : 0)).reduce((a, b) => Math.max(a, b), 0);

/** Prefix 1..5: always 5 (Trác Việt) except in the highest bucket of the rates, where it is uniform 1..5. */
export function rollPrefix(bucket: number, r: Rates, rng: Rng): number {
  return bucket !== highestBucket(r) ? 5 : 1 + Math.floor(rng() * 5);
}

/** quality = bucket * 5 + prefix (colour = ceil(q / 5) = bucket + 1). */
export const qualityOf = (bucket: number, prefix: number): number => bucket * 5 + prefix;
export const colorOfQuality = (q: number): number => Math.ceil(q / 5);

/** Inclusive random integer. */
export function randInt(lo: number, hi: number, rng: Rng): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}
