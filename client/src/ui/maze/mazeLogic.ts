// Pure rules of the Mê Trận client (Flash MazeInfoPanel / MazeLotteryPanel / MazeQuestionPanel): the in-maze state object (full
// update writes the three counters, a partial one only when >= 0; both repaint the 6 x 9 board from keys "0".."52"), the cell colour
// kinds, and the lottery / quiz payload parsers. No DOM.

import { MAZE_END_CELL, MAZE_MAX_DROPS, type MazeLotteryCard, type MazeLotteryPanel, type MazeQuestionPanel, type MazeQuizText } from '@mc/shared';

export interface MazeView {
  actNum: number;
  skipNum: number;
  recoverNum: number;
  visited: Set<number>;
  current: number;
  buffs: number[];
}

export const emptyView = (): MazeView => ({ actNum: 0, skipNum: 0, recoverNum: 0, visited: new Set(), current: 0, buffs: [] });

function cells(raw: Record<string, unknown>): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < MAZE_END_CELL; i++) if (raw[String(i)]) out.add(i);
  return out;
}

function buffs(raw: unknown): number[] {
  if (!raw || typeof raw !== 'object') return [];
  return Object.values(raw as Record<string, unknown>).map(Number).filter((n) => n > 0).slice(0, 4);
}

/** onGetMazeData: counters always written (missing = 0). */
export function applyFull(cur: MazeView, raw: Record<string, unknown> | null | undefined): MazeView {
  if (!raw) return cur;
  return {
    actNum: Math.trunc(Number(raw.actNum) || 0), skipNum: Math.trunc(Number(raw.skipNum) || 0), recoverNum: Math.trunc(Number(raw.recoverNum) || 0),
    visited: cells(raw), current: raw.currentIndex == null ? cur.current : Math.trunc(Number(raw.currentIndex)),
    buffs: 'mazeBuff' in raw ? buffs(raw.mazeBuff) : cur.buffs,
  };
}

/** updateData (replies of confirm / skip / buy): a counter is kept when missing or negative. */
export function applyPartial(cur: MazeView, raw: Record<string, unknown> | null | undefined): MazeView {
  if (!raw || typeof raw !== 'object') return cur;
  const keep = (v: unknown, old: number): number => (v != null && Number(v) >= 0 ? Math.trunc(Number(v)) : old);
  return {
    actNum: keep(raw.actNum, cur.actNum), skipNum: keep(raw.skipNum, cur.skipNum), recoverNum: keep(raw.recoverNum, cur.recoverNum),
    visited: cells(raw), current: raw.currentIndex == null ? cur.current : Math.trunc(Number(raw.currentIndex)),
    buffs: 'mazeBuff' in raw ? buffs(raw.mazeBuff) : cur.buffs,
  };
}

export type CellKind = 'start' | 'start-here' | 'end' | 'end-here' | 'here' | 'seen' | 'unknown';

export function cellKind(v: MazeView, i: number): CellKind {
  if (i === 0) return v.current === 0 ? 'start-here' : 'start';
  if (i === MAZE_END_CELL) return v.current === MAZE_END_CELL ? 'end-here' : 'end';
  if (v.current === i) return 'here';
  return v.visited.has(i) ? 'seen' : 'unknown';
}

export interface LotteryView {
  plan: Record<number, number>;
  drop: Set<number>;
  cost: Record<number, number>;
  finished: boolean;
  cards: Record<number, MazeLotteryCard>;
}

/** showMazeLotteryPanel payload; null without planId (the Flash panel opens empty then). */
export function parseLottery(raw: MazeLotteryPanel | null | undefined): LotteryView | null {
  if (!raw?.planId) return null;
  const num = (o: Record<string, unknown> | undefined): Record<number, number> => {
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(o ?? {})) out[Number(k)] = Number(v);
    return out;
  };
  const cards: Record<number, MazeLotteryCard> = {};
  for (const [k, v] of Object.entries(raw.cards ?? {})) cards[Number(k)] = v;
  return {
    plan: num(raw.planId), drop: new Set(Object.entries(raw.drop ?? {}).filter(([, v]) => v).map(([k]) => Number(k))),
    cost: num(raw.cost), finished: !!raw.finished, cards,
  };
}

/** Price of the next Bỏ Bài (cost[dropCount + 1]); null once the drop limit is reached. */
export function nextDropCost(l: LotteryView): number | null {
  return l.drop.size >= MAZE_MAX_DROPS ? null : (l.cost[l.drop.size + 1] ?? null);
}

export interface QuizView {
  ids: number[];
  answerNum: number;
  rightNum: number;
  total: number;
  texts: Record<number, MazeQuizText>;
}

export function parseQuiz(raw: MazeQuestionPanel | null | undefined): QuizView | null {
  if (!raw?.question) return null;
  const ids = Object.keys(raw.question).sort((a, b) => Number(a) - Number(b)).map((k) => Number(raw.question[k]));
  const texts: Record<number, MazeQuizText> = {};
  for (const [k, v] of Object.entries(raw.texts ?? {})) texts[Number(k)] = v;
  return { ids, answerNum: Math.trunc(Number(raw.answerNum) || 0), rightNum: Math.trunc(Number(raw.rightNum) || 0), total: Math.trunc(Number(raw.totalNum) || ids.length), texts };
}
