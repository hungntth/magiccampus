// Relive rules (M9 phase D, Go domain/standin): the map relive mode, the toSafe durability penalty and the doll-or-gold
// payment order. Pure.

import { ReliveMode } from '@mc/shared';

/** World-boss map (Go domainwb.DefaultMapID; the memory doc says 47, open question 3). H5 has no world boss yet. */
export const WORLD_BOSS_MAP_ID = 2006;
const MAP_DEAD_FREE = -1;
const MAP_PK_FORCED = 2;
export const PENALTY_MIN_LEVEL = 20;
/** Equipment template kind / position of fashion (dress) gear: never loses durability. */
export const DRESS_KIND = 11;
export const DRESS_POSITION = 21;

/** standin.ReliveMode: 3 on the world-boss map, 2 when data_tbl_map.dead == -1 or pk == 2, else 1. */
export function reliveMode(mapId: number, dead: number, pk: number): 1 | 2 | 3 {
  if (mapId === WORLD_BOSS_MAP_ID) return ReliveMode.GOLD;
  if (dead === MAP_DEAD_FREE || pk === MAP_PK_FORCED) return ReliveMode.FREE;
  return ReliveMode.DOLL;
}

/** ceil(20 % of the max durability), at least 1. */
export const durabilityLoss = (maxDurability: number): number => Math.max(1, Math.ceil(maxDurability * 0.2));

/** standin.ApplyLoss: the new durability, or null when nothing changes (no max, already 0). */
export function applyLoss(durability: number, maxDurability: number): number | null {
  if (maxDurability <= 0 || durability <= 0) return null;
  return Math.max(0, durability - durabilityLoss(maxDurability));
}

/** The 20 % penalty applies to toSafe on mode-1 maps from level 20. */
export const penaltyApplies = (mode: number, level: number): boolean => mode === ReliveMode.DOLL && level >= PENALTY_MIN_LEVEL;

export const isDress = (kind: number, position: number): boolean => kind === DRESS_KIND || position === DRESS_POSITION;

/** Seconds left of the mode-3 countdown since death (30 s window). */
export function goldReliveSecondsLeft(deathAt: Date | null, now: number, windowSec = 30): number {
  if (!deathAt) return 0;
  return Math.max(0, windowSec - Math.floor((now - deathAt.getTime()) / 1000));
}
