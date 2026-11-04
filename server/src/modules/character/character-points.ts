// Pure rules for the free attribute points and the manual level-up (legacy leveling.go / change_property.go).

import { AUTO_LEVEL_CAP, LEVEL_EXP, MAX_LEVEL, type ChangePropertyArg } from '@mc/shared';
import type { AttrKey } from './character-stats';

const ARG_KEYS: readonly (readonly [keyof ChangePropertyArg, AttrKey])[] = [
  ['addStrength', 'str'], ['addAgility', 'agi'], ['addStamina', 'sta'], ['addIntelligence', 'int'], ['addEnergy', 'eng'],
];

/** Legacy ParseStatString: numeric strings / numbers truncate; "", garbage and negatives count as 0. */
export function parseStat(v: unknown): number {
  const n = typeof v === 'string' ? Number.parseInt(v, 10) : typeof v === 'number' ? Math.trunc(v) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Per-attribute point increments from the changeProperty object arg, or null when the arg is not an object. */
export function parseChangeProperty(arg: unknown): { add: Record<AttrKey, number>; total: number } | null {
  if (arg === null || typeof arg !== 'object' || Array.isArray(arg)) return null;
  const o = arg as Record<string, unknown>;
  const add: Record<AttrKey, number> = { str: 0, agi: 0, sta: 0, int: 0, eng: 0 };
  let total = 0;
  for (const [field, key] of ARG_KEYS) {
    add[key] = parseStat(o[field]);
    total += add[key];
  }
  return { add, total };
}

/** Cumulative exp needed to enter `level + 1`, or null at the level cap. */
export function expForNextLevel(level: number): number | null {
  if (level >= MAX_LEVEL || level >= LEVEL_EXP.length) return null;
  return LEVEL_EXP[level];
}

/** lvUp gate: the manual path only exists from the auto cap (20) up to the max level, with enough exp. */
export function canManualLevelUp(level: number, exp: number): boolean {
  if (level < AUTO_LEVEL_CAP) return false;
  const need = expForNextLevel(level);
  return need !== null && exp >= need;
}
