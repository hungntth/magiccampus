// M12 pet-equipment upgrade constants, reply types and pure cost / rate helpers (Thang cap, Doi mau, Doi khoa, Tai thiet lap).
// Tables are GamePredef LEVELUP_REQ_NUM / SPEC_LEVELUP_REQ_NUM / MODCOLOR_REQ_NUM / SPEC_MODCOLOR_REQ_NUM / MODBIND_REQ_NUM /
// MODPRE_REQ_NUM (1790-1940); positions 56-57 ("spec" gear) use the Flash spec tables (plan decision 3.7), not the Go multiplier.

import { qualityMultiplier } from './forge.js';
import type { BagItem } from './inventory.js';

export const PET_EQUIP_SHARD_ITEM = 2333;
export const PET_EQUIP_SPECIAL_SHARD_ITEM = 2529;
export const PET_EQUIP_BIND_ITEM = 2809;
export const PET_EQUIP_PRE_ITEM = 3491;
/** MONEY_EQUFUNC_ELEMENT: silver for a bind / pre preview. */
export const PET_EQUIP_MOD_MONEY = 30000;
/** Bind percentage cap of a main line (Go BindPropMaxPercent). */
export const PET_EQUIP_BIND_PERCENT_MAX = 30;
export const PET_EQUIP_MAX_COLOR = 4;
export const PET_EQUIP_SPECIAL_POS_BEGIN = 56;
export const PET_EQUIP_SPECIAL_POS_END = 57;
/** Pre (Tai thiet lap) needs a purple or orange piece. */
export const PET_EQUIP_PRE_MIN_COLOR = 3;

/** Requirement level of the piece being upgraded (its current template) -> pet upgrade shard count (item 2333). */
export const PET_EQUIP_LEVELUP_SHARDS: Readonly<Record<number, number>> = {
  40: 5, 60: 10, 80: 15, 100: 20, 120: 25, 140: 50, 160: 50,
};
/** Positions 56/57 use the special shard (2529) schedule; no 160 entry, so a level-160 spec piece cannot be upgraded. */
export const PET_EQUIP_SPECIAL_LEVELUP_SHARDS: Readonly<Record<number, number>> = {
  40: 5, 60: 10, 80: 15, 100: 20, 120: 25, 140: 30,
};
export const PET_EQUIP_COLOR_STEPS = [
  { itemId: 2334, num: 1, rate: 80 }, { itemId: 2334, num: 2, rate: 50 },
  { itemId: 2334, num: 4, rate: 30 }, { itemId: 2335, num: 8, rate: 20 },
] as const;
export const PET_EQUIP_SPECIAL_COLOR_NUM = [1, 2, 4, 6] as const;
/** MODBIND_REQ_NUM: requirement level -> item 2809 count (there is no level 60 entry). */
export const PET_EQUIP_BIND_SHARDS: Readonly<Record<number, number>> = { 40: 1, 80: 2, 100: 4, 120: 8, 140: 16, 160: 24 };
/** MODPRE_REQ_NUM: display colour -> item 3491 count. */
export const PET_EQUIP_PRE_SHARDS: Readonly<Record<number, number>> = { 3: 1, 4: 4 };

export interface PetEquipMaterialPlan {
  itemId: number;
  num: number;
}

export const isSpecialPetEquipPosition = (position: number): boolean =>
  position >= PET_EQUIP_SPECIAL_POS_BEGIN && position <= PET_EQUIP_SPECIAL_POS_END;

/** Go specPetEquPiped: a reqClassId written as "|..|". Spec bind / pre counts are x4 for it, x2 otherwise. */
export const isPipedReqClassId = (raw: unknown): boolean => {
  const s = String(raw ?? '');
  return s.startsWith('|') && s.endsWith('|');
};
const specMultiplier = (piped: boolean): number => (piped ? 4 : 2);

/** The legacy silver fee for pet tier-up and recolour (reqLevel of the next / current template). */
export function petEquipUpgradeSilver(reqLevel: number): number {
  const level = Math.max(1, Math.trunc(reqLevel));
  return level * level * 10;
}

/** Shards for a tier-up from a piece whose requirement level is `reqLevel`; null when the schedule has no entry. */
export function petEquipLevelUpPlan(reqLevel: number, special: boolean): PetEquipMaterialPlan | null {
  const num = (special ? PET_EQUIP_SPECIAL_LEVELUP_SHARDS : PET_EQUIP_LEVELUP_SHARDS)[Math.trunc(reqLevel)];
  return num === undefined ? null : { itemId: special ? PET_EQUIP_SPECIAL_SHARD_ITEM : PET_EQUIP_SHARD_ITEM, num };
}

