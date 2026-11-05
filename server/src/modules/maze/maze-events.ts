// Mê Trận event rules (Go application/maze events.go, run.go, subpanels.go, battle.go): arriving on a cell, the 14 event effects
// of mazeConfirm, skip rule, fail rule, goddess buff, shop / lottery / quiz sub-state rules and the battle plan. Pure over a
// MazeRun with injected randomness; persistence, gold, rewards and pushes are the service's job.

import { MAZE_END_CELL, MAZE_LOTTERY_CARDS, MAZE_MAX_DROPS, MAZE_NON_SKIPPABLE, MAZE_QUIZ_SIZE, MAZE_START_CELL } from '@mc/shared';
import { jumpCandidates, neighbor, type MazeLottery, type MazeQuiz, type MazeRun, type MazeShopSlot, type Rng } from './maze-board';
import {
  BATTLE_CREATURES, BATTLE_ENEMY_COUNT, BATTLE_LEVEL_BONUS, EVENT, GODDESS_BUFFS, LOTTERY_DROP_COST, MAZE, SHOP_POOL,
} from './maze-config';

const randInt = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
const pickIndex = (rng: Rng, n: number): number => Math.min(n - 1, Math.floor(rng() * n));

/** Moves onto `target`: reveals it and, for a fresh event cell, makes the event pending. Returns true on the end cell. */
export function arrive(run: MazeRun, target: number, rng: Rng, templates: readonly number[]): boolean {
  run.cur = target;
  if (target === MAZE_END_CELL) return true;
  if (!run.visited[target]) {
    run.visited[target] = true;
    if (run.board[target] !== 0) run.pending = run.board[target];
  }
  if (templates.length > 0) run.templateId = templates[pickIndex(rng, templates.length)];
  return false;
}

/** A door move: spends one action point and arrives (null = no such neighbour). */
export function moveThrough(run: MazeRun, dir: number, rng: Rng, templates: readonly number[]): { finished: boolean } | null {
  const target = neighbor(run.cur, dir);
  if (target === null) return null;
  run.actNum -= 1;
  return { finished: arrive(run, target, rng, templates) };
}

/** Out of action points with nothing pending: the run fails. */
export function shouldFail(run: MazeRun): boolean {
  return run.pending === 0 && run.cur !== MAZE_END_CELL && run.actNum <= 0 && !run.battle;
}

export const canSkip = (run: Pick<MazeRun, 'pending' | 'skipNum'>): boolean =>
  run.pending !== 0 && !MAZE_NON_SKIPPABLE.includes(run.pending) && run.skipNum > 0;

/** One goddess buff the run does not hold yet (all held: nothing new). */
export function goddessBuff(run: MazeRun, rng: Rng): number | null {
  const free = GODDESS_BUFFS.filter((id) => !run.buffs.includes(id));
  if (free.length === 0) return null;
  const id = free[pickIndex(rng, free.length)];
  run.buffs.push(id);
  return id;
}

export type EventEffect =
  | { kind: 'none' }
  | { kind: 'move'; finished: boolean }
  | { kind: 'hp'; percent: number }
  | { kind: 'buff' }
  | { kind: 'shop' | 'lottery' | 'quiz' }
  | { kind: 'battle'; event: number };

/** mazeConfirm: the event is no longer pending; applies the run-only part of its effect and says what the service must do. */
export function applyEvent(run: MazeRun, event: number, rng: Rng, templates: readonly number[]): EventEffect {
  switch (event) {
    case EVENT.JUMP: {
      const cands = jumpCandidates(run.cur);
      return cands.length === 0 ? { kind: 'none' } : { kind: 'move', finished: arrive(run, cands[pickIndex(rng, cands.length)], rng, templates) };
    }
    case EVENT.WARP:
      return { kind: 'move', finished: arrive(run, rng() < 0.5 ? MAZE_END_CELL : MAZE_START_CELL, rng, templates) };
    case EVENT.ACT_DOWN:
      run.actNum = Math.max(0, run.actNum - randInt(rng, MAZE.ACT_MIN, MAZE.ACT_MAX));
      return { kind: 'none' };
    case EVENT.ACT_UP:
      run.actNum += randInt(rng, MAZE.ACT_MIN, MAZE.ACT_MAX);
      return { kind: 'none' };
    case EVENT.HEAL:
      return { kind: 'hp', percent: MAZE.HP_EVENT_PERCENT };
    case EVENT.TRAP:
      return { kind: 'hp', percent: -MAZE.HP_EVENT_PERCENT };
    case EVENT.GODDESS:
      goddessBuff(run, rng);
      return { kind: 'buff' };
    case EVENT.SHOP:
      return { kind: 'shop' };
    case EVENT.LOTTERY:
      return { kind: 'lottery' };
    case EVENT.QUIZ:
      return { kind: 'quiz' };
    default:
      return event >= EVENT.FIGHT_LOW && event <= EVENT.BOSS ? { kind: 'battle', event } : { kind: 'none' };
  }
}

