// Hành Lang Vô Tận floor tables (Go application/corridor config.go + lineups.go): the per-floor boss stat row (50M -> 1B HP), the minion
// shares, measured minion HP / MP, the fixed floor-1 level, the boss damage scale of floors 1-7, the AI kit scale / debuff hit per three
// floors and the 12 line-ups (boss + escorts + minions + a summon wave). Power is fixed per floor; the creature row gives name and art.

import { CORRIDOR } from '@mc/shared';

export const CORRIDOR_STAT_REFERENCE_LEVEL = 150;
export const CORRIDOR_SPEED_MULTIPLIER = 10;
export const CORRIDOR_BASE_DEFY = 60;
export const CORRIDOR_CLIENT_HP_CAP = 2_147_483_647;
export const CORRIDOR_MAX_ENEMIES = 10;
const LEVEL_DAMAGE_STEP = 0.02;

export interface FloorStats {
  hp: number;
  mp: number;
  attack: number;
  magicAttack: number;
  defense: number;
  magicDefense: number;
  speed: number;
  hit: number;
  dodge: number;
  critical: number;
}

const row = (hp: number, mp: number, attack: number, magicAttack: number, defense: number, magicDefense: number, speed: number, hit: number, dodge: number, critical: number): FloorStats =>
  ({ hp, mp, attack, magicAttack, defense, magicDefense, speed, hit, dodge, critical });

/** Boss row per floor (index = floor - 1). */
export const FLOOR_STAT_TABLE: readonly FloorStats[] = [
  row(50_000_000, 15_000_000, 126360, 165600, 133974, 633375, 5800, 1378, 480, 20),
  row(53_030_000, 1_250_000, 151630, 198720, 160770, 760050, 6030, 1388, 482, 22),
  row(56_230_000, 1_563_000, 181960, 238460, 192920, 912060, 6270, 1398, 484, 24),
  row(59_640_000, 1_953_000, 218350, 286160, 231510, 1094470, 6520, 1408, 486, 26),
  row(63_250_000, 2_441_000, 262020, 343390, 277810, 1313370, 6790, 1418, 488, 28),
  row(67_070_000, 3_052_000, 314420, 412070, 333370, 1576040, 7060, 1428, 490, 30),
  row(71_130_000, 3_815_000, 377310, 494480, 400040, 1891250, 7340, 1438, 492, 32),
  row(75_440_000, 4_768_000, 452770, 593370, 480050, 2269500, 7630, 1448, 494, 34),
  row(80_000_000, 5_960_000, 543320, 712050, 576060, 2723400, 7940, 1458, 496, 36),
  row(120_000_000, 7_451_000, 651990, 854460, 691280, 3268080, 8260, 1468, 498, 38),
  row(125_000_000, 9_313_000, 782390, 1025350, 829530, 3921690, 8590, 1478, 500, 40),
  row(1_000_000_000, 11_642_000, 938870, 1230420, 995440, 4706030, 8930, 1488, 502, 42),
];

export const bossStats = (floor: number): FloorStats | undefined => FLOOR_STAT_TABLE[floor - 1];

/** Minions take a share of the boss row (HP x0.4, MP x0.5, attack x0.5, defence x0.6, speed x0.9); hit / dodge / crit are the boss's. */
const SHARE = { hp: 0.4, mp: 0.5, attack: 0.5, defense: 0.6, speed: 0.9 } as const;
const MEASURED_MINION_HP: Readonly<Record<number, number>> = { 1: 25_000_000, 9: 36_000_000, 10: 15_000_000, 11: 12_000_000 };
const MEASURED_MINION_MP: Readonly<Record<number, number>> = { 1: 15_000_000 };

const part = (v: number, f: number): number => Math.trunc(v * f);

export function minionStats(floor: number): FloorStats | undefined {
  const b = bossStats(floor);
  if (!b) return undefined;
  return {
    ...b,
    hp: MEASURED_MINION_HP[floor] ?? part(b.hp, SHARE.hp),
    mp: MEASURED_MINION_MP[floor] ?? part(b.mp, SHARE.mp),
    attack: part(b.attack, SHARE.attack),
    magicAttack: part(b.magicAttack, SHARE.attack),
    defense: part(b.defense, SHARE.defense),
    magicDefense: part(b.magicDefense, SHARE.defense),
    speed: part(b.speed, SHARE.speed),
  };
}

/** Floors whose enemies show a fixed level instead of the party's highest (floor 1: the clip's "Cấp: 150 Boss"). */
export const floorLevel = (floor: number, partyLevel: number): number => (floor === 1 ? CORRIDOR_STAT_REFERENCE_LEVEL : partyLevel);

/** Boss attack / magic attack x1.2 on floors 1-7 (owner 2026-10-30). */
export const scaleBossDamage = (floor: number, attack: number): number => (floor >= 1 && floor <= 7 ? Math.floor(attack * 1.2 + 0.5) : attack);

/** The damage formula multiplies by 1 + 0.02 x attacker level; the stored attack is rescaled from level 150 so the damage stays the table value. */
export function attackForLevel(attack: number, level: number): number {
  const ref = 1 + LEVEL_DAMAGE_STEP * CORRIDOR_STAT_REFERENCE_LEVEL;
  const cur = 1 + LEVEL_DAMAGE_STEP * Math.max(1, level);
  return Math.floor((attack * ref) / cur + 0.5);
}

export interface FloorKit {
  chanceScale: number;
  debuffHit: number;
}

