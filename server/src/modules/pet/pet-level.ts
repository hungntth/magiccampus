// Pure pet exp / level rules (Go owner-level-cap fix): cumulative exp, +5 points per gained level, capped at owner + 5.

import { PET_ATTR_POINTS_PER_LEVEL, PetLimits, petLevelOfExp, PET_LEVEL_EXP } from '@mc/shared';

export interface PetExpResult {
  exp: number;
  level: number;
  levelsGained: number;
  pointsGained: number;
}

/** Adds `gain` exp (negative / NaN counts as 0). At the top level the exp is clamped to the last table threshold. */
export function applyPetExp(exp: number, level: number, gain: number, ownerLevel: number = PetLimits.maxLevel): PetExpResult {
  const add = Number.isFinite(gain) && gain > 0 ? Math.floor(gain) : 0;
  const cap = Math.max(1, Math.min(PetLimits.maxLevel, Math.floor(ownerLevel) + 5));
  const top = PET_LEVEL_EXP[cap - 1];
  if (level > cap) return { exp, level, levelsGained: 0, pointsGained: 0 };
  const next = Math.min(top, exp + add);
  const newLevel = Math.max(level, Math.min(PetLimits.maxLevel, petLevelOfExp(next)));
  const levelsGained = newLevel - level;
  return { exp: next, level: newLevel, levelsGained, pointsGained: levelsGained * PET_ATTR_POINTS_PER_LEVEL };
}
