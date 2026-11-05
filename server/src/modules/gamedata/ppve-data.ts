// Typed, cached views of the Khong Gian Dieu Khac tables: data_tbl_carve (Khac Van nodes), data_tbl_carve_award (per floor reward) and
// data_tbl_carve_master (master level bonuses), plus the 2060* enemy pool of the floors. Pure builders; GameDataService caches them.

import { PPVE_ENEMY_RES_PREFIX } from '../pet/pet-depth-constants';
import type { PetTemplate } from './pet-data';

type Raw = Record<string, unknown>;
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

/** One carve node: id = (part + 1) * 1000 + (icon + 1) * 100 + level; `pv` is the CUMULATIVE bonus of that prop in display units. */
export interface CarveRow {
  id: number;
  costKp: number;
  /** Prop type (1 hp, 4 / 5 attack, ... through the talent prop table). */
  prop: number;
  pv: number;
}

/** One floor reward (id = floor): `award` KP and one `itemId` on a win, `freeExchange` KP for the daily free exchange. */
export interface CarveAwardRow {
  floor: number;
  award: number;
  freeExchange: number;
  itemId: number;
}

/** Master level row (1..48): five (prop, value) pairs. */
export interface CarveMasterRow {
  mlv: number;
  props: readonly { prop: number; pv: number }[];
}

export interface PpveTables {
  carves: Map<number, CarveRow>;
  awards: Map<number, CarveAwardRow>;
  masters: Map<number, CarveMasterRow>;
  enemyPool: PetTemplate[];
}

/** The enemy pool: qLevel 1..3 creatures with a 2060* res code, sorted by id (Go ppveEnemyPool). */
export function ppveEnemyPool(templates: Iterable<PetTemplate>): PetTemplate[] {
  const out: PetTemplate[] = [];
  for (const t of templates) {
    if (t.qLevel >= 1 && t.qLevel <= 3 && t.resCode.startsWith(PPVE_ENEMY_RES_PREFIX)) out.push(t);
  }
  return out.sort((a, b) => a.id - b.id);
}

export function buildPpveTables(
  carveRows: readonly Raw[], awardRows: readonly Raw[], masterRows: readonly Raw[], templates: Iterable<PetTemplate> = [],
): PpveTables {
  const carves = new Map<number, CarveRow>();
  for (const r of carveRows) carves.set(num(r.id), { id: num(r.id), costKp: num(r.costkp), prop: num(r.p), pv: num(r.pv) });
  const awards = new Map<number, CarveAwardRow>();
  for (const r of awardRows) {
    awards.set(num(r.id), { floor: num(r.id), award: num(r.award), freeExchange: num(r.free_exchagne), itemId: num(r.item_id) });
  }
  const masters = new Map<number, CarveMasterRow>();
  for (const r of masterRows) {
    masters.set(num(r.id), { mlv: num(r.id), props: [1, 2, 3, 4, 5].map((i) => ({ prop: num(r[`p${i}`]), pv: num(r[`pv${i}`]) })) });
  }
  return { carves, awards, masters, enemyPool: ppveEnemyPool(templates) };
}
