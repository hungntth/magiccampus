// Pure Chien Thu Ho Ve (pet guard) rules, ported from Go application/pet/pet_guard*.go and Flash PetGuardPanel.getProp: slot
// keys, state normalisation, upgrade costs and the stat bonus of the centre pet (slot 0) and the four Chien Thu pets (slots 1..4).
// Hu Ve sub-pets (sid*10 + 1..5) never receive stats; they only raise the multipliers through their colour.

import {
  GUARD_CENTRE_COSTS, GUARD_CENTRE_MAX_LEVEL, GUARD_CENTRE_PER, GUARD_CENTRE_SID, GUARD_INNER_PER, GUARD_MAX_LEVEL, GUARD_MIN_PET_LEVEL,
  GUARD_SLOT_NAMES, guardMaxLevel, guardTokenKey, guardTokenName, type PetGuardData,
} from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { PetGuardRow } from '../gamedata/pet-depth-data';

// The constants below are shared with the client window (packages/shared/src/petBoost.ts); re-exported for the server callers.
export {
  GUARD_CENTRE_COSTS, GUARD_CENTRE_MAX_LEVEL, GUARD_CENTRE_PER, GUARD_CENTRE_SID, GUARD_INNER_PER, GUARD_MAX_LEVEL, GUARD_MIN_PET_LEVEL,
  GUARD_SLOT_NAMES, guardMaxLevel, guardTokenKey, guardTokenName,
};

export const GUARD_MIN_LEVEL = 1;
export const GUARD_CLASS_ID = 10;

export const GUARD_SLOT_KEYS: readonly string[] = [
  '0', '1', '2', '3', '4', '11', '12', '13', '14', '15', '21', '22', '23', '24', '25', '31', '32', '33', '34', '35', '41', '42', '43', '44', '45',
];
/** 0..4 are the centre and guards, 11..45 the five sub-pet slots of guard 1..4. */
export function guardSidAllowed(sid: number): boolean {
  if (!Number.isInteger(sid)) return false;
  if (sid >= 0 && sid <= 4) return true;
  return sid >= 11 && sid <= 45 && sid % 10 >= 1 && sid % 10 <= 5;
}

export function emptyGuard(): PetGuardData {
  return {
    lvData: Object.fromEntries(['0', '1', '2', '3', '4'].map((k) => [k, GUARD_MIN_LEVEL])),
    petData: Object.fromEntries(GUARD_SLOT_KEYS.map((k) => [k, 0])),
  };
}

/** Go normalizePetGuardState: every slot key present, levels clamped to [1, max] (a stored 0 heals to 1), pet ids >= 0. */
export function normalizeGuard(raw: Partial<PetGuardData> | undefined): PetGuardData {
  const out = emptyGuard();
  for (const key of Object.keys(out.lvData)) {
    const n = Number(raw?.lvData?.[key]);
    if (Number.isFinite(n)) out.lvData[key] = Math.max(GUARD_MIN_LEVEL, Math.min(guardMaxLevel(Number(key)), Math.trunc(n)));
  }
  for (const key of GUARD_SLOT_KEYS) {
    const n = Number(raw?.petData?.[key]);
    if (Number.isInteger(n) && n > 0) out.petData[key] = n;
  }
  return out;
}

/** Pet ids sitting in any guard slot (they cannot be traded, released, fused or eaten). */
export function guardedPetIds(state: PetGuardData): Set<number> {
  return new Set(Object.values(state.petData).filter((id) => id > 0));
}

/** Pet ids of slots 0..4: the only pets that receive stats (and need a refresh push when a guard changes). */
export function guardSlotPetIds(state: PetGuardData): number[] {
  return ['0', '1', '2', '3', '4'].map((k) => state.petData[k] ?? 0).filter((id) => id > 0);
}

/** Slot (0..4) the pet sits in, or -1 (sub-pets get no bonus). */
export function guardSlotOf(state: PetGuardData, petId: number): number {
  if (!(petId > 0)) return -1;
  for (let sid = 0; sid <= 4; sid++) if (state.petData[String(sid)] === petId) return sid;
  return -1;
}

export function isGuardable(classIds: readonly number[], useLevel: number): boolean {
  return classIds.includes(GUARD_CLASS_ID) && useLevel >= GUARD_MIN_PET_LEVEL;
}

