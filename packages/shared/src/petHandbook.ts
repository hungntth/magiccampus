// M12 client static data of the evolution windows: Sach Tien Hoa entries (data_tbl_creature_handbook + the creatures they point at)
// and the Khe Uoc level table (data_tbl_pet_contract). The rows live in the generated petHandbookData.ts (the client has no static
// table RPC, like PET_FEATHER_STEPS); this file holds the shapes, the series names and the pure lookups / text helpers.

import { PET_APTITUDE_KEYS, type PetAptitudeKey } from './pet.js';
import { PET_CONTRACT_MAX_LEVEL } from './petAdvanced.js';
import { PET_CONTRACT_TABLE, PET_HANDBOOK_ENTRIES } from './petHandbookData.js';

/** Creature facts a handbook card shows; `apt` follows PET_APTITUDE_KEYS (strength, agility, stamina, intelligence, energy). */
export interface PetHandbookCreature {
  name: string;
  /** icon_code as a string (resource codes are never numbers on the wire). */
  icon: string;
  apt: readonly number[];
}

/** One Sach Tien Hoa entry; `evolutionId` 0 = the pet cannot evolve. */
export interface PetHandbookDef {
  id: number;
  /** Series 1..10 (tab order of the Flash book). */
  classId: number;
  relateId: number;
  evolutionId: number;
  name: string;
  desc: string;
  /** Natural energy needed to activate (active_num1). */
  activeNum: number;
  /** Bonus a state-1 pet gets once the entry is active (0 = none). */
  propType: number;
  propNum: number;
  percent: boolean;
  creature: PetHandbookCreature;
  evolved: PetHandbookCreature | null;
}

/** One Khe Uoc level row: stones per attempt, exp to reach the level, bonus percent per type (index 0..3 = HP, speed, atk, matk). */
export interface PetContractDef {
  level: number;
  reqNum: number;
  reqExp: number;
  nums: readonly number[];
  extras: readonly number[];
}

/** Language.PET_HANDBOOK_PANEL_U[12..18, 110, 118, 120]: the series tabs (the Tong quan tab is the client's own). */
export const PET_HANDBOOK_SERIES_NAMES: Readonly<Record<number, string>> = {
  1: 'Hệ người', 2: 'Hệ dã thú', 3: 'Hệ thực vật', 4: 'Hệ máy', 5: 'Hệ ác ma', 6: 'Hệ long', 7: 'BOSS', 8: 'Hệ Đặc Biệt', 9: 'Thần Thú', 10: 'Thần Thú II',
};
export const PET_HANDBOOK_SERIES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Contract type 1..4 names (Language.PET_EVOLUTION_PANEL_U[59]). */
export const PET_CONTRACT_NAMES: Readonly<Record<number, string>> = { 1: 'HP', 2: 'Tốc độ', 3: 'Công VL', 4: 'Công MP' };

const handbookById = new Map<number, PetHandbookDef>(PET_HANDBOOK_ENTRIES.map((h) => [h.id, h]));
const contractByLevel = new Map<number, PetContractDef>(PET_CONTRACT_TABLE.map((c) => [c.level, c]));

export const petHandbookEntries = (): readonly PetHandbookDef[] => PET_HANDBOOK_ENTRIES;
export const petHandbookOf = (id: number): PetHandbookDef | undefined => handbookById.get(id);
export const petHandbookBySeries = (classId: number): PetHandbookDef[] => PET_HANDBOOK_ENTRIES.filter((h) => h.classId === classId);
/** The evolvable entry of a creature template (the pet's `tid` before it evolves). */
export const petHandbookByCreature = (tid: number): PetHandbookDef | undefined => PET_HANDBOOK_ENTRIES.find((h) => h.relateId === tid && h.evolutionId > 0);
export const petContractRowOf = (level: number): PetContractDef | undefined => contractByLevel.get(level);

/** Aptitude of a creature by key. */
export const handbookApt = (c: PetHandbookCreature, key: PetAptitudeKey): number => c.apt[PET_APTITUDE_KEYS.indexOf(key)] ?? 0;

/** Bonus percent of contract `type` (1..4) at `level` (0 = none); a hunter owner (`hunter`) also gets the extra column. */
export function contractBonusPercent(type: number, level: number, hunter = false): number {
  const row = level > 0 ? petContractRowOf(Math.min(level, PET_CONTRACT_MAX_LEVEL)) : undefined;
  if (!row) return 0;
  return Math.round(((row.nums[type - 1] ?? 0) + (hunter ? (row.extras[type - 1] ?? 0) : 0)) * 100) / 100;
}

/** Natural energy still missing for an entry given what is activated so far. */
export const handbookRemaining = (def: Pick<PetHandbookDef, 'activeNum'>, activedNum: number): number => Math.max(0, def.activeNum - activedNum);
