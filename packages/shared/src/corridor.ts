// M10 phase F: Hành Lang Vô Tận (endless corridor, HLVT). NPC-menu driven (no panel, no RPC): constants, map / NPC / reward helpers and the
// func ids of the onList menus (Go handlers/corridor handler.go). Floor n lives on map 79 + (n - 1) % 8 (floors 9-12 reuse maps 79-82).
// Pushes: onList, onNpcMsg, onSystemSay, `a` (alert text), onAddMoney(charId, "couragePoint", delta, total). Rules: legacy memory corridor.md.

export const CORRIDOR = {
  FLOORS: 12,
  MAPS: 8,
  FIRST_MAP: 79,
  /** Cổng Dịch Chuyển on Quyến Cố Thành. */
  GATE_NPC: 2309,
  GATE_MAP: 30,
  /** Exits (2310-2317) send the player to Đông Huyền Thành. */
  EXIT_MAP: 9,
  BOSS_NPC_BASE: 2301,
  PORTAL_NPC_BASE: 2293,
  EXIT_NPC_BASE: 2310,
  /** Round cap of a floor fight (decision 9). */
  ROUND_CAP: 150,
  /** Daily claim: 50 + 15 per floor above 1 Điểm Dũng Khí (currency 214, key couragePoint). */
  COURAGE_BASE: 50,
  COURAGE_STEP: 15,
} as const;

/** NPC func ids (verbatim). The per-NPC ones take the NPC id as suffix. */
export const CORRIDOR_FUNC = {
  START: 'hlvt_start',
  PREV_PROGRESS: 'hlvt_prev_progress',
  MAX_POSSIBLE: 'hlvt_max_possible',
  MAX_CLEARED: 'hlvt_max_cleared',
  DAILY_REWARD: 'hlvt_daily_reward',
  KICK_OUT: 'hlvt_kick_out_',
  BOSS_CURRENT: 'hlvt_boss_current_',
  CONTINUE: 'hlvt_continue_',
  NEXT_FLOOR: 'hlvt_next_floor_',
  EXPLORE_MORE: 'hlvt_explore_more_',
  GOTO_DONG_HUYEN: 'hlvt_goto_dong_huyen',
  GOTO_QUYEN_CO: 'hlvt_goto_quyen_co',
  ONE_FLOOR_LEFT: 'hlvt_one_floor_left',
} as const;

export const validCorridorFloor = (floor: number): boolean => Number.isInteger(floor) && floor >= 1 && floor <= CORRIDOR.FLOORS;

const mapIndex = (floor: number): number => (floor - 1) % CORRIDOR.MAPS;

/** Map of a floor (0 for an invalid floor). */
export const corridorMap = (floor: number): number => (validCorridorFloor(floor) ? CORRIDOR.FIRST_MAP + mapIndex(floor) : 0);

/** Boss NPC of a floor (0 for an invalid floor). */
export const corridorBossNpc = (floor: number): number => (validCorridorFloor(floor) ? CORRIDOR.BOSS_NPC_BASE + mapIndex(floor) : 0);

export const isCorridorMap = (mapId: number): boolean => mapId >= CORRIDOR.FIRST_MAP && mapId < CORRIDOR.FIRST_MAP + CORRIDOR.MAPS;
export const isCorridorBossNpc = (id: number): boolean => id >= CORRIDOR.BOSS_NPC_BASE && id < CORRIDOR.BOSS_NPC_BASE + CORRIDOR.MAPS;
export const isCorridorPortalNpc = (id: number): boolean => id >= CORRIDOR.PORTAL_NPC_BASE && id < CORRIDOR.PORTAL_NPC_BASE + CORRIDOR.MAPS;
export const isCorridorExitNpc = (id: number): boolean => id >= CORRIDOR.EXIT_NPC_BASE && id < CORRIDOR.EXIT_NPC_BASE + CORRIDOR.MAPS;

/** Go FloorForMap: the saved current floor when it sits on that map, else the map's first-loop floor (0 off the corridor). */
export function corridorFloorForMap(mapId: number, hint: number): number {
  if (!isCorridorMap(mapId)) return 0;
  if (validCorridorFloor(hint) && corridorMap(hint) === mapId) return hint;
  return mapId - CORRIDOR.FIRST_MAP + 1;
}

/** Highest floor a character may enter / fight: cleared + 1, capped at the top floor. */
export const corridorReachable = (maxCleared: number): number => Math.min(Math.max(0, maxCleared) + 1, CORRIDOR.FLOORS);

/** Daily courage points of the highest cleared floor: 50 + 15 x (floor - 1), floor capped at 12; 0 when nothing is cleared. */
export function dailyCouragePoint(maxCleared: number): number {
  if (maxCleared < 1) return 0;
  return CORRIDOR.COURAGE_BASE + CORRIDOR.COURAGE_STEP * (Math.min(maxCleared, CORRIDOR.FLOORS) - 1);
}

/** First-kill gift bag of a floor: 4926-4933 (floors 1-8), 5998 / 6000 / 6283 (floors 9-11), none on floor 12. */
export function corridorFirstKillBag(floor: number): number {
  if (floor >= 1 && floor <= CORRIDOR.MAPS) return 4926 + floor - 1;
  if (floor === 9) return 5998;
  if (floor === 10) return 6000;
  if (floor === 11) return 6283;
  return 0;
}