/** Upgrade cost at the CURRENT level: the centre uses the Flash table, a guard its data_tbl_pet_guard row. Null when there is no row. */
export function guardUpgradeCost(sid: number, level: number, rowOf: (lev: number, sid: number) => PetGuardRow | undefined): { num: number; gold: number } | null {
  if (sid === GUARD_CENTRE_SID) return GUARD_CENTRE_COSTS[level] ?? null;
  const row = rowOf(level, sid);
  return row ? { num: row.num, gold: row.gold } : null;
}

export type GuardRowOf = (lev: number, sid: number) => PetGuardRow | undefined;
/** Colour 0..4 of the pet in a slot, or -1 when the pet is not a valid guard pet (counts as empty). */
export type GuardColorOf = (petId: number) => number;

/** Sum of the sub-pet inner percentages of guard `sid` (slots sid*10 + 1..5). */
export function guardInnerPercent(state: PetGuardData, sid: number, colorOf: GuardColorOf): number {
  let inner = 0;
  for (let slot = 1; slot <= 5; slot++) {
    const id = state.petData[String(sid * 10 + slot)] ?? 0;
    if (id <= 0) continue;
    const color = colorOf(id);
    if (color >= 0 && color < GUARD_INNER_PER.length) inner += GUARD_INNER_PER[color]!;
  }
  return inner;
}

function addRow(totals: Map<number, number>, row: PetGuardRow, multiplier: number): void {
  for (const { prop, val } of row.props) {
    if (prop <= 0 || val === 0) continue;
    totals.set(prop, (totals.get(prop) ?? 0) + (val / 10000) * multiplier);
  }
}

/** Centre pet: for each guard 1..4, row(lv, sid) x (1 + inner/100) x (1 + centre/100) x (1 + guard/100). */
export function computeGuardProps(state: PetGuardData, rowOf: GuardRowOf, colorOf: GuardColorOf): Map<number, number> {
  const totals = new Map<number, number>();
  const centre = GUARD_CENTRE_PER[state.lvData['0'] ?? 1] ?? 0;
  for (let sid = 1; sid <= 4; sid++) {
    const row = rowOf(state.lvData[String(sid)] ?? 1, sid);
    if (!row) continue;
    const inner = guardInnerPercent(state, sid, colorOf);
    const petId = state.petData[String(sid)] ?? 0;
    const color = petId > 0 ? colorOf(petId) : -1;
    const guard = color >= 0 ? color + 1 : 0;
    addRow(totals, row, (1 + inner / 100) * (1 + centre / 100) * (1 + guard / 100));
  }
  return totals;
}

/** Chien Thu pet in slot `sid` (1..4): its own row x (1 + inner/100); no centre or guard colour factor. */
export function computeGuardSidProps(state: PetGuardData, sid: number, rowOf: GuardRowOf, colorOf: GuardColorOf): Map<number, number> {
  const totals = new Map<number, number>();
  if (sid < 1 || sid > 4) return totals;
  const row = rowOf(state.lvData[String(sid)] ?? 1, sid);
  if (row) addRow(totals, row, 1 + guardInnerPercent(state, sid, colorOf) / 100);
  return totals;
}

/** Go petGuardDirectProps: flat stats. */
const FLAT_PROPS: ReadonlySet<number> = new Set([1, 4, 5, 6, 7, 11, 13]);
/** Go petGuardFloatProps keys; 59/60/62/63 are fractions in the panel and become percent points (x100). */
const RATE_PROPS: ReadonlySet<number> = new Set([14, 31, 61, 71, 72, 59, 60, 62, 63]);
const PERCENT_PROPS: ReadonlySet<number> = new Set([59, 60, 62, 63]);

/** Maps prop totals onto a Bonuses object (flats into `flat`, rates into `rates`). */
export function guardBonusesFromProps(totals: ReadonlyMap<number, number>): Bonuses {
  const out = emptyBonuses();
  for (const [prop, value] of totals) {
    if (value === 0) continue;
    if (FLAT_PROPS.has(prop)) addProp(out, BUFF_PROP, prop, value, false);
    else if (RATE_PROPS.has(prop)) addProp(out, BUFF_PROP, prop, PERCENT_PROPS.has(prop) ? value * 100 : value, false);
  }
  return out;
}

/** The bonus of the pet in slot `sid` (centre formula for 0, Chien Thu formula for 1..4), or null when the slot gets nothing. */
export function guardBonusOfSlot(state: PetGuardData, sid: number, rowOf: GuardRowOf, colorOf: GuardColorOf): Bonuses | null {
  const totals = sid === GUARD_CENTRE_SID ? computeGuardProps(state, rowOf, colorOf) : computeGuardSidProps(state, sid, rowOf, colorOf);
  return totals.size === 0 ? null : guardBonusesFromProps(totals);
}
