// M8 phase D prabuff ("Ma Pháp Bí Trận", Flash MagicArrayPanel): 8 element tracks x 30 levels. Flash names: getMagicArrayData(praType),
// addPracticeExp(praType, isGold); push updatePraView {praType, buff, exp, goldNum, elementNum, addExp?, critMulit?}. Level / exp tables are the
// client GamePredef constants (PLAYER_PARBUFF_*); costs and the crit roll are Go-assumed display values (recorded as such).

export const PRA_MAX_LEVEL = 30;
export const PRA_TRACKS = 8;
/** Cost of one practice action: 10 element points (tracks 1-4: elementPnt, 5-8: yijieElement) or 7 gold (Go assumption). */
export const PRA_ELEMENT_COST = 10;
export const PRA_GOLD_COST = 7;
/** Crit: 10 % chance of x2 exp (Go invented, isolated here to retune). */
export const PRA_CRIT_PERCENT = 10;
export const PRA_CRIT_MULTIPLIER = 2;

/** Cumulative exp that ends level i (reaching level i + 1). */
export const PRA_LEVEL_EXP: readonly number[] = [
  253, 753, 1495, 2474, 3684, 5122, 6782, 8659, 10750, 13050, 15555, 18261, 21164, 24260, 27546, 31017, 34672, 38505, 42514, 46696,
  51047, 55565, 60247, 65089, 70089, 75244, 80552, 86009, 91614, 97364,
];
/** Exp of one practice action while at level i. */
export const PRA_ADD_EXP: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 13, 14, 14, 14, 15, 15, 15, 16, 16, 16, 17, 17,
];
/** Effect in 1/100 percent by buff level 0..30 (PLAYER_PARBUFF_LEVEL_DEF_EFFECT: tracks 1-4). */
export const PRA_DEF_EFFECT: readonly number[] = [
  0, 6, 18, 36, 59, 87, 121, 159, 202, 250, 302, 359, 420, 485, 553, 625, 701, 780, 862, 947, 1034, 1125, 1217, 1312, 1409, 1508, 1609, 1712, 1815, 1920, 2026,
];
/** ATK / SPD tables (tracks 5-6 and 7-8). */
export const PRA_ATK_EFFECT: readonly number[] = [
  0, 6, 18, 36, 59, 87, 121, 159, 202, 250, 302, 359, 420, 485, 553, 625, 701, 780, 862, 947, 1060, 1173, 1315, 1493, 1694, 1927, 2186, 2485, 2812, 3150, 3500,
];

export type PraTarget = 'player' | 'pet';

export interface PraTrack {
  type: number;
  name: string;
  effect: string;
  target: PraTarget;
  /** which effect table */
  table: 'def' | 'atk';
  /** stat the player tracks feed (rate key, or the percent speed) */
  stat: 'finalReduceHurt1' | 'finalReduceHurt2' | 'finalEnhPhyHurt' | 'finalEnhMagicHurt' | 'speedPct';
  /** currency of the element cost */
  currency: 'elementPnt' | 'yijieElement';
}

/** Panel labels (MAGIC_ARRAY_PANEL_U) and the effect each track grants; tracks 2, 4, 6, 8 are pet effects (display only in H5). */
export const PRA_TRACK_LIST: readonly PraTrack[] = [
  { type: 1, name: 'Thủy', effect: 'Giảm sát thương vật lý', target: 'player', table: 'def', stat: 'finalReduceHurt1', currency: 'elementPnt' },
  { type: 2, name: 'Hỏa', effect: 'Giảm sát thương vật lý pet', target: 'pet', table: 'def', stat: 'finalReduceHurt1', currency: 'elementPnt' },
  { type: 3, name: 'Địa', effect: 'Giảm sát thương ma pháp', target: 'player', table: 'def', stat: 'finalReduceHurt2', currency: 'elementPnt' },
  { type: 4, name: 'Phong', effect: 'Giảm sát thương ma pháp pet', target: 'pet', table: 'def', stat: 'finalReduceHurt2', currency: 'elementPnt' },
  { type: 5, name: 'Ám', effect: 'Tăng sát thương vật lý', target: 'player', table: 'atk', stat: 'finalEnhPhyHurt', currency: 'yijieElement' },
  { type: 6, name: 'Quang', effect: 'Tăng sát thương ma pháp pet', target: 'pet', table: 'atk', stat: 'finalEnhMagicHurt', currency: 'yijieElement' },
  { type: 7, name: 'Kim', effect: 'Tăng tốc người', target: 'player', table: 'atk', stat: 'speedPct', currency: 'yijieElement' },
  { type: 8, name: 'Mộc', effect: 'Tăng tốc pet', target: 'pet', table: 'atk', stat: 'speedPct', currency: 'yijieElement' },
];

export const praTrack = (type: number): PraTrack | undefined => PRA_TRACK_LIST.find((t) => t.type === type);
export const validPraType = (type: number): boolean => Number.isInteger(type) && type >= 1 && type <= PRA_TRACKS;

/** Effect percent (e.g. 20.26) of a track at `level`. */
export function praEffectPercent(type: number, level: number): number {
  const t = praTrack(type);
  if (!t) return 0;
  const table = t.table === 'def' ? PRA_DEF_EFFECT : PRA_ATK_EFFECT;
  return (table[Math.max(0, Math.min(PRA_MAX_LEVEL, level))] ?? 0) / 100;
}

export interface PraState {
  level: number;
  exp: number;
}

/** Exp of one action at `level` (0 at the cap). */
export const praActionExp = (level: number): number => PRA_ADD_EXP[level] ?? 0;

/** Applies `gain` exp: level rises while exp reaches the level's cumulative threshold (Go AddPracticeExp). */
export function praAdvance(state: PraState, gain: number): PraState {
  let { level, exp } = state;
  exp += gain;
  while (level < PRA_MAX_LEVEL && exp >= PRA_LEVEL_EXP[level]) level++;
  return { level, exp };
}

/** One action's gain: base exp, doubled on a crit when `roll100` (0..99) is under the crit chance. */
export function praRollGain(level: number, roll100: number): { gain: number; crit: boolean } {
  const base = praActionExp(level);
  if (base <= 0) return { gain: 0, crit: false };
  return roll100 < PRA_CRIT_PERCENT ? { gain: base * PRA_CRIT_MULTIPLIER, crit: true } : { gain: base, crit: false };
}

/** getMagicArrayData / updatePraView payload. */
export interface PraView {
  praType: number;
  buff: number;
  exp: number;
  goldNum: number;
  elementNum: number;
  addExp?: number;
  critMulit?: boolean;
}
