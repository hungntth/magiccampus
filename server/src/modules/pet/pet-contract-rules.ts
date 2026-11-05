// Pure Khe Uoc rules (Go application/petcontract): exp roll, level carry, the one / ten attempt loop with its stop rules and the
// stat bonus of a contract state. No Mongo, no Nest; randomness is injected (`roll` returns an integer 0..99).

import { PET_CONTRACT_KEYS, PET_CONTRACT_MAX_LEVEL } from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';
import type { PetContractRow } from '../gamedata/pet-depth-data';
import {
  CONTRACT_DOUBLE_EXP_PERCENT, CONTRACT_EXP_PER_ATTEMPT, CONTRACT_HUNTER_CLASS, CONTRACT_STONE_GOLD_PRICE, CONTRACT_TRIPLE_EXP_PERCENT,
} from './pet-depth-constants';

/** Exp of one attempt: x3 below the triple percent, x2 below triple + double, else the base. `roll` is an integer 0..99. */
export function contractExpGain(roll: number): number {
  if (roll < CONTRACT_TRIPLE_EXP_PERCENT) return CONTRACT_EXP_PER_ATTEMPT * 3;
  if (roll < CONTRACT_TRIPLE_EXP_PERCENT + CONTRACT_DOUBLE_EXP_PERCENT) return CONTRACT_EXP_PER_ATTEMPT * 2;
  return CONTRACT_EXP_PER_ATTEMPT;
}

export type ContractRowOf = (level: number) => Pick<PetContractRow, 'reqNum' | 'reqExp'> | undefined;

/** Adds exp and levels up while exp >= req_exp of the next level, carrying the remainder; level 50 holds exp 0. */
export function addContractExp(level: number, exp: number, gain: number, rowOf: ContractRowOf): { level: number; exp: number; leveled: boolean } {
  let lv = level;
  let e = exp + gain;
  let leveled = false;
  while (lv < PET_CONTRACT_MAX_LEVEL) {
    const row = rowOf(lv + 1);
    if (!row || e < row.reqExp) break;
    e -= row.reqExp;
    lv++;
    leveled = true;
  }
  if (lv >= PET_CONTRACT_MAX_LEVEL) return { level: PET_CONTRACT_MAX_LEVEL, exp: 0, leveled };
  return { level: lv, exp: e, leveled };
}

export interface ContractRunInput {
  level: number;
  exp: number;
  /** Da Khe Uoc in the bag. */
  stones: number;
  gold: number;
  autoBuy: boolean;
  /** contractPet (single) asks the client to confirm the gold use instead of buying silently. */
  confirmGold: boolean;
  attempts: number;
  rowOf: ContractRowOf;
  roll: () => number;
}

export interface ContractRun {
  level: number;
  exp: number;
  attempts: number;
  stonesUsed: number;
  goldSpent: number;
  /** > 0: short of stones with autoBuy and confirmGold, nothing was done: the client must confirm this gold amount. */
  needGold: number;
  leveled: boolean;
  /** Why zero attempts ran (null when at least one did, or needGold is set). */
  refusal: 'stones' | 'gold' | 'missingRow' | null;
}

/**
 * The attempt loop (Go petcontract.run): per attempt the stones come first, the rest is bought with gold when autoBuy is on.
 * Stops at level 50, when stones run out without autoBuy, or when gold runs out. Nothing is persisted here.
 */
export function runContract(input: ContractRunInput): ContractRun {
  const out: ContractRun = { level: input.level, exp: input.exp, attempts: 0, stonesUsed: 0, goldSpent: 0, needGold: 0, leveled: false, refusal: null };
  for (let i = 0; i < input.attempts && out.level < PET_CONTRACT_MAX_LEVEL; i++) {
    const row = input.rowOf(out.level + 1);
    if (!row) {
      if (out.attempts === 0) out.refusal = 'missingRow';
      break;
    }
    const use = Math.min(row.reqNum, input.stones - out.stonesUsed);
    const missing = row.reqNum - use;
    const price = missing * CONTRACT_STONE_GOLD_PRICE;
    if (missing > 0) {
      if (!input.autoBuy) break;
      if (input.confirmGold) return { ...out, level: input.level, exp: input.exp, needGold: price };
      if (input.gold - out.goldSpent < price) break;
    }
    out.stonesUsed += use;
    out.goldSpent += price;
    out.attempts++;
    const next = addContractExp(out.level, out.exp, contractExpGain(input.roll()), input.rowOf);
    out.level = next.level;
    out.exp = next.exp;
    out.leveled ||= next.leveled;
  }
  if (out.attempts === 0 && out.refusal === null) out.refusal = input.autoBuy ? 'gold' : 'stones';
  return out;
}

/** The persisted contract state of a character (`contractPet`): level and exp of a type. */
export function contractTrack(state: Readonly<Record<string, number>>, type: number): { key: string; level: number; exp: number } | null {
  const key = PET_CONTRACT_KEYS[type];
  if (!key) return null;
  return { key, level: Math.max(0, Math.trunc(Number(state[key] ?? 0)) || 0), exp: Math.max(0, Math.trunc(Number(state[`${key}Exp`] ?? 0)) || 0) };
}

/**
 * Stat bonus of a contract state (Go PetBonuses): each track at level L > 0 adds row[L].prop<type> by prop_num<type> percent, plus
 * extra_num<type> for a Tho San owner. Values are percent of the running stat (1 HP, 11 speed, 4 attack, 5 magic attack).
 */
export function contractBonuses(state: Readonly<Record<string, number>>, classId: number, rowAt: (level: number) => PetContractRow | undefined): Bonuses {
  const out = emptyBonuses();
  for (const type of [1, 2, 3, 4]) {
    const level = Math.min(contractTrack(state, type)?.level ?? 0, PET_CONTRACT_MAX_LEVEL);
    const p = level > 0 ? rowAt(level)?.props[type - 1] : undefined;
    if (!p || p.prop <= 0) continue;
    addProp(out, BUFF_PROP, p.prop, p.num + (classId === CONTRACT_HUNTER_CLASS ? p.extra : 0), true);
  }
  return out;
}
