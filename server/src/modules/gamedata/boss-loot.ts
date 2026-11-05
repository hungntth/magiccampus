// Boss registry and boss loot rows (M10 phase I): data_tbl_schedule_boss (the canonical boss key `nid`, tier, kind, daily twin) and
// data_tbl_boss_loot (rate on the 1/50000 scale, qty range, reward type <30 item / 30 basic currency / 31 exp / 35 game currency,
// tier_filter, source_filter, qid). Pure mappers + the row filter; InstanceDataService caches them.

import type { Row } from './gamedata.service';

export type BossSource = 'schedule' | 'daily';

export interface ScheduleBossRow {
  nid: number;
  name: string;
  mapId: number;
  level: number;
  kind: 'ground' | 'flying' | 'daily_only';
  tier: string;
  dailyBossId: number | null;
  active: boolean;
}

export interface BossLootRow {
  id: number;
  bossNid: number;
  itemId: number;
  quality: number;
  rate: number;
  qtyMin: number;
  qtyMax: number;
  bound: boolean;
  type: number;
  tierFilter: string | null;
  sourceFilter: string | null;
  questId: number;
  active: boolean;
}

const num = (v: unknown, d = 0): number => {
  const x = Number(v ?? d);
  return Number.isFinite(x) ? x : d;
};
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function toScheduleBossRow(r: Row): ScheduleBossRow {
  const kind = r.kind === 'flying' || r.kind === 'daily_only' ? r.kind : 'ground';
  const daily = r.daily_boss_id === null || r.daily_boss_id === undefined ? null : num(r.daily_boss_id);
  return {
    nid: num(r.nid), name: String(r.name ?? ''), mapId: num(r.map_id), level: num(r.level), kind, tier: String(r.tier ?? 'normal'),
    dailyBossId: daily, active: r.is_active !== false,
  };
}

export function toBossLootRow(r: Row): BossLootRow {
  const qtyMin = Math.max(1, num(r.qty_min, 1));
  return {
    id: num(r.id), bossNid: num(r.boss_nid), itemId: num(r.item_id), quality: num(r.quality), rate: num(r.rate),
    qtyMin, qtyMax: Math.max(qtyMin, num(r.qty_max, qtyMin)), bound: r.bound === true, type: num(r.type, 29),
    tierFilter: text(r.tier_filter), sourceFilter: text(r.source_filter), questId: num(r.qid), active: r.is_active !== false,
  };
}

/** Rows of one boss that can drop for a kill of this source and tier (active, tier / source filters). */
export function eligibleBossLoot(rows: readonly BossLootRow[], source: BossSource, tier: string): BossLootRow[] {
  return rows.filter((r) => r.active && (r.tierFilter === null || r.tierFilter === tier) && (r.sourceFilter === null || r.sourceFilter === source));
}
