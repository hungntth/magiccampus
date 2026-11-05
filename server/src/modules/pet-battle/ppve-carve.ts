// Khac Van (carve rune) stat bonus of a pet (Go statfeature/pet_pve_carve.go): the sum of `pv` of every opened node in p.s0..s7 (cumulative
// per level, already in display units) per prop, plus the master level row (data_tbl_carve_master). The prop mapping is the Thien Phu one
// (flats 1 4..11 13, rates 31 32 58..63; 58 is applied as in the talent port). Applies only to pets fighting in the arena and PPVE.

import { addProp, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { CarveMasterRow, CarveRow } from '../gamedata/ppve-data';
import { TALENT_PROPS } from '../pet-boost/talent-rules';

export interface CarveState {
  p: Readonly<Record<string, readonly number[] | undefined>>;
  mlv: number;
}

/** Σ pv per prop over the opened nodes and the master row. */
export function carveTotals(
  state: CarveState, carve: (id: number) => CarveRow | undefined, master: (mlv: number) => CarveMasterRow | undefined,
): Map<number, number> {
  const totals = new Map<number, number>();
  const add = (prop: number, value: number): void => void (prop > 0 && value !== 0 ? totals.set(prop, (totals.get(prop) ?? 0) + value) : undefined);
  for (let part = 0; part < 8; part++) {
    for (const id of state.p[`s${part}`] ?? []) {
      const row = id > 0 ? carve(id) : undefined;
      if (row) add(row.prop, row.pv);
    }
  }
  const m = state.mlv > 0 ? master(state.mlv) : undefined;
  for (const pair of m?.props ?? []) add(pair.prop, pair.pv);
  return totals;
}

export function carveBonuses(
  state: CarveState, carve: (id: number) => CarveRow | undefined, master: (mlv: number) => CarveMasterRow | undefined,
): Bonuses {
  const out = emptyBonuses();
  for (const [prop, value] of carveTotals(state, carve, master)) addProp(out, TALENT_PROPS, prop, value, false);
  return out;
}

/** True when the bonuses change anything (a character with no opened node must not get a feature bucket: panel / battle parity). */
export function hasCarveBonus(b: Bonuses): boolean {
  return Object.keys(b.flat).length > 0 || Object.keys(b.pct).length > 0 || Object.keys(b.rates).length > 0 || Object.values(b.attr).some((v) => v !== 0);
}
