// Pure monster heart rules (Go application/monsterheart): set / remove, open hole, fusion, dissolve and the container upgrade. Plans return the next
// state plus the costs, or `{ error }`. Owner-validated (2026-10-26/27): an unprotected failed fusion destroys the `num` copies, a protected one keeps
// them (1 Tâm Tinh Thạch per attempt, or 800 gold when none is left and "dùng vàng" is ticked); resolve = heart.exp x num Ma Năng; the container costs
// Ma Năng of the CURRENT level row, or its gold when the Ma Năng is short.

import {
  MONSTER_HEART, MONSTER_HEART_TEXT as T, monsterHeartContainId, monsterHeartDiamondColor, monsterHeartPointId, monsterHeartUpgradeRate, recomputeCombines,
  type CombineGroup, type HeartRow, type HeartStatLookup, type PointRow,
} from '@mc/shared';
import { addToBag, bagCount, cloneHeartState, takeFromBag } from './monsterheart-state';
import type { MonsterHeartState } from '@mc/shared';

export interface PlanError {
  error: string;
}
export const isError = (v: unknown): v is PlanError => !!v && typeof v === 'object' && 'error' in v;

export interface HeartLook extends HeartStatLookup {
  point(id: number): PointRow | undefined;
  groups: ReadonlyMap<number, CombineGroup>;
}

const validBox = (b: number): boolean => Number.isInteger(b) && b >= 1 && b <= MONSTER_HEART.BOXES;
const validHole = (h: number): boolean => Number.isInteger(h) && h >= 1 && h <= MONSTER_HEART.HOLES;

export function recompute(state: MonsterHeartState, look: HeartLook): void {
  state.data.hadActCombine = recomputeCombines(state.data.hadActHole, look.heart, look.groups, look.combine);
}

/** The heart one colour up (Go nextHeartID): id + 1 of colour + 1, same type and prop; null at the top colour. */
export function nextHeart(heart: HeartRow, heartOf: (id: number) => HeartRow | undefined): HeartRow | null {
  if (heart.color >= MONSTER_HEART.MAX_COLOR) return null;
  const n = heartOf(heart.id + 1);
  return n && n.color === heart.color + 1 && n.type === heart.type && n.propType === heart.propType ? n : null;
}

export function planSet(state: MonsterHeartState, heartId: number, hole: number, box: number, look: HeartLook): { state: MonsterHeartState; type: number } | PlanError {
  if (!validBox(box)) return { error: T.BAD_BOX };
  if (!validHole(hole)) return { error: T.BAD_HOLE };
  const heart = look.heart(heartId);
  if (!heart) return { error: T.NO_DATA };
  const point = look.point(monsterHeartPointId(box, hole));
  if (point && point.type >= 0 && point.type !== heart.type) return { error: T.WRONG_TYPE };
  const next = cloneHeartState(state);
  const existing = next.data.hadActHole[box]![hole]!;
  if (existing === MONSTER_HEART.CLOSED_HOLE) return { error: T.HOLE_CLOSED };
  if (!takeFromBag(next, heartId, 1)) return { error: T.NOT_IN_BAG };
  if (existing > 0) {
    const prev = look.heart(existing);
    if (prev) addToBag(next, prev.type, existing, 1);
  }
  next.data.hadActHole[box]![hole] = heartId;
  recompute(next, look);
  return { state: next, type: heart.type };
}

export function planRemove(state: MonsterHeartState, hole: number, box: number, look: HeartLook): { state: MonsterHeartState; type: number } | PlanError {
  if (!validBox(box)) return { error: T.BAD_BOX };
  if (!validHole(hole)) return { error: T.BAD_HOLE };
  const next = cloneHeartState(state);
  const existing = next.data.hadActHole[box]![hole]!;
  if (existing <= 0) return { error: T.EMPTY_SLOT };
  const heart = look.heart(existing);
  if (!heart) return { error: T.NO_DATA };
  next.data.hadActHole[box]![hole] = MONSTER_HEART.EMPTY_HOLE;
  addToBag(next, heart.type, existing, 1);
  recompute(next, look);
  return { state: next, type: heart.type };
}

export interface OpenCost {
  gold: number;
  diamonds: number;
  diamondColor: number;
}

