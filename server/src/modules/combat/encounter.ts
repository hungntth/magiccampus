// Random encounter rules (legacy combat/encounters.go): rate normalisation, enemy count and the spawn-row roll.
// Pure with an injectable RNG; the service supplies the map rows and applies the cooldown / safe-map checks.

import type { MapCreatureRow } from '../gamedata/combat-data';
import type { Rng } from './battle.types';

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

/** Solo enemy count: 1 or 2, capped by the number of distinct normal creature ids on the map. */
export function enemyCount(rows: readonly MapCreatureRow[], rng: Rng): number {
  const distinct = new Set(rows.map((r) => r.creatureId)).size;
  return Math.min(1 + Math.floor(rng() * 2), distinct);
}

/** rand * 100 against the [start_rate, end_rate) bands; no band matches -> a uniformly random row. */
export function pickRow(rows: readonly MapCreatureRow[], rng: Rng): MapCreatureRow {
  const roll = rng() * 100;
  const hit = rows.find((r) => roll >= r.startRate && roll < r.endRate);
  return hit ?? rows[Math.min(rows.length - 1, Math.floor(rng() * rows.length))];
}

/**
 * The spawn rows of one encounter, or null when it does not happen (rate 0, failed roll, no normal rows).
 * `rng()` is consumed in a fixed order: encounter roll, enemy count, then one band roll per enemy.
 */
export function rollEncounter(rawRate: number, rows: readonly MapCreatureRow[], rng: Rng): MapCreatureRow[] | null {
  const rate = normalizeEncounterRate(rawRate);
  if (rate <= 0 || rng() >= rate) return null;
  const pool = normalRows(rows);
  if (pool.length === 0) return null;
  const n = enemyCount(pool, rng);
  return Array.from({ length: n }, () => pickRow(pool, rng));
}
