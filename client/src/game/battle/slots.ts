// Battle slot table (legacy BattleStage Localizer markers, 900x570 stage): the creature's feet for slots 0..19.
// Enemies fill the upper-left diagonal, the player side the lower-right one. Player y values are inferred from the
// original right/bottom anchors (no runtime capture of the Flash layout exists).

export const BATTLE_W = 900;
export const BATTLE_H = 570;

export const SLOT_POS: Readonly<Record<number, { x: number; y: number }>> = {
  0: { x: 225, y: 245 }, 1: { x: 282, y: 187 }, 2: { x: 168, y: 302 }, 3: { x: 347, y: 133.6 }, 4: { x: 111, y: 359 },
  5: { x: 306, y: 283 }, 6: { x: 364, y: 225 }, 7: { x: 249, y: 347 }, 8: { x: 431, y: 166 }, 9: { x: 184, y: 410 },
  10: { x: 685, y: 406 }, 11: { x: 628, y: 458 }, 12: { x: 744, y: 347 }, 13: { x: 567, y: 518 }, 14: { x: 810, y: 292 },
  15: { x: 602, y: 370 }, 16: { x: 546, y: 424 }, 17: { x: 663, y: 313 }, 18: { x: 491, y: 474 }, 19: { x: 728, y: 259 },
};

/** Slots 0..9 are the enemy side (legacy `leftSide`), 10..19 the player side. */
export const isEnemySlot = (slot: number): boolean => slot < 10;

/** Sheet directions: enemies show dir 1, players dir 5 (BattleStage.setHostGroupDir). */
export const defaultDir = (slot: number): number => (isEnemySlot(slot) ? 1 : 5);

// Sheet action indices ("<dir>-<action>"): same numbers as BattleBehavior 0..7.
export const Action = { STAND: 0, RUN: 1, ATTACK: 3, DEAD: 4, HURT: 5, DEFENCE: 6, MAGIC: 7 } as const;

/** Run speed: MOVE_SPEED_BATTLE = 58 px per frame at 24 fps. */
export const RUN_SPEED = 58 * 24;
/** The attacker stops this far from the target (VALID_DIS_BATTLE_CLOSETO). */
export const CLOSE_TO = 60;
