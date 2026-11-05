// Mê Trận board (Go application/maze board.go, state.go WireState, doors.go): 6 x 9 grid (index = row * 6 + col, start 0, end 53),
// weighted event generation, orthogonal neighbours, jump candidates, the run shape persisted per character, the client state object
// and the room door list (gate per in-grid neighbour + the pending event NPC). Pure: randomness is injected.

import { MAZE_COLS, MAZE_END_CELL, MAZE_ROWS, MAZE_CELLS, MAZE_START_CELL, MAZE_DOOR_BASE, MAZE_EVENT_NPC_ID, type MazeState } from '@mc/shared';
import { DIR, DOOR_LABEL, DOOR_NPC, DOOR_POINT, EVENT_NPC, EVENT_NPC_POINT, MAZE, TEXT } from './maze-config';

export type Rng = () => number;

export interface MazeQuiz { ids: number[]; answerNum: number; rightNum: number; done: boolean }
export interface MazeShopSlot { itemId: number; sid: number; before: number; after: number; bought: boolean }
export interface MazeLottery { planIds: number[]; dropped: number[]; finished: boolean }
export interface MazeBattle { type: number; startHp: number }

/** One run (Go `Run`); `board[i]` = event type 0..14, `visited[i]` = revealed. */
export interface MazeRun {
  board: number[];
  visited: boolean[];
  cur: number;
  actNum: number;
  skipNum: number;
  recoverNum: number;
  pending: number;
  buffs: number[];
  level: number;
  templateId: number;
  returnMap: number;
  returnX: number;
  returnY: number;
  quiz: MazeQuiz | null;
  shop: MazeShopSlot[] | null;
  lottery: MazeLottery | null;
  battle: MazeBattle | null;
}

export const rowCol = (index: number): [number, number] => [Math.floor(index / MAZE_COLS), index % MAZE_COLS];
const inGrid = (row: number, col: number): boolean => row >= 0 && row < MAZE_ROWS && col >= 0 && col < MAZE_COLS;

/** The cell one step in `dir` (1 up, 2 down, 3 left, 4 right), or null off the grid. */
export function neighbor(index: number, dir: number): number | null {
  if (!Number.isInteger(index) || index < 0 || index >= MAZE_CELLS) return null;
  let [row, col] = rowCol(index);
  if (dir === DIR.UP) row -= 1;
  else if (dir === DIR.DOWN) row += 1;
  else if (dir === DIR.LEFT) col -= 1;
  else if (dir === DIR.RIGHT) col += 1;
  else return null;
  return inGrid(row, col) ? row * MAZE_COLS + col : null;
}

/** Cells at manhattan distance 1-2 (event 1). */
export function jumpCandidates(index: number): number[] {
  const [row, col] = rowCol(index);
  const out: number[] = [];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dist = Math.abs(dr) + Math.abs(dc);
      if (dist >= 1 && dist <= 2 && inGrid(row + dr, col + dc)) out.push((row + dr) * MAZE_COLS + col + dc);
    }
  }
  return out;
}

/** Cells 1..52: 25 % empty, else a weighted event type; cells 0 and 53 stay empty. */
export function generateBoard(rng: Rng, weights: Readonly<Record<number, number>>): number[] {
  const board = new Array<number>(MAZE_CELLS).fill(0);
  const types = Object.keys(weights).map(Number).filter((t) => weights[t] > 0).sort((a, b) => a - b);
  const total = types.reduce((s, t) => s + weights[t], 0);
  if (total <= 0) return board;
  for (let i = MAZE_START_CELL + 1; i < MAZE_END_CELL; i++) {
    if (rng() < MAZE.EMPTY_CELL_RATE) continue;
    let roll = rng() * total;
    board[i] = types[types.length - 1];
    for (const t of types) {
      roll -= weights[t];
      if (roll < 0) {
        board[i] = t;
        break;
      }
    }
  }
  return board;
}

export function newRun(rng: Rng, weights: Readonly<Record<number, number>>, level: number, ret: { map: number; x: number; y: number }): MazeRun {
  const visited = new Array<boolean>(MAZE_CELLS).fill(false);
  visited[MAZE_START_CELL] = true;
  return {
    board: generateBoard(rng, weights), visited, cur: MAZE_START_CELL, actNum: MAZE.START_ACT, skipNum: MAZE.START_SKIP,
    recoverNum: MAZE.START_RECOVER, pending: 0, buffs: [], level, templateId: 0, returnMap: ret.map, returnX: ret.x, returnY: ret.y,
    quiz: null, shop: null, lottery: null, battle: null,
  };
}

export function buffMap(run: Pick<MazeRun, 'buffs'>): Record<string, number> | null {
  if (run.buffs.length === 0) return null;
  const out: Record<string, number> = {};
  run.buffs.slice(0, 4).forEach((id, i) => (out[String(i + 1)] = id));
  return out;
}

/** The state object every state reply / updateMazeInfoData carries: counters, the full visited set (0..52), currentIndex, buffs. */
export function wireState(run: MazeRun): MazeState {
  const out: MazeState = { actNum: run.actNum, skipNum: run.skipNum, recoverNum: run.recoverNum };
  for (let i = 0; i < MAZE_END_CELL; i++) if (run.visited[i]) out[String(i)] = true;
  out.currentIndex = run.cur;
  const buffs = buffMap(run);
  if (buffs) out.mazeBuff = buffs;
  return out;
}

export const emptyWireState = (): MazeState => ({ actNum: 0, skipNum: 0, recoverNum: 0 });

export interface DoorSpec {
  id: number; // instance id
  nid: number; // client NPC row
  x: number;
  y: number;
  name: string;
  dir: number; // 0 for the event NPC
  event: number;
}

/** Gate label "Lên (ô N): <content of the destination cell>" (Go doorLabel). */
export function doorLabel(run: MazeRun, dir: number, target: number, eventName: (event: number) => string): string {
  const base = `${DOOR_LABEL[dir]} (ô ${target + 1})`;
  let what = '';
  if (target === MAZE_END_CELL) what = TEXT.DOOR_END;
  else if (run.visited[target]) what = TEXT.DOOR_VISITED;
  else if (run.board[target] === 0) what = TEXT.DOOR_EMPTY;
  else what = eventName(run.board[target]);
  return what ? `${base}: ${what}` : base;
}

/** The room NPC list: one gate per in-grid neighbour, plus the event NPC while an event is pending. */
export function roomDoors(run: MazeRun, eventName: (event: number) => string): DoorSpec[] {
  const out: DoorSpec[] = [];
  for (let dir = DIR.UP; dir <= DIR.RIGHT; dir++) {
    const target = neighbor(run.cur, dir);
    if (target === null) continue;
    const [x, y] = DOOR_POINT[dir];
    out.push({ id: MAZE_DOOR_BASE + dir, nid: DOOR_NPC[dir], x, y, name: doorLabel(run, dir, target, eventName), dir, event: 0 });
  }
  const nid = EVENT_NPC[run.pending];
  if (nid !== undefined) out.push({ id: MAZE_EVENT_NPC_ID, nid, x: EVENT_NPC_POINT[0], y: EVENT_NPC_POINT[1], name: eventName(run.pending), dir: 0, event: run.pending });
  return out;
}

export const isDoorId = (id: number): boolean => id > MAZE_DOOR_BASE && id <= MAZE_DOOR_BASE + DIR.RIGHT;
