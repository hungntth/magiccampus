// Pure gates of the offline exp claims (order follows Go offline_delegation.go: level, pet presence, binding, pet level gap, pet cap).

import { OFFLINE_MIN_LEVEL, OfflineCode, PetLimits } from '@mc/shared';

export interface OfflinePet {
  level: number;
  binded: number;
}

/** Error code of a character claim gate, or null when the level allows it. */
export function charClaimError(level: number): number | null {
  return level < OFFLINE_MIN_LEVEL ? OfflineCode.LEVEL : null;
}

/** Error code of a pet claim gate, or null when the battle pet may receive exp. */
export function petClaimError(charLevel: number, pet: OfflinePet | null): number | null {
  if (charLevel < OFFLINE_MIN_LEVEL) return OfflineCode.LEVEL;
  if (!pet) return OfflineCode.NO_PET;
  if (pet.binded !== 1) return OfflineCode.PET_NOT_BOUND;
  if (pet.level > charLevel + 5) return OfflineCode.PET_TOO_HIGH;
  if (pet.level >= PetLimits.maxLevel) return OfflineCode.PET_CAPPED;
  return null;
}
