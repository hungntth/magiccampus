// Gift-bag contents (data_tbl_item_award keyed by the bag's item_id, decision 11: bags are unpacked at grant time). Port of Go
// application/item/award_picker.go: payload.guaranteed rows always; the rest is one weighted pick (roll 1..maxRate, then a
// uniform pick among the rows whose rate >= roll), repeated for `payload.picks` distinct draws. `type` 29 item / 19 equipment /
// 12 pet / 30 currency / 31 exp / 33 title / 35 game currency. Row filters (effect_award_married.go, effect_award_class.go,
// effect_award_cost.go): payload.married, payload.class, payload.costGold. Pure.

export interface ItemAwardRow {
  id: number;
  bagId: number; // item_id
  awardId: number; // content template / currency id
  type: number;
  count: number;
  rate: number;
  quality: number; // pet grow rate for type 12, equipment colour source for 19 / 29
  preNameType: number;
  guaranteed: boolean;
  payload: Readonly<Record<string, unknown>>;
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** payload column: a JSON string in the seeds, an object when a loader already parsed it. */
export function parseAwardPayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload as Record<string, unknown>;
  if (typeof payload !== 'string' || payload === '') return {};
  try {
    const p: unknown = JSON.parse(payload);
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Go IsGuaranteed: a bool, or a non-zero number. */
function flagOf(v: unknown): boolean {
  return v === true || (typeof v === 'number' && v !== 0);
}

export function toItemAwardRow(r: Record<string, unknown>): ItemAwardRow {
  const payload = parseAwardPayload(r.payload);
  return {
    id: num(r.id), bagId: num(r.item_id), awardId: num(r.award_id), type: num(r.type), count: Math.max(1, num(r.count)),
    rate: num(r.rate), quality: num(r.quality), preNameType: num(r.pre_name_type), guaranteed: flagOf(payload.guaranteed), payload,
  };
}

/** Integer payload key (Go awardPayloadInt: JSON numbers only). */
export function payloadInt(row: Pick<ItemAwardRow, 'payload'>, key: string): number | null {
  const v = row.payload[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : null;
}

/** Rows kept for the opener's marriage state; rows without `payload.married` are never filtered. */
export function filterMarriedRows(rows: readonly ItemAwardRow[], married: boolean): ItemAwardRow[] {
  const gate = (r: ItemAwardRow): boolean | null => {
    const v = r.payload.married;
    if (typeof v === 'boolean') return v;
    return typeof v === 'number' ? v !== 0 : null;
  };
  if (!rows.some((r) => gate(r) !== null)) return [...rows];
  return rows.filter((r) => {
    const want = gate(r);
    return want === null || want === married;
  });
}

/** Rows kept for the opener's class (`payload.class`); null = class-gated rows exist but none match (refuse the bag). */
export function filterClassRows(rows: readonly ItemAwardRow[], classId: number): ItemAwardRow[] | null {
  const gated = rows.some((r) => typeof r.payload.class === 'number');
  if (!gated) return [...rows];
  const kept = rows.filter((r) => typeof r.payload.class !== 'number' || r.payload.class === classId);
  return kept.length === 0 ? null : kept;
}

/** Gold the bag asks for: the largest `payload.costGold` of its rows (0 = free). */
export function awardGoldCost(rows: readonly ItemAwardRow[]): number {
  let cost = 0;
  for (const r of rows) cost = Math.max(cost, payloadInt(r, 'costGold') ?? 0);
  return cost;
}

/** Distinct draws per open: the largest `payload.picks` among the pool rows (capped at the pool size, at least 1). */
function poolPicks(pool: readonly ItemAwardRow[]): number {
  let picks = 1;
  for (const r of pool) picks = Math.max(picks, payloadInt(r, 'picks') ?? 1);
  return Math.min(picks, pool.length);
}

/** One weighted draw: index into `pool`. */
function pickOne(pool: readonly ItemAwardRow[], randInt: (min: number, max: number) => number): number {
  const maxWeight = Math.max(...pool.map((r) => Math.floor(r.rate)));
  let roll = maxWeight > 0 ? randInt(1, maxWeight) : 0;
  let eligible = pool.filter((r) => Math.floor(r.rate) >= roll);
  if (eligible.length === 0) {
    roll = 0;
    eligible = [...pool];
  }
  const target = eligible.length > 1 ? randInt(0, eligible.length - 1) : 0;
  if (roll <= 0) return target;
  let seen = 0;
  for (let i = 0; i < pool.length; i++) {
    if (Math.floor(pool[i].rate) >= roll) {
      if (seen === target) return i;
      seen++;
    }
  }
  return pool.length - 1;
}

/** `randInt(min, max)` is inclusive on both ends. */
export function pickItemAwards(rows: readonly ItemAwardRow[], randInt: (min: number, max: number) => number): ItemAwardRow[] {
  const guaranteed = rows.filter((r) => r.guaranteed);
  let pool = rows.filter((r) => !r.guaranteed && Math.floor(r.rate) > 0);
  if (pool.length === 0) return guaranteed;
  const out = [...guaranteed];
  for (let n = poolPicks(pool); n > 0; n--) {
    const idx = pickOne(pool, randInt);
    out.push(pool[idx]);
    pool = [...pool.slice(0, idx), ...pool.slice(idx + 1)];
  }
  return out;
}

/** Inclusive integer draw from a [0, 1) RNG. */
export const randIntOf = (rng: () => number) => (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));

/** Equipment / item colour code from an award quality (Go EquipmentColorCodeFromQuality): (q + 4) / 5, clamped to 0..5. */
export function awardColorCode(quality: number): number {
  const q = Math.min(25, Math.max(0, Math.trunc(quality)));
  return q <= 0 ? 0 : Math.min(5, Math.floor((q + 4) / 5));
}
