// M12 client static tables of the guard / talent / pet stone windows (the client has no static-table RPC, like petHandbook.ts):
// row shapes + pure lookups here, the rows in the generated petBoostData.ts (tools/gen-pet-boost.ts). Icons are strings.

import { GUARD_CENTRE_COSTS, GUARD_CENTRE_SID } from './petBoost.js';
import { PET_GUARD_COST_ROWS, PET_STONE_ROWS, PET_STONE_SKILL_ROWS, PET_TALENT_ROWS } from './petBoostData.js';

/** [id, sid, lv, exp, upExp, p, propType, propVal, basicTid, name, desc, icon]: a data_tbl_pet_talent record (slot rows have exp 0). */
export type PetTalentRow = readonly [
  id: number, sid: number, lv: number, exp: number, upExp: number, p: number, propType: number, propVal: number, basicTid: number,
  name: string, desc: string, icon: string,
];
/** [id, name, icon, level, nextId, costSil, propType, propNum, energyFlag, energyId, resolveNum]: a data_tbl_pet_stone record. */
export type PetStoneRow = readonly [
  id: number, name: string, icon: string, level: number, nextId: number, costSil: number, propType: number, propNum: number,
  energyFlag: number, energyId: number, resolveNum: number,
];
/** [sid, lev, num, gold]: guard sid 1..4 at level lev, upgrade cost to the next level. */
export type PetGuardCostRow = readonly [sid: number, lev: number, num: number, gold: number];
/** [id, name, icon, description]: a skill of the changePetStoneEnergy pools. */
export type PetStoneSkillRow = readonly [id: number, name: string, icon: string, description: string];

export interface PetTalentDef {
  id: number;
  sid: number;
  lv: number;
  exp: number;
  upExp: number;
  /** Stone power (energy) added while inlaid. */
  p: number;
  propType: number;
  propVal: number;
  basicTid: number;
  name: string;
  desc: string;
  icon: string;
}

export interface PetStoneDef {
  id: number;
  name: string;
  icon: string;
  level: number;
  nextId: number;
  costSil: number;
  propType: number;
  propNum: number;
  energy: boolean;
  energyId: number;
  resolveNum: number;
}

export interface PetStoneSkillDef {
  id: number;
  name: string;
  icon: string;
  desc: string;
}

const talentDef = (r: PetTalentRow): PetTalentDef => ({
  id: r[0], sid: r[1], lv: r[2], exp: r[3], upExp: r[4], p: r[5], propType: r[6], propVal: r[7], basicTid: r[8], name: r[9], desc: r[10], icon: r[11],
});
const TALENTS = new Map<number, PetTalentDef>(PET_TALENT_ROWS.map((r) => [r[0], talentDef(r)]));
const SLOT_ROWS = new Map<number, PetTalentDef>();
for (const t of TALENTS.values()) if (t.exp === 0) SLOT_ROWS.set(t.sid * 10 + t.lv, t);

export const petTalentDef = (id: number): PetTalentDef | undefined => TALENTS.get(id);
/** Slot record (exp 0) of sid at level lv (0..5), the Flash slot icon / description / upgrade cost. */
export const petTalentSlotRow = (sid: number, lv: number): PetTalentDef | undefined => SLOT_ROWS.get(sid * 10 + lv);
/** A stone record: socket-11 sid, level >= 1, positive exp (the dissolve value), no upgrade cost. */
export const isTalentStone = (t: PetTalentDef | undefined): t is PetTalentDef => !!t && t.sid % 10000 === 11 && t.lv >= 1 && t.upExp === 0 && t.exp > 0;
/** Colour page (1..4) of a stone or slot record. */
export const talentPageOf = (sid: number): number => Math.floor(sid / 10000);

const STONES = new Map<number, PetStoneDef>(PET_STONE_ROWS.map((r) => [r[0], {
  id: r[0], name: r[1], icon: r[2], level: r[3], nextId: r[4], costSil: r[5], propType: r[6], propNum: r[7],
  energy: r[8] === 1, energyId: r[9], resolveNum: r[10],
}]));
export const petStoneDef = (id: number): PetStoneDef | undefined => STONES.get(id);

const STONE_SKILLS = new Map<number, PetStoneSkillDef>(PET_STONE_SKILL_ROWS.map((r) => [r[0], { id: r[0], name: r[1], icon: r[2], desc: r[3] }]));
export const petStoneSkillDef = (id: number): PetStoneSkillDef | undefined => STONE_SKILLS.get(id);

const GUARD_COSTS = new Map<number, { num: number; gold: number }>(PET_GUARD_COST_ROWS.map((r) => [r[1] * 10 + r[0], { num: r[2], gold: r[3] }]));
/** Upgrade cost at the CURRENT level (the centre uses the Flash table, a guard its data_tbl_pet_guard row); null at the cap / without a row. */
export function petGuardCost(sid: number, level: number): { num: number; gold: number } | null {
  if (sid === GUARD_CENTRE_SID) return GUARD_CENTRE_COSTS[level] ?? null;
  return GUARD_COSTS.get(level * 10 + sid) ?? null;
}
