// Gift-bag contents (data_tbl_item_award keyed by the bag's item_id, decision 11: bags are unpacked at grant time). Port of Go
// application/item/award_picker.go: payload.guaranteed rows always; the rest is one weighted pick (roll 1..maxRate, then a
// uniform pick among the rows whose rate >= roll). `type` 29 item / 19 equipment / 30 currency / 35 game currency. Pure.

export interface ItemAwardRow {
  id: number;
  bagId: number; // item_id
  awardId: number; // content template / currency id
  type: number;
  count: number;
  rate: number;
  quality: number;
  guaranteed: boolean;
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

function guaranteedOf(payload: unknown): boolean {
  if (payload && typeof payload === 'object') return (payload as Record<string, unknown>).guaranteed === true;
  if (typeof payload !== 'string' || payload === '') return false;
  try {
    const p: unknown = JSON.parse(payload);
    return !!p && typeof p === 'object' && (p as Record<string, unknown>).guaranteed === true;
  } catch {
    return false;
  }
}

export function toItemAwardRow(r: Record<string, unknown>): ItemAwardRow {
  return {
    id: num(r.id), bagId: num(r.item_id), awardId: num(r.award_id), type: num(r.type), count: Math.max(1, num(r.count)),
    rate: num(r.rate), quality: num(r.quality), guaranteed: guaranteedOf(r.payload),
  };
}

/** `randInt(min, max)` is inclusive on both ends. */
export function pickItemAwards(rows: readonly ItemAwardRow[], randInt: (min: number, max: number) => number): ItemAwardRow[] {
  const guaranteed = rows.filter((r) => r.guaranteed);
  const pool = rows.filter((r) => !r.guaranteed && r.rate > 0);
  if (pool.length === 0) return guaranteed;
  const maxWeight = Math.max(...pool.map((r) => Math.floor(r.rate)));
  let roll = maxWeight > 0 ? randInt(1, maxWeight) : 0;
  let eligible = pool.filter((r) => Math.floor(r.rate) >= roll);
  if (eligible.length === 0) {
    roll = 0;
    eligible = pool;
  }
  const target = eligible.length > 1 ? randInt(0, eligible.length - 1) : 0;
  return [...guaranteed, eligible[target] ?? pool[pool.length - 1]];
}

/** Inclusive integer draw from a [0, 1) RNG. */
export const randIntOf = (rng: () => number) => (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