/** AI roll scale x2 / x2.5 / x3 / x3 and extra debuff landing points +0 / +10 / +20 / +30 per three floors (index = floor - 1). */
export const FLOOR_KITS: readonly FloorKit[] = [
  { chanceScale: 2, debuffHit: 0 }, { chanceScale: 2, debuffHit: 0 }, { chanceScale: 2, debuffHit: 0 },
  { chanceScale: 2.5, debuffHit: 10 }, { chanceScale: 2.5, debuffHit: 10 }, { chanceScale: 2.5, debuffHit: 10 },
  { chanceScale: 3, debuffHit: 20 }, { chanceScale: 3, debuffHit: 20 }, { chanceScale: 3, debuffHit: 20 },
  { chanceScale: 3, debuffHit: 30 }, { chanceScale: 3, debuffHit: 30 }, { chanceScale: 3, debuffHit: 30 },
];

export interface SummonWave {
  startRound: number;
  perRound: number;
  every: number;
  refill: boolean;
  hp?: number; // replaces the minion HP of the summoned units
  units: readonly number[];
}

export interface Lineup {
  name: string;
  boss: number;
  escorts: readonly number[];
  minions: readonly number[];
  summon?: SummonWave;
  /** HP of a creature as a fraction of the boss HP (clip tooltips of floors 3 and 5). */
  hpShare?: Readonly<Record<number, number>>;
}

const FLOOR3_CAPTAIN = 0.875;
const FLOOR3_GUARD = 0.75;
const FLOOR3_SOLDIER = 0.25;
const FLOOR5_MINION = 15 / 35;
/** Floor-1 Oseen / Halu re-summon pool (the original keeps summoning for the whole fight). */
const MARITA_POOL = 60;

const refillUnits = (cids: readonly number[], n: number): number[] => Array.from({ length: n }, (_, i) => cids[i % cids.length]);

/** Line-ups of maps 79-86 (floors 1-8; floors 9-12 reuse them through `floorLineup`). */
const LINEUPS: readonly Lineup[] = [
  { name: 'Marita', boss: 2042, escorts: [2043, 2044], minions: [],
    summon: { startRound: 1, perRound: 3, every: 1, refill: true, hp: 3_000_000, units: refillUnits([2046, 2045], MARITA_POOL) } },
  { name: 'Gnaw', boss: 2047, escorts: [2048, 2049], minions: [2050, 2051],
    summon: { startRound: 1, perRound: 3, every: 1, refill: false, units: [2052, 2053, 2052, 2053, 2052] } },
  { name: 'Celica', boss: 2078, escorts: [2079, 2081], minions: [2080, 2082, 2082, 2082, 2082, 2082, 2082],
    hpShare: { 2079: FLOOR3_GUARD, 2080: FLOOR3_GUARD, 2081: FLOOR3_CAPTAIN, 2082: FLOOR3_SOLDIER } },
  { name: 'Sethia', boss: 2083, escorts: [2084, 2085], minions: [2086, 2086, 2087, 2087, 2087, 2087, 2087] },
  { name: 'Brunswald', boss: 2088, escorts: [2089, 2090], minions: [2093, 2093, 2091, 2092, 2091, 2092, 2089],
    hpShare: { 2089: FLOOR5_MINION, 2090: FLOOR5_MINION, 2091: FLOOR5_MINION, 2092: FLOOR5_MINION, 2093: FLOOR5_MINION } },
  { name: 'Alvit', boss: 2094, escorts: [2099, 2100], minions: [2095, 2096, 2097, 2098, 2101, 2102, 2095] },
  { name: 'Frya', boss: 2103, escorts: [2104, 2105], minions: [2107, 2108, 2109, 2110, 2111, 2112, 2113] },
  { name: 'Lucan', boss: 2054, escorts: [2056, 2057], minions: [2055, 2058, 2059, 2060, 2061, 2062, 2063] },
];

const FLOOR_LINEUPS: Readonly<Record<number, Lineup>> = {
  9: { name: 'Kiếm Thánh', boss: 2192, escorts: [2194, 2195], minions: [],
    summon: { startRound: 1, perRound: 6, every: 1, refill: false, units: [2193, 2193, 2193, 2193, 2193, 2193, 2193] } },
  10: { name: 'Triệu Hồi Gilamesh', boss: 2182, escorts: [], minions: [2185, 2191, 2184, 2186, 2183, 2189, 2190, 2187, 2188] },
  11: { name: 'Quân Thần', boss: 2240, escorts: [], minions: [],
    summon: { startRound: 1, perRound: 9, every: 1, refill: false, units: [2241, 2242, 2241, 2242, 2243, 2245, 2241, 2242, 2244] } },
};

export function floorLineup(floor: number): Lineup | undefined {
  if (!Number.isInteger(floor) || floor < 1 || floor > CORRIDOR.FLOORS) return undefined;
  return FLOOR_LINEUPS[floor] ?? LINEUPS[(floor - 1) % CORRIDOR.MAPS];
}

/** HP of a minion: the lineup's share of the boss HP when the clip gave one, else the floor's minion row. */
export function minionHp(floor: number, cid: number): number {
  const share = floorLineup(floor)?.hpShare?.[cid] ?? 0;
  const boss = bossStats(floor);
  if (share > 0 && boss) return Math.max(Math.trunc(boss.hp * share), 1);
  return minionStats(floor)?.hp ?? 0;
}
