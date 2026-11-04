// Pure pet exp / level rules (Go pet.go gainExp, Flash PetLogic): exp is cumulative, level = largest L with
// exp >= PET_LEVEL_EXP[L - 1], +5 attribute points per level gained, no cap against the owner's level.

import { PET_ATTR_POINTS_PER_LEVEL, PetLimits, petLevelOfExp, PET_LEVEL_EXP } from '@mc/shared';

export interface PetExpResult {
  exp: number;
  level: number;
  levelsGained: number;
  pointsGained: number;
}

/** Adds `gain` exp (negative / NaN counts as 0). At the top level the exp is clamped to the last table threshold. */
export function applyPetExp(exp: number, level: number, gain: number): PetExpResult {
  const add = Number.isFinite(gain) && gain > 0 ? Math.floor(gain) : 0;
  const top = PET_LEVEL_EXP[PetLimits.maxLevel - 1];
  const next = Math.min(top, exp + add);
  const newLevel = Math.max(level, Math.min(PetLimits.maxLevel, petLevelOfExp(next)));
  const levelsGained = newLevel - level;
  return { exp: next, level: newLevel, levelsGained, pointsGained: levelsGained * PET_ATTR_POINTS_PER_LEVEL };
}
