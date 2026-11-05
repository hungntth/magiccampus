// Pure rules of the PPVE window: the Khac Van grid cells (level, lock, next cost), the stat totals, the master progress, the gold price of
// the next extra try and the log lines built from onSendReplayPPVEPanel. No DOM, so it is unit tested (ppveRules.test.ts).

import {
  PPVE_CARVE_MAX_LEVEL, PPVE_EXTRA_TRY_GOLD, PPVE_ICON_UNLOCK_FLOOR, PPVE_MASTER_MAX, PPVE_MASTER_STEP, PPVE_PART_ICONS, PPVE_PART_SLOTS,
  PPVE_RESULT, carveId, carveLevelOf, carveNodeDef, type CarveNodeDef,
} from '@mc/shared';
import { PPVE_TEXT as T } from './petBattleText';

export interface CarveCell {
  part: number;
  icon: number;
  /** 0 = not opened. */
  level: number;
  /** Floor needed to open this icon column (0 = open from the start). */
  unlockFloor: number;
  locked: boolean;
  maxed: boolean;
  /** The node the player holds now (undefined at level 0) and the one a level-up buys. */
  cur: CarveNodeDef | undefined;
  next: CarveNodeDef | undefined;
}

/** The cell of part 0..7, icon 0..5 from the `p` map of node ids and the best cleared floor. */
export function carveCell(p: Readonly<Record<string, readonly number[] | undefined>>, part: number, icon: number, floor: number): CarveCell {
  const id = Number(p[`s${part}`]?.[icon] ?? 0) || 0;
  const level = carveLevelOf(id);
  const unlockFloor = PPVE_ICON_UNLOCK_FLOOR[icon] ?? 0;
  const maxed = level >= PPVE_CARVE_MAX_LEVEL;
  return {
    part, icon, level, unlockFloor, locked: floor < unlockFloor, maxed,
    cur: level > 0 ? carveNodeDef(id) : undefined,
    next: maxed ? undefined : carveNodeDef(carveId(part, icon, level + 1)),
  };
}

/** Sum of the bonus of every opened node by prop type (pv is cumulative per node, so one node counts once). */
export function carveTotals(p: Readonly<Record<string, readonly number[] | undefined>>): Map<number, number> {
  const out = new Map<number, number>();
  for (let part = 0; part < PPVE_PART_SLOTS; part++) {
    for (let icon = 0; icon < PPVE_PART_ICONS; icon++) {
      const node = carveCell(p, part, icon, Infinity).cur;
      if (node) out.set(node.prop, (out.get(node.prop) ?? 0) + node.pv);
    }
  }
  return out;
}

/** Master progress: total carve levels, the total needed for the next master level (null at the cap). */
export function masterProgress(p: Readonly<Record<string, readonly number[] | undefined>>, mlv: number): { now: number; need: number | null } {
  let now = 0;
  for (let part = 0; part < PPVE_PART_SLOTS; part++) for (const id of p[`s${part}`] ?? []) now += carveLevelOf(Number(id));
  return { now, need: mlv >= PPVE_MASTER_MAX ? null : (mlv + 1) * PPVE_MASTER_STEP };
}

/** Gold of the next extra try by the number bought today: 10 / 20 / 50, then 50 again. */
export const extraTryGold = (goldTime: number): number => PPVE_EXTRA_TRY_GOLD[Math.min(Math.max(0, goldTime), PPVE_EXTRA_TRY_GOLD.length - 1)];

/** The log line text of an outcome (onSendReplayPPVEPanel arg 1; 1 win, 2 loss, -1 no winner in 24 rounds). */
export function logText(outcome: number, floor: number): string {
  if (outcome === PPVE_RESULT.WIN) return T.win(floor);
  if (outcome === PPVE_RESULT.LOSE) return T.lose;
  return T.draw;
}

/** A line-up exists when at least one slot of the saved config holds a pet. */
export const hasLineup = (conf: Readonly<Record<string, { pid: number }>> | undefined): boolean => Object.values(conf ?? {}).some((s) => s.pid > 0);