/** Shop: two distinct offers at list x U[0.3, 0.7] rounded up (min 1); sid = item id. */
export function rollShop(rng: Rng): MazeShopSlot[] {
  const pool = [...SHOP_POOL];
  const out: MazeShopSlot[] = [];
  for (let i = 0; i < 2 && pool.length > 0; i++) {
    const offer = pool.splice(pickIndex(rng, pool.length), 1)[0];
    out.push({ itemId: offer.itemId, sid: offer.itemId, before: offer.before, after: Math.max(1, Math.ceil(offer.before * (0.3 + 0.4 * rng()))), bought: false });
  }
  return out;
}

/** Lottery: 5 distinct plan rows, weighted by `rate` (min 0.01). Null when the pool has fewer than 5. */
export function rollLottery(cards: readonly { id: number; rate: number }[], rng: Rng): MazeLottery | null {
  if (cards.length < MAZE_LOTTERY_CARDS) return null;
  const pool = [...cards];
  const planIds: number[] = [];
  for (let i = 0; i < MAZE_LOTTERY_CARDS; i++) {
    const total = pool.reduce((s, c) => s + Math.max(c.rate, 0.01), 0);
    let roll = rng() * total;
    let pick = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      roll -= Math.max(pool[j].rate, 0.01);
      if (roll < 0) {
        pick = j;
        break;
      }
    }
    planIds.push(pool.splice(pick, 1)[0].id);
  }
  return { planIds, dropped: [], finished: false };
}

/** The price of the next Bỏ Bài, or null when the drop is not allowed (finished, repeated, bad index, limit). */
export function dropCost(lot: MazeLottery | null, index: number): number | null {
  if (!lot || lot.finished || !Number.isInteger(index) || index < 1 || index > MAZE_LOTTERY_CARDS || lot.dropped.includes(index)) return null;
  if (lot.dropped.length >= MAZE_MAX_DROPS) return null;
  return LOTTERY_DROP_COST[lot.dropped.length + 1] ?? null;
}

/** Cards still in the draw (1-based). */
export const remainingCards = (lot: MazeLottery): number[] =>
  Array.from({ length: MAZE_LOTTERY_CARDS }, (_, i) => i + 1).filter((i) => !lot.dropped.includes(i));

/** 5 distinct question ids. Null when fewer than 5 exist. */
export function rollQuiz(ids: readonly number[], rng: Rng): MazeQuiz | null {
  if (ids.length < MAZE_QUIZ_SIZE) return null;
  const pool = [...ids];
  const picked: number[] = [];
  for (let i = 0; i < MAZE_QUIZ_SIZE; i++) picked.push(pool.splice(pickIndex(rng, pool.length), 1)[0]);
  return { ids: picked, answerNum: 0, rightNum: 0, done: false };
}

/** Go ValidQuizStep: counts only grow, right never above answered, and by no more than answered did. */
export function validQuizStep(q: MazeQuiz | null, answerNum: number, rightNum: number): boolean {
  if (!q || q.done || !Number.isInteger(answerNum) || !Number.isInteger(rightNum)) return false;
  if (answerNum <= q.answerNum || answerNum > MAZE_QUIZ_SIZE) return false;
  if (rightNum < q.rightNum || rightNum > answerNum) return false;
  return rightNum - q.rightNum <= answerNum - q.answerNum;
}

export interface BattlePlan {
  creatureId: number;
  count: number;
  levelBonus: number;
}

export function battlePlan(event: number, rng: Rng): BattlePlan | null {
  const creatureId = BATTLE_CREATURES[event];
  const range = BATTLE_ENEMY_COUNT[event];
  if (creatureId === undefined || !range) return null;
  return { creatureId, count: randInt(rng, range[0], range[1]), levelBonus: BATTLE_LEVEL_BONUS[event] ?? 0 };
}

/** Loss: HP = HP at the start of the fight - 20 % max, floor 1 (never above max). */
export function lossHp(startHp: number, maxHp: number): number {
  return Math.min(Math.max(1, maxHp), Math.max(1, startHp - Math.floor((maxHp * MAZE.HP_EVENT_PERCENT) / 100)));
}

/** Heal / trap: current + percent of max, clamped to 1..max. */
export function hpAfterPercent(current: number, maxHp: number, percent: number): number {
  return Math.min(maxHp, Math.max(1, current + Math.trunc((maxHp * percent) / 100)));
}
