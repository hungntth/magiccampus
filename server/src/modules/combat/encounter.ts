// Random encounter rules (legacy combat/encounters.go): rate normalisation, enemy count and the spawn-row roll.
// Pure with an injectable RNG; the service supplies the map rows and applies the cooldown / safe-map checks.

import type { MapCreatureRow } from '../gamedata/combat-data';
import { BATTLE_ENEMY_SLOTS } from '@mc/shared';
import type { Rng } from './battle.types';
import { groupEnemyCount } from './roster';

export const ENCOUNTER_MIN_RATE = 0.3;
export const ENCOUNTER_MAX_RATE = 0.75;
export const ENCOUNTER_COOLDOWN_MS = 4000;

/** basic_battle_rate -> chance per cbom: <= 0 never, > 1 is per-mille, then clamped to [0.30, 0.75] (seeds hold 0 and 50). */
export function normalizeEncounterRate(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  const rate = raw > 1 ? raw / 1000 : raw;
  return Math.max(ENCOUNTER_MIN_RATE, Math.min(ENCOUNTER_MAX_RATE, rate));
}

/** Rows a random encounter may use: boss rows are excluded. */
export const normalRows = (rows: readonly MapCreatureRow[]): MapCreatureRow[] => rows.filter((r) => r.bossFlag === 0);

/** Enemy count by roster size (solo: 1 or 2), capped by the number of distinct normal creature ids on the map. */
export function enemyCount(rows: readonly MapCreatureRow[], rng: Rng, rosterSize = 1): number {
  return groupEnemyCount(rosterSize, new Set(rows.map((r) => r.creatureId)).size, rng);
}

/** rand * 100 against the [start_rate, end_rate) bands; no band matches -> a uniformly random row. */
export function pickRow(rows: readonly MapCreatureRow[], rng: Rng): MapCreatureRow {
  const roll = rng() * 100;
  const hit = rows.find((r) => roll >= r.startRate && roll < r.endRate);
  return hit ?? rows[Math.min(rows.length - 1, Math.floor(rng() * rows.length))];
}

/** Encounter book buffs (item use phase E): 313 no encounter, 314 every check starts one, 1365 fills the enemy side (1203 is client-driven). */
export const ENCOUNTER_BUFFS = { NONE: 313, CRAZY: 314, MEET_ON_STILL: 1203, FULL: 1365 } as const;

export interface EncounterMods {
  noEncounter: boolean;
  crazy: boolean;
  full: boolean;
}

export function encounterMods(buffIds: readonly number[]): EncounterMods {
  const has = (id: number): boolean => buffIds.includes(id);
  return { noEncounter: has(ENCOUNTER_BUFFS.NONE), crazy: has(ENCOUNTER_BUFFS.CRAZY), full: has(ENCOUNTER_BUFFS.FULL) };
}

/**
 * The spawn rows of one encounter, or null when it does not happen (rate 0, failed roll, no normal rows).
 * `rng()` is consumed in a fixed order: encounter roll, enemy count, then one band roll per enemy. A crazy encounter buff makes the
 * roll always succeed (maps with rate 0 still never encounter); a full roster buff fills every enemy slot of the board.
 */
export function rollEncounter(
  rawRate: number, rows: readonly MapCreatureRow[], rng: Rng, rosterSize = 1, mods: Pick<EncounterMods, 'crazy' | 'full'> = { crazy: false, full: false },
): MapCreatureRow[] | null {
  const rate = normalizeEncounterRate(rawRate);
  if (rate <= 0 || rng() >= (mods.crazy ? 1 : rate)) return null;
  const pool = normalRows(rows);
  if (pool.length === 0) return null;
  const n = mods.full ? BATTLE_ENEMY_SLOTS.length : enemyCount(pool, rng, rosterSize);
  return Array.from({ length: n }, () => pickRow(pool, rng));
}