/** Required shard and success rate for a colour 0..3, or null when already at the cap. */
export function petEquipColorPlan(color: number, special: boolean): { itemId: number; num: number; rate: number } | null {
  const step = PET_EQUIP_COLOR_STEPS[Math.trunc(color)];
  if (!step) return null;
  return { itemId: special ? 2528 : step.itemId, num: special ? PET_EQUIP_SPECIAL_COLOR_NUM[Math.trunc(color)] : step.num, rate: step.rate };
}

/** Doi khoa material: item 2809 x table[reqLevel], spec gear multiplied (Go petEquSpecNeed). */
export function petEquipBindPlan(reqLevel: number, special: boolean, piped: boolean): PetEquipMaterialPlan | null {
  const num = PET_EQUIP_BIND_SHARDS[Math.trunc(reqLevel)];
  return num === undefined ? null : { itemId: PET_EQUIP_BIND_ITEM, num: special ? num * specMultiplier(piped) : num };
}

/** Tai thiet lap material: item 3491 x table[colour]; null below purple. */
export function petEquipPrePlan(color: number, special: boolean, piped: boolean): PetEquipMaterialPlan | null {
  const num = PET_EQUIP_PRE_SHARDS[Math.trunc(color)];
  return num === undefined ? null : { itemId: PET_EQUIP_PRE_ITEM, num: special ? num * specMultiplier(piped) : num };
}

/** Display colour of a pet piece: the item colour clamped to 0..4. */
export const petEquipColor = (colorCode: number): number => Math.min(PET_EQUIP_MAX_COLOR, Math.max(0, Math.trunc(colorCode) || 0));

/** Line multiplier of a display colour (EQUIPT_QUALITY at colour x 5: 1, 1.25, 1.5, 2.1, 3.5). */
export const petGearColorMultiplier = (color: number): number => qualityMultiplier(petEquipColor(color) * 5);

/** Template line value scaled by the display colour (Go ScalePetGearValue, rounded). */
export function scalePetGearValue(base: number, color: number): number {
  return base === 0 ? 0 : Math.round(base * petGearColorMultiplier(color));
}

/** Bind roll ceiling ("Toi da" of the pre panel): round(bindPropNum x colour multiplier) capped at 30; 0 = no bind roll. */
export function petEquipBindMax(bindPropNum: number, color: number): number {
  if (!(bindPropNum > 0)) return 0;
  return Math.min(PET_EQUIP_BIND_PERCENT_MAX, Math.max(0, Math.round(bindPropNum * petGearColorMultiplier(color))));
}

/** The two bind percentages: uniform 1..max for a main line that exists, 0 for an empty main line (`rng` in [0, 1)). */
export function rollPetEquipBind(max: number, mainProp1: number, mainProp2: number, rng: () => number): [number, number] {
  const roll = (prop: number): number => (prop > 0 && max > 0 ? 1 + Math.floor(rng() * max) : 0);
  return [roll(mainProp1), roll(mainProp2)];
}

/** Bind bonus of a main line: value x percent / 100 (integer), only for bound gear (Go BindPropBonus). */
export function petGearBindBonus(bound: boolean, scaledMain: number, percent: number): number {
  const pct = Math.min(PET_EQUIP_BIND_PERCENT_MAX, Math.max(0, Math.trunc(percent) || 0));
  return !bound || scaledMain <= 0 || pct <= 0 ? 0 : Math.trunc((scaledMain * pct) / 100);
}

/** petEquLevelUp reply (Flash onPetEquLevelUp): num = shards left, next = the following nextEquTid or -1. */
export interface PetEquLevelUpReply {
  flag: boolean;
  msg?: string;
  i?: number;
  tid?: number;
  sid?: number;
  next?: number;
  num?: number;
}

/** petEquModColor reply (Flash onPetEquModColor): c = new colour, num = shards spent (also on failure). */
export interface PetEquModColorReply {
  flag: boolean;
  msg?: string;
  i?: number;
  c?: number;
  sid?: number;
  num: number;
}

/** petEquModBind preview: b1/b2 current and b11/b12 rolled bind percentages, ii/n = material slot and what is left in it. */
export type PetEquBindPreview =
  | { f: false }
  | { f: true; ii: number; n: number; b1: number; b2: number; b11: number; b12: number };
/** petEquModPre preview: full instance DTOs before and after (newIns carries the rolled bind values). */
export type PetEquPrePreview =
  | { f: false }
  | { f: true; i: number; ii: number; n: number; oldIns: BagItem; newIns: BagItem };
/** surepetEquModBind reply. */
export type SurePetEquBindReply = { f: 'false' } | { f: 'sure'; b1: number; b2: number };
/** surePetEquModPre reply. */
export type SurePetEquPreReply = { f: 'false' } | { f: 'sure'; n: BagItem };

/** sublimePetEquip / restrainPetEquip reply (Flash onSublimePetEquip / onRestrainPetEquip): flag JSON and the dust slot's stack left. */
export interface PetEquSublimeReply {
  itemId: number;
  flagStr: string;
  num: number;
}
