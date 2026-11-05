// M12 pet depth shared tables and pure rules: Khe Uoc wire reply / constants, handbook series bonus (GamePredef PET_SERIE_PROP),
// advanced fusion rates + item cost (ADVANCED_JOIN_PROBABILITY / NUMBER_ITEM_ADVANCED_JOIN) and the Ao Hoa (petEat) success rate
// (Flash PetFuncPanel.setEatInfo = Go application/pet/illusion.go). No Node APIs; randomness is never drawn here.

import { petGrowColor } from './pet.js';

// --- Khe Uoc (contractPet / contractPetTen / ensureBuyContractPet) ---

/** Reply of the three contract RPCs (Flash onContractPet / onContractPetTen read type, newLvl, newExp). */
export interface PetContractReply { type: number; newLvl: number; newExp: number; }
/** Item template of Da Khe Uoc. */
export const PET_CONTRACT_STONE_ITEM = 4979;
export const PET_CONTRACT_MAX_LEVEL = 50;
/** GamePredef.CONTRACT_DICT: contract type -> key of the `contractPet` character state. */
export const PET_CONTRACT_KEYS: Readonly<Record<number, 'hp' | 'speed' | 'physics' | 'magic'>> = { 1: 'hp', 2: 'speed', 3: 'physics', 4: 'magic' };

// --- Sach Tien Hoa series bonus ---

export interface PetPropBonus { propType: number; propNum: number; percent: boolean; }

/** GamePredef.as:10275 PET_SERIE_PROP, indexed by the handbook `class_id` (series 1..8); a fully activated series adds all three. */
export const PET_SERIE_PROP: Readonly<Record<number, readonly PetPropBonus[]>> = {
  1: [{ propType: 5, propNum: 480, percent: false }, { propType: 13, propNum: 1, percent: false }, { propType: 11, propNum: 240, percent: false }],
  2: [{ propType: 13, propNum: 1, percent: false }, { propType: 4, propNum: 600, percent: false }, { propType: 11, propNum: 240, percent: false }],
  3: [{ propType: 32, propNum: 1, percent: false }, { propType: 5, propNum: 480, percent: false }, { propType: 1, propNum: 2400, percent: false }],
  4: [{ propType: 11, propNum: 240, percent: false }, { propType: 1, propNum: 2400, percent: false }, { propType: 58, propNum: 1, percent: false }],
  5: [{ propType: 58, propNum: 1, percent: false }, { propType: 1, propNum: 2400, percent: false }, { propType: 11, propNum: 240, percent: false }],
  6: [{ propType: 58, propNum: 1, percent: false }, { propType: 32, propNum: 1, percent: false }, { propType: 1, propNum: 2400, percent: false }],
  7: [{ propType: 13, propNum: 2, percent: false }, { propType: 5, propNum: 480, percent: false }, { propType: 4, propNum: 600, percent: false }],
  8: [{ propType: 32, propNum: 2, percent: false }, { propType: 5, propNum: 480, percent: false }, { propType: 4, propNum: 600, percent: false }],
};

/** Gold per remaining Natural Energy point of the VIP quick activation (Go pethandbook GoldRate). */
export const PET_HANDBOOK_GOLD_RATE = 5;
/** Go pethandbook.GoldCost: ceil(remaining / 5) gold. */
export const petHandbookGoldCost = (remaining: number): number => (remaining <= 0 ? 0 : Math.ceil(remaining / PET_HANDBOOK_GOLD_RATE));

// --- Dung hop cao cap (seniorPetJoin) ---

/** Noi Don Tinh Linh. */
export const SENIOR_JOIN_ITEM = 3014;
export const SENIOR_JOIN_MIN_SUBS = 4;
/** GamePredef.as:9915 ADVANCED_JOIN_PROBABILITY[mainColour][subCount]. */
export const ADVANCED_JOIN_PROBABILITY: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  2: { 4: 50, 5: 53, 6: 58, 7: 65, 8: 74, 9: 85, 10: 100 },
  3: { 4: 30, 5: 33, 6: 36, 7: 40, 8: 44, 9: 49, 10: 54, 11: 60, 12: 66, 13: 73, 14: 81, 15: 90, 16: 100 },
};
/** GamePredef NUMBER_ITEM_ADVANCED_JOIN: blue needs 1 Noi Don in total, purple 2 per sub pet. */
export const SENIOR_JOIN_ITEM_NEED: Readonly<Record<number, number>> = { 2: 1, 3: 2 };

/** Success percent of a senior fusion; 100 when the table has no entry (the client's isNaN rule). */
export const seniorJoinRate = (color: number, subCount: number): number => ADVANCED_JOIN_PROBABILITY[color]?.[subCount] ?? 100;
/** Noi Don Tinh Linh a senior fusion consumes (purple scales with the sub count). */
export const seniorJoinItemCost = (color: number, subCount: number): number =>
  color === 3 ? (SENIOR_JOIN_ITEM_NEED[3] ?? 0) * subCount : (SENIOR_JOIN_ITEM_NEED[color] ?? 0);

// --- Ao Hoa (petEat) ---

/** Da May Man: type 507 `prop_type` 7 (Tim 2325 purple subs only, Cam 2326 both). */
export const PET_EAT_LUCK_PROP_TYPE = 7;
export const PET_EAT_MIN_COLOR = 3;
export const PET_EAT_ORANGE_COLOR = 4;
export const PET_EAT_MAX_LUCK = 5;
/** Percent points one Da May Man adds. */
export const PET_EAT_LUCK_RATE = 20;
export const PET_EAT_SAME_RACE_BONUS = 0.2;
/** setEatInfo single-pet rates keyed colour * 100 + 1 (than thu) / 2 (other pets). */
const PET_EAT_SINGLE_RATES: Readonly<Record<number, number>> = { 301: 0.15, 302: 0.10, 401: 0.30, 402: 0.15 };

export interface PetEatPet { growRate: number; divine: boolean; classId: number; }

export const petEatSingleRate = (pet: PetEatPet): number => PET_EAT_SINGLE_RATES[petGrowColor(pet.growRate) * 100 + (pet.divine ? 1 : 2)] ?? 0;

/** Rate in percent before luck: both pets' rates, +0.20 for the same race else halved. */
export function petEatBaseRate(main: PetEatPet, sub: PetEatPet): number {
  const sum = petEatSingleRate(main) + petEatSingleRate(sub);
  return (main.classId === sub.classId ? sum + PET_EAT_SAME_RACE_BONUS : sum / 2) * 100;
}

/**
 * Final percent and the number of luck stones really used: each stone is +20 %, at most 5, and stones are dropped one by
 * one while the total stays >= 120 (as the client does); the result is capped at 100 and rounded to 0.1.
 */
export function petEatRate(base: number, luckStones: number): { rate: number; luck: number } {
  let luck = Math.min(Math.max(Math.trunc(luckStones) || 0, 0), PET_EAT_MAX_LUCK);
  let total = base + luck * PET_EAT_LUCK_RATE;
  while (total >= 120 && luck > 0) {
    luck--;
    total -= PET_EAT_LUCK_RATE;
  }
  if (total > 100) total = 100;
  return { rate: Math.round(total * 10) / 10, luck };
}
