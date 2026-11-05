// M12 pet training pure rules shared by server and client: fusion success table, growth roll bands (Go petgrow.Ranges),
// star success lookup and the Tay Luyen aptitude range. Randomness is injected (`rng` returns [0, 1)).

import { PET_GROWRATE_BANDS, PET_STAR_SUCCESS, petGrowColor } from './pet.js';

export type Rng = () => number;

/** GamePredef.PET_JOIN_SUCCESS, indexed by the MAIN pet's colour (0 white, 1 green, 2 blue, 3 purple); orange cannot fuse. */
export const PET_JOIN_SUCCESS: readonly number[] = [100, 80, 50, 30];
export const PET_JOIN_MATERIALS = 4;
/** Senior fusion: main colours allowed (blue, purple) and the maximum number of subs by colour (Go senior_join.go). */
export const SENIOR_JOIN_MAX_SUBS: Readonly<Record<number, number>> = { 2: 10, 3: 16 };

/** Go domain/petgrow Ranges (owner rule 2026-10-23), hundredths per colour: green 1.20-1.30 ... orange 2.01-2.50. */
export const PET_GROW_RANGES: readonly (readonly [number, number])[] = [[0, 0], [120, 130], [131, 160], [161, 200], [201, 250]];

/** petgrow.Roll: a growRate inside the band of `color` (clamped to green..orange) in 0.01 steps. */
export function petGrowRoll(color: number, rng: Rng): number {
  const [lo, hi] = PET_GROW_RANGES[Math.min(Math.max(color, 1), 4)];
  return (lo + Math.floor(rng() * (hi - lo + 1))) / 100;
}

/** Upper edge of the colour band a growRate sits in (rebirth cannot go above it). */
export const petGrowBandMax = (growRate: number): number => PET_GROWRATE_BANDS[petGrowColor(growRate)];

/** Next-star success percent: GamePredef.PET_STAR_SUCCESS is indexed by upgradeNum + 1 (Flash PetFuncPanel / Go star.go). */
export const petStarRate = (starNum: number): number => PET_STAR_SUCCESS[starNum + 1] ?? 0;

/** Tay Tuy Dan roll range around the creature aptitude: [round(t * 0.8), round(t * 1.2)] (Go petXsdRange). */
export function petXsdRange(template: number): [number, number] {
  return [Math.round(template * 0.8), Math.round(template * 1.2)];
}

/** Two-decimal rounding used for growRate / growRateAdd sums (Go roundGrow). */
export const roundGrow = (v: number): number => Math.round(v * 100) / 100;
