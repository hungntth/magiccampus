// Typed, cached view of data_tbl_pet_stone (Tu Linh Bao Thach records) and the changePetStoneEnergy skill pools
// (data_tbl_skill rows with ex_stone_sid > 0). Pure builder; GameDataService caches the result at startup.

import type { PetStoneTemplate } from '@mc/shared';

type Raw = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface PetStoneTables {
  stones: Map<number, PetStoneTemplate>;
  /** type 1 pool: the base (passive) skill ids; type 2 pool: their ex_stone_sid targets that exist as skills. Sorted, unique. */
  passiveSkills: readonly number[];
  specialSkills: readonly number[];
}

export function buildPetStoneTables(stoneRows: readonly Raw[], exSkillRows: readonly Raw[], knownSkill: (id: number) => boolean): PetStoneTables {
  const stones = new Map<number, PetStoneTemplate>();
  for (const r of stoneRows) {
    const id = num(r.id);
    stones.set(id, {
      id, level: num(r.level), nextId: num(r.next_id), costSil: num(r.cost_sil), propType: num(r.prop_type),
      energyFlag: num(r.energy_flag) === 1, energyId: num(r.energy_id), resolveNum: num(r.resolve_num),
    });
  }
  const passive = new Set<number>();
  const special = new Set<number>();
  for (const r of exSkillRows) {
    const target = num(r.ex_stone_sid);
    if (target <= 0) continue;
    passive.add(num(r.id));
    if (knownSkill(target)) special.add(target);
  }
  const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);
  return { stones, passiveSkills: sorted(passive), specialSkills: sorted(special) };
}
