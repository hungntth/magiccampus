// Monster heart feature state (feature key `monster_heart`, Go FeatureMonsterHeart): {ver: 2, bag: {ren..te: {heartId: {itemId, n}}}, data: {hadActHole,
// hadActCombine, heartBoxLev}}. Tolerant decode: string numbers, a `ver < 2` document (every hole -1 from the old Go stub) reads as closed holes.

import {
  MONSTER_HEART, MONSTER_HEART_BAGS, emptyHeartBags, emptyMonsterHeartData, monsterHeartBagKey, isFreeHolePoint, monsterHeartPointId,
  type MonsterHeartBagKey, type MonsterHeartState, type PointRow,
} from '@mc/shared';
import type { FeatureState } from '../progression/feature-rules';

export const MONSTER_HEART_FEATURE_KEY = 'monster_heart';

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function emptyMonsterHeartState(): MonsterHeartState {
  return { bag: emptyHeartBags(), data: emptyMonsterHeartData() };
}

export function parseMonsterHeart(raw: unknown): MonsterHeartState {
  const r = obj(raw);
  const state = emptyMonsterHeartState();
  const legacy = int(r.ver) < MONSTER_HEART.STATE_VERSION;
  const bag = obj(r.bag);
  for (const key of MONSTER_HEART_BAGS) {
    for (const v of Object.values(obj(bag[key]))) {
      const e = obj(v);
      if (int(e.itemId) > 0 && int(e.n) > 0) state.bag[key][int(e.itemId)] = { itemId: int(e.itemId), n: int(e.n) };
    }
  }
  const data = obj(r.data);
  for (const [bk, holes] of Object.entries(obj(data.hadActHole))) {
    const box = Number(bk);
    if (!(box >= 1 && box <= MONSTER_HEART.BOXES)) continue;
    for (const [hk, hv] of Object.entries(obj(holes))) {
      const hole = Number(hk);
      if (!(hole >= 1 && hole <= MONSTER_HEART.HOLES)) continue;
      let v = int(hv);
      if (legacy && v === MONSTER_HEART.EMPTY_HOLE) continue;
      if (v < MONSTER_HEART.EMPTY_HOLE) v = MONSTER_HEART.CLOSED_HOLE;
      state.data.hadActHole[box]![hole] = v;
    }
  }
  for (const [bk, combos] of Object.entries(obj(data.hadActCombine))) {
    const box = Number(bk);
    if (!(box >= 1 && box <= MONSTER_HEART.BOXES)) continue;
    for (const [pk, cv] of Object.entries(obj(combos))) {
      const e = obj(cv);
      if (int(pk) > 0) state.data.hadActCombine[box]![int(pk)] = { color: int(e.color), talent: int(e.talent) };
    }
  }
  for (const [bk, lv] of Object.entries(obj(data.heartBoxLev))) {
    const box = Number(bk);
    if (box >= 1 && box <= MONSTER_HEART.BOXES) state.data.heartBoxLev[box] = Math.max(MONSTER_HEART.MIN_BOX_LEV, Math.min(MONSTER_HEART.MAX_BOX_LEV, int(lv) || 1));
  }
  return state;
}

export const encodeMonsterHeart = (state: MonsterHeartState): FeatureState => ({ ver: MONSTER_HEART.STATE_VERSION, bag: state.bag, data: state.data });

export function cloneHeartState(s: MonsterHeartState): MonsterHeartState {
  return JSON.parse(JSON.stringify(s)) as MonsterHeartState;
}

/** Opens the holes whose point costs nothing (box 1 hole 1 by default). */
export function openFreeHoles(state: MonsterHeartState, pointOf: (id: number) => PointRow | undefined): void {
  for (let box = 1; box <= MONSTER_HEART.BOXES; box++) {
    for (let hole = 1; hole <= MONSTER_HEART.HOLES; hole++) {
      if (isFreeHolePoint(pointOf(monsterHeartPointId(box, hole))) && state.data.hadActHole[box]![hole] === MONSTER_HEART.CLOSED_HOLE) {
        state.data.hadActHole[box]![hole] = MONSTER_HEART.EMPTY_HOLE;
      }
    }
  }
}

export function bagCount(state: MonsterHeartState, heartId: number): number {
  let n = 0;
  for (const key of MONSTER_HEART_BAGS) n += state.bag[key][heartId]?.n ?? 0;
  return n;
}

export function bagKeyOfHeart(state: MonsterHeartState, heartId: number): MonsterHeartBagKey | null {
  return MONSTER_HEART_BAGS.find((k) => state.bag[k][heartId]) ?? null;
}

/** Takes `n` units out of the bag (entry dropped at 0); false when there are fewer. */
export function takeFromBag(state: MonsterHeartState, heartId: number, n: number): boolean {
  const key = bagKeyOfHeart(state, heartId);
  const e = key ? state.bag[key][heartId] : undefined;
  if (!key || !e || n <= 0 || e.n < n) return false;
  if (e.n === n) delete state.bag[key][heartId];
  else e.n -= n;
  return true;
}

export function addToBag(state: MonsterHeartState, type: number, heartId: number, n: number): boolean {
  const key = monsterHeartBagKey(type);
  if (!key || n <= 0 || heartId <= 0) return false;
  const e = (state.bag[key][heartId] ??= { itemId: heartId, n: 0 });
  e.n += n;
  return true;
}

export const placedHearts = (state: MonsterHeartState): number[] => Object.values(state.data.hadActHole).flatMap((h) => Object.values(h)).filter((v) => v > 0);