export function planOpen(state: MonsterHeartState, box: number, hole: number, diamond: boolean, look: HeartLook): { state: MonsterHeartState; cost: OpenCost } | PlanError {
  if (!validBox(box)) return { error: T.BAD_BOX };
  if (!validHole(hole)) return { error: T.BAD_HOLE };
  const point = look.point(monsterHeartPointId(box, hole));
  if (!point || (diamond && point.num <= 0)) return { error: T.NO_DATA };
  if (state.data.hadActHole[box]![hole] !== MONSTER_HEART.CLOSED_HOLE) return { error: T.HOLE_OPEN };
  const next = cloneHeartState(state);
  next.data.hadActHole[box]![hole] = MONSTER_HEART.EMPTY_HOLE;
  const cost: OpenCost = diamond
    ? { gold: 0, diamonds: point.num, diamondColor: monsterHeartDiamondColor(point.quality) }
    : { gold: Math.max(0, point.goldNum), diamonds: 0, diamondColor: 0 };
  return { state: next, cost };
}

export interface Wallet {
  stones: number;
  gold: number;
}

export interface UpgradePlan {
  state: MonsterHeartState;
  type: number;
  attempts: number;
  successes: number;
  stonesUsed: number;
  goldUsed: number;
}

/** upgradeMonsterHeartItem: `rng` returns [0, 1). One attempt, or every attempt until fewer than `num` copies / no protection left (cap 1000). */
export function planUpgrade(
  state: MonsterHeartState, heartId: number, num: number, opts: { isAll: boolean; useStone: boolean; byGold: boolean }, wallet: Wallet,
  look: HeartLook, rng: () => number,
): UpgradePlan | PlanError {
  if (!Number.isInteger(num) || num < MONSTER_HEART.MIN_FUSE || num > MONSTER_HEART.MAX_FUSE) return { error: T.BAD_AMOUNT };
  const heart = look.heart(heartId);
  if (!heart) return { error: T.NO_DATA };
  const up = nextHeart(heart, look.heart);
  if (!up) return { error: T.MAX_COLOR };
  if (bagCount(state, heartId) < num) return { error: T.NO_HEARTS };
  const rate = monsterHeartUpgradeRate(heart.color, num);
  const next = cloneHeartState(state);
  let { stones, gold } = wallet;
  const plan: UpgradePlan = { state: next, type: heart.type, attempts: 0, successes: 0, stonesUsed: 0, goldUsed: 0 };
  while (plan.attempts < MONSTER_HEART.MAX_ATTEMPTS && bagCount(next, heartId) >= num) {
    let protectedTry = false;
    if (opts.useStone) {
      if (stones > 0) {
        stones--;
        plan.stonesUsed++;
        protectedTry = true;
      } else if (opts.byGold && gold >= MONSTER_HEART.PROTECT_GOLD) {
        gold -= MONSTER_HEART.PROTECT_GOLD;
        plan.goldUsed += MONSTER_HEART.PROTECT_GOLD;
        protectedTry = true;
      }
      if (!protectedTry) {
        if (plan.attempts === 0) return { error: T.NO_STONE };
        break;
      }
    }
    plan.attempts++;
    if (Math.floor(rng() * 100) < rate) {
      takeFromBag(next, heartId, num);
      addToBag(next, up.type, up.id, 1);
      plan.successes++;
    } else if (!protectedTry) {
      takeFromBag(next, heartId, num);
    }
    if (!opts.isAll) break;
  }
  return plan;
}

export function planResolve(state: MonsterHeartState, heartId: number, num: number, look: HeartLook): { state: MonsterHeartState; type: number; gain: number } | PlanError {
  if (!Number.isInteger(num) || num <= 0) return { error: T.BAD_AMOUNT };
  const heart = look.heart(heartId);
  if (!heart) return { error: T.NO_DATA };
  if (bagCount(state, heartId) < num) return { error: T.NO_HEARTS };
  const next = cloneHeartState(state);
  takeFromBag(next, heartId, num);
  return { state: next, type: heart.type, gain: heart.exp * num };
}

export function planBoxUpgrade(
  state: MonsterHeartState, box: number, wallet: { maNang: number; gold: number }, look: HeartLook,
): { state: MonsterHeartState; level: number; maNang: number; gold: number } | PlanError {
  if (!validBox(box)) return { error: T.BAD_BOX };
  const lev = state.data.heartBoxLev[box] ?? MONSTER_HEART.MIN_BOX_LEV;
  if (lev >= MONSTER_HEART.MAX_BOX_LEV) return { error: T.MAX_BOX };
  const row = look.contain(monsterHeartContainId(box, lev));
  if (!row) return { error: T.NO_DATA };
  const next = cloneHeartState(state);
  next.data.heartBoxLev[box] = lev + 1;
  if (wallet.maNang >= row.exp) return { state: next, level: lev + 1, maNang: row.exp, gold: 0 };
  if (wallet.gold < row.goldNum) return { error: T.NO_GOLD };
  return { state: next, level: lev + 1, maNang: 0, gold: row.goldNum };
}
