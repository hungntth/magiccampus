// Mê Trận tuning (Go application/maze/config.go, copied as-is): costs, rates, creatures, door points, texts. One place for every
// number of the feature (plan decision 19). Wire constants shared with the client live in @mc/shared maze.ts.

import { MAZE_BUY_COST_GOLD } from '@mc/shared';

export const MAZE = {
  DAILY_ENTRIES: 1,
  FREE_REFRESH_PER_DAY: 0,
  REFRESH_COST_GOLD: 5,
  BUY_COST_GOLD: MAZE_BUY_COST_GOLD,
  START_ACT: 25,
  START_SKIP: 3,
  START_RECOVER: 3,
  EMPTY_CELL_RATE: 0.25,
  HP_EVENT_PERCENT: 20,
  DIARY_TASK: 36,
  LOTTERY_PLAN: '3-1260',
  BOSS_PLAN: '3-1264',
  FIGHT_PLAN: '3-1265',
  FALLBACK_MAP: 1,
  /** Act-point event rolls are 1..3 (events 3 / 4). */
  ACT_MIN: 1,
  ACT_MAX: 3,
} as const;

export const DIR = { UP: 1, DOWN: 2, LEFT: 3, RIGHT: 4 } as const;

export const EVENT = {
  JUMP: 1, WARP: 2, ACT_DOWN: 3, ACT_UP: 4, HEAL: 5, TRAP: 6, GODDESS: 7, SHOP: 8, LOTTERY: 9, QUIZ: 10,
  FIGHT_LOW: 11, FIGHT_MID: 12, FIGHT_HI: 13, BOSS: 14,
} as const;

/** Chest level -> success chance of a refresh (level 5 never refreshes). */
export const REFRESH_SUCCESS_RATE: Readonly<Record<number, number>> = { 1: 0.6, 2: 0.45, 3: 0.3, 4: 0.15 };
/** Chest level -> final package (TBL_PLAN st). */
export const FINAL_AWARD_PLAN: Readonly<Record<number, string>> = { 1: '3-1266', 2: '3-1267', 3: '3-1261', 4: '3-1262', 5: '3-1263' };
/** Chest level -> BASIC_GET_EXP multiplier of the finish. */
export const FINISH_EXP_RATE: Readonly<Record<number, number>> = { 1: 5, 2: 7.5, 3: 12.5, 4: 20, 5: 35 };
export const LOTTERY_DROP_COST: Readonly<Record<number, number>> = { 1: 5, 2: 10, 3: 15, 4: 20 };
export const GODDESS_BUFFS: readonly number[] = [2688, 2689, 2690, 2691];

export const BATTLE_CREATURES: Readonly<Record<number, number>> = { 11: 1389, 12: 1390, 13: 1392, 14: 1391 };
export const BATTLE_ENEMY_COUNT: Readonly<Record<number, readonly [number, number]>> = { 11: [1, 3], 12: [3, 5], 13: [4, 6], 14: [1, 1] };
export const BATTLE_LEVEL_BONUS: Readonly<Record<number, number>> = { 14: 2 };
export const BATTLE_EXP_RATE: Readonly<Record<number, number>> = { 11: 1, 12: 1.5, 13: 2, 14: 3 };

export const DEFAULT_EVENT_WEIGHTS: Readonly<Record<number, number>> = {
  1: 50, 2: 50, 3: 50, 4: 50, 5: 40, 6: 20, 7: 40, 8: 75, 9: 75, 10: 50, 11: 160, 12: 200, 13: 100, 14: 40,
};

/** Door instance NPCs (client rows 1903-1906, type 1) and their points, all within 250 px of the room centre 720,490. */
export const DOOR_NPC: Readonly<Record<number, number>> = { 1: 1903, 2: 1904, 3: 1905, 4: 1906 };
export const DOOR_POINT: Readonly<Record<number, readonly [number, number]>> = { 1: [700, 340], 2: [730, 650], 3: [550, 500], 4: [870, 480] };
export const DOOR_LABEL: Readonly<Record<number, string>> = { 1: 'Lên', 2: 'Xuống', 3: 'Trái', 4: 'Phải' };
export const EVENT_NPC: Readonly<Record<number, number>> = {
  1: 1908, 2: 1917, 3: 1914, 4: 1919, 5: 1913, 6: 1915, 7: 1920, 8: 1916, 9: 1907, 10: 1918, 11: 1909, 12: 1911, 13: 1910, 14: 1912,
};
export const EVENT_NPC_POINT: readonly [number, number] = [600, 610];
export const CLICK_RADIUS = 250;

/** Shop pool: item id and list price in gold. */
export const SHOP_POOL: readonly { itemId: number; before: number }[] = [
  { itemId: 3804, before: 10 }, { itemId: 3805, before: 20 }, { itemId: 3816, before: 30 }, { itemId: 3815, before: 15 },
];

export const TEXT = {
  FAIL: 'Đã hết số lần hành động, khiêu chiến Mê Trận thất bại.',
  SUCCESS: 'Chúc mừng hoàn thành Mê Trận!',
  NO_GOLD: 'Không đủ vàng.',
  NO_SKIP: 'Không thể bỏ qua sự kiện này.',
  IN_BATTLE: 'Đang trong chiến đấu.',
  PENDING: 'Hãy xử lý sự kiện hiện tại trước.',
  RECOVER_OUT: 'Đã hết số lần hồi phục.',
  LEVEL: 'Cấp độ không đủ, cần cấp 120 mới có thể vào Mê Trận',
  NO_ENTRY: 'Hôm nay đã hết lượt vào Mê Trận.',
  BUSY: 'Đang trong chiến đấu, không thể vào Mê Trận.',
  ENTER_ERR: 'Không thể vào Mê Trận, vui lòng thử lại.',
  DOOR_END: 'Điểm Cuối',
  DOOR_VISITED: 'Đã Đi Qua',
  DOOR_EMPTY: 'Ô Trống',
} as const;
