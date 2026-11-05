// Task sweep (Flash TaskSweepPanel, PANEL_TASKSWEEP 842), task type 3 = the Tinh Giới palaces: GamePredef.TASK 101-112, one palace battle
// = 180 s, 2 gold, the panel / end / cancel payloads and the pure run math (gold quote, battles done, remaining time) shared by the
// server and the panel. Dungeon sweeps (types 1 / 2) use the auto-task panel instead. Pure: usable in Node and the browser.

import { STAR_PALACE_NAMES, WAR_MAP_LEVELS, WAR_MAP_SIDS } from './starInstance.js';

export const SWEEP_TASK_TYPE = 3;
/** GamePredef.TASK id of palace `sid` = 100 + sid (101 Bạch Dương .. 112 Song Ngư). */
export const SWEEP_TASK_BASE = 100;
export const SWEEP_BATTLE_MS = 180_000;
/** taskSweepEnd is accepted this early (the client countdown and the server clock differ slightly). */
export const SWEEP_END_SLACK_MS = 3_000;
export const SWEEP_NEED_BAG_NUM = 1;
export const SWEEP_TASK_GOLD = 2;

export const sweepTaskId = (sid: number): number => SWEEP_TASK_BASE + sid;

/** The palace of a sweep task id, or 0 when the id is not a palace task. */
export function sweepSidOfTask(taskId: number): number {
  const sid = taskId - SWEEP_TASK_BASE;
  return Number.isInteger(sid) && sid >= 1 && sid <= WAR_MAP_SIDS ? sid : 0;
}

export const sweepPalaceName = (sid: number): string => STAR_PALACE_NAMES[sid - 1] ?? '';

/** Quick-finish quote (TaskSweepPanel.turnSweepRight type 3): max(1, ceil(ms / 60000 x 0.5)) gold. */
export function sweepGold(ms: number): number {
  return Math.max(1, Math.ceil((ms / 60_000) * 0.5));
}

/** A running sweep (persisted): `st` is the wall-clock start in ms, so it keeps counting while offline. */
export interface SweepRun {
  sid: number;
  level: number;
  count: number;
  st: number;
}

export const sweepTotalMs = (run: Pick<SweepRun, 'count'>): number => run.count * SWEEP_BATTLE_MS;
export const sweepElapsedMs = (run: SweepRun, now: number): number => Math.max(now - run.st, 0);
export const sweepRemainingMs = (run: SweepRun, now: number): number => Math.max(sweepTotalMs(run) - sweepElapsedMs(run, now), 0);
export const sweepBattlesDone = (run: SweepRun, now: number): number =>
  Math.min(Math.floor(sweepElapsedMs(run, now) / SWEEP_BATTLE_MS), run.count);

export const isValidSweepCell = (sid: number, level: number): boolean =>
  Number.isInteger(sid) && Number.isInteger(level) && sid >= 1 && sid <= WAR_MAP_SIDS && level >= 1 && level <= WAR_MAP_LEVELS;

/**
 * initTaskSweepPanel payload (push and `initTaskSweepPanelByClient` reply). `taskIndex` carries the palace LEVEL (the client sends it
 * back with taskSweepSure / taskSweepEnd / taskFinishByGold); `st` is the elapsed ms of a running sweep (0 = idle); `taskId` is set
 * only while a sweep runs.
 */
export interface TaskSweepPanel {
  id: number;
  taskIndex: number;
  taskName: string;
  taskType: number;
  battleCount: number;
  money: number;
  needBagNum: number;
  gold: number;
  time: number;
  smax: number;
  snum: number;
  exp: number;
  st: number;
  level: number;
  taskId?: number;
}

/** taskSweepSure reply (onTaskSweepSure): the client needs `taskId`. */
export interface TaskSweepStart {
  taskId: number;
  id: number;
  taskName: string;
  battleCount: number;
  st: 0;
}

/** onEndBattle push: a finished sweep (type 1 = timer, 3 = gold) or the pending form with the seconds left. */
export interface TaskSweepEnd {
  flag: 1;
  type: number;
  taskId: number;
  id: number;
  num: number;
}

export interface TaskSweepPending {
  flag: 0;
  leftTime: number;
}

/** onTaskSweepCancel push. */
export interface TaskSweepCancelled {
  taskId: number;
  id: number;
  num: number;
}

export const SWEEP_END_TYPE_TIMER = 1;
export const SWEEP_END_TYPE_GOLD = 3;
/** taskFinishByGold mode: finish the running sweep / finish at once without sweeping. */
export const SWEEP_MODE_RUNNING = 1;
export const SWEEP_MODE_DIRECT = 2;

/** Client parser of an initTaskSweepPanel payload; null when it is not a palace task. */
export function parseSweepPanel(p: unknown): TaskSweepPanel | null {
  const r = p as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;
  const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const id = n(r.id ?? r.taskId);
  if (!sweepSidOfTask(id)) return null;
  return {
    id, taskIndex: n(r.taskIndex ?? r.level), taskName: String(r.taskName ?? sweepPalaceName(id - SWEEP_TASK_BASE)),
    taskType: n(r.taskType) || SWEEP_TASK_TYPE, battleCount: Math.max(1, n(r.battleCount)), money: n(r.money),
    needBagNum: n(r.needBagNum), gold: n(r.gold), time: n(r.time) || SWEEP_BATTLE_MS, smax: n(r.smax), snum: n(r.snum), exp: n(r.exp),
    st: n(r.st), level: n(r.level ?? r.taskIndex), ...(r.taskId !== undefined ? { taskId: n(r.taskId) } : {}),
  };
}
