// Pure rules of the Hộ Vệ window: which pets may sit in a slot, slot names, the upgrade cost / token line (gold fallback) and the
// multiplier percentages shown beside the cards. Mirrors the server (guard-rules.ts) through the constants in @mc/shared.

import {
  GUARD_CENTRE_PER, GUARD_INNER_PER, GUARD_MIN_PET_LEVEL, GUARD_SLOT_NAMES, guardMaxLevel, guardTokenKey, guardTokenName, petGuardCost,
  type Currencies, type PetGuardData, type PetView,
} from '@mc/shared';
import { petColor, petLevel } from '../petfunc/petFuncRules';

/** Sub-pet slots of guard 1..4 are sid * 10 + 1..5. */
export const SUB_SLOTS: readonly number[] = [1, 2, 3, 4, 5];
export const subSid = (guard: number, index: number): number => guard * 10 + index;

export function slotName(sid: number): string {
  if (sid <= 4) return GUARD_SLOT_NAMES[sid] ?? `Vị trí ${sid}`;
  return `${GUARD_SLOT_NAMES[Math.floor(sid / 10)] ?? 'Chiến Thú'} - Hộ Vệ ${sid % 10}`;
}

export const levelOf = (data: PetGuardData, sid: number): number => (sid <= 4 ? data.lvData[String(sid)] ?? 1 : 0);
export const petIdIn = (data: PetGuardData, sid: number): number => data.petData[String(sid)] ?? 0;

/** Thần thú (class 10) of use level >= 50 not already placed in another slot (PANEL_PETGUARD[10]). */
export function eligiblePets(pets: readonly PetView[], data: PetGuardData): PetView[] {
  const placed = new Set(Object.values(data.petData).filter((id) => id > 0));
  return pets.filter((p) => p.divine === true && p.useLv >= GUARD_MIN_PET_LEVEL && !placed.has(p.id));
}

export interface UpgradePlan {
  level: number;
  max: number;
  /** null at the cap or without a data row. */
  cost: { num: number; gold: number } | null;
  tokenName: string;
  have: number;
  enough: boolean;
}

export function upgradePlan(data: PetGuardData, sid: number, currencies: Currencies | undefined): UpgradePlan {
  const level = levelOf(data, sid);
  const max = guardMaxLevel(sid);
  const cost = level >= max ? null : petGuardCost(sid, level);
  const have = currencies?.[guardTokenKey(sid)] ?? 0;
  return { level, max, cost, tokenName: guardTokenName(sid), have, enough: cost !== null && have >= cost.num };
}

/** Σ inner percent of the five sub-pets of guard `guard` (they only raise the multipliers). */
export function innerPercent(data: PetGuardData, guard: number, pets: readonly PetView[]): number {
  let sum = 0;
  for (const i of SUB_SLOTS) {
    const pet = pets.find((p) => p.id === petIdIn(data, subSid(guard, i)));
    if (pet) sum += GUARD_INNER_PER[Math.min(petColor(pet), GUARD_INNER_PER.length - 1)] ?? 0;
  }
  return sum;
}

export const centrePercent = (data: PetGuardData): number => GUARD_CENTRE_PER[levelOf(data, 0)] ?? 0;
export const fmtPercent = (n: number): string => `${Math.round(n * 10000) / 10000}%`;
export const petCaption = (pet: PetView): string => `${pet.petName} Lv${petLevel(pet)}`;

/** State of a character that never opened the window (every level 1, no pets). */
export const emptyGuardData = (): PetGuardData => ({ lvData: { '0': 1, '1': 1, '2': 1, '3': 1, '4': 1 }, petData: {} });
