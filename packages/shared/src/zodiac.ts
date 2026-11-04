// Zodiac stars (Tinh Cung), M7 phase D. Flash names: beginStarLvUp(nextTemplateId), finishStarLvUp(starType), cancelStarLvUp(starType),
// speedUpStarLvUp(starType, useAll, num, itemId) -> {d, n}, addStarAddition(starType, num, itemId) (result by push onAddStarAddition),
// pmStarExchage(slotId, targetTemplateId, num, tempBagFlag) -> {flag, finalNum, finalNme, slotId}. `getStarsData` and `view` are H5.
// The addition tables are GamePredef.STAR_ADDITION_* (client and server share them through the functions below).

export const STAR = {
  TYPES: 12,
  MAX_LEVEL: 12,
  MIN_PLAYER_LEVEL: 80, // the Tinh Cung tab needs level 80 (CHARACTORPANEL_S[73])
  /** Hoa Tinh Tú (item type 551): the addition item. Speed-up / exchange items are 3315 + star type (3316..3327, type 552). */
  ADDITION_ITEM_ID: 3315,
  SPEED_ITEM_BASE: 3315,
  ADDITION_MAX: 5,
  ADDITION_STEP: 0.05,
  MAX_ITEMS_PER_TRY: 9999,
} as const;

export const STAR_NAMES = [
  'Bạch Dương', 'Kim Ngưu', 'Song Tử', 'Cự Giải', 'Sư Tử', 'Xử Nữ', 'Thiên Bình', 'Hổ Cáp', 'Nhân Mã', 'Ma Kết', 'Bảo Bình', 'Song Ngư',
] as const;

const BASIC_SUCCESS = [1, 0.045, 0.0225, 0.01125, 0.005625] as const;
const ADD_SUCCESS = [0, 0.015, 0.0075, 0.00375, 0.001875] as const;
const TIER_EDGES = [1, 2, 3, 4, 5] as const;
const BASIC_MONEY: Readonly<Record<number, number>> = {
  1: 300, 2: 4500, 3: 18000, 4: 1200, 5: 36000, 6: 18000, 7: 36000, 8: 36000, 9: 4500, 10: 1200, 11: 18000, 12: 9000,
};

export const isStarType = (t: number): boolean => Number.isInteger(t) && t >= 1 && t <= STAR.TYPES;
export const starSpeedItemId = (type: number): number => STAR.SPEED_ITEM_BASE + type;
export const isStarShardId = (id: number): boolean => Number.isInteger(id) && isStarType(id - STAR.SPEED_ITEM_BASE);

/** Tier of an addition: the first edge it does not exceed (1.0 -> 0, 1.05 -> 1, ... 5.0 -> 4); null at the cap. */
export function starAdditionTier(addition: number): number | null {
  if (addition >= STAR.ADDITION_MAX) return null;
  const i = TIER_EDGES.findIndex((edge) => addition <= edge);
  return i < 0 ? null : i;
}

/** Success chance of spending `qty` addition items at the current addition (client formula, GamePredef tables). */
export function starAdditionRate(addition: number, qty: number): number {
  const tier = starAdditionTier(addition);
  if (tier === null || !Number.isFinite(qty) || qty <= 0) return 0;
  return Math.min(1, BASIC_SUCCESS[tier] * qty + ADD_SUCCESS[tier]);
}

/** Silver charged for one try: round(BASIC_MONEY[type] * 20 * rate * addition). */
export function starAdditionCost(type: number, rate: number, addition: number): number {
  return Math.round((BASIC_MONEY[type] ?? 0) * 20 * rate * addition);
}

/** One star: `tid` = template row id of the CURRENT level (0 = level 0), `finishDate` = ms epoch while a level-up runs, else 0. */
export interface StarSlot {
  tid: number;
  level: number;
  addition: number;
  finishDate: number;
}

/** starsData: '1'..'12' -> slot (login snapshot and the reply of begin / finish / cancel). */
export type StarsData = Record<string, StarSlot>;

export interface StarSpeedUpResult {
  d: StarsData;
  n: number;
}

export interface StarExchangeResult {
  flag: boolean;
  finalNum?: number;
  finalNme?: string;
  slotId?: number;
}

/** onAddStarAddition push (Go shape): t star type, f success, n items consumed, d the slot after the try. */
export interface StarAdditionPush {
  t: number;
  f: boolean;
  n: number;
  d: StarSlot | null;
}

/** Template rows the panel shows for one star (current effect, next level requirements). */
export interface StarView {
  type: number;
  name: string;
  description: string;
  addProp: string;
  /** add_value of the current level times the addition (0 at level 0). */
  value: number;
  next: StarNextView | null;
}

export interface StarNextView {
  tid: number;
  level: number;
  value: number;
  reqLevel: number;
  reqMoney: number;
  reqSeconds: number;
  reqStarLevel: number;
}

/** H5 getStarsData reply: the map plus the server clock (finishDate is server time) and the panel view. */
export interface StarsPanel {
  stars: StarsData;
  now: number;
  total: number;
  view: Record<string, StarView>;
}

/** Display labels of the star effect props (data_tbl_stars_template.add_prop). */
export const STAR_PROP_LABELS: Readonly<Record<string, string>> = {
  hp: 'HP', attack: 'Công VL', mAttack: 'Công MP', defence: 'Phòng VL', mDefence: 'Phòng MP', speed: 'Tốc', hit: 'C.Xác',
  dodge: 'N.Tránh', critical: 'B.Kích', resiCritical: 'Kh.Bạo', debuffSuccRate: 'Tỉ lệ trạng thái', debuffResiRate: 'Kháng trạng thái',
};

/** "00:00:30" / "2:03:20" style countdown (hours not capped: the longest level takes 221 hours). */
export function starCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}
