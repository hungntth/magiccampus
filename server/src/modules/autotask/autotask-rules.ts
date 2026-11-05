// Pure auto-task rules (Go application/autotask state.go / service.go / actions.go / dungeon.go): the persisted state shape, the
// wall-clock advance (one task runs, the rest queue), cancel with partial battles, the gold quote, the getAutoTaskData payload
// (nesting under `data` is required by the panel), the start gate with Go's refusal strings and the phụ bản clear check.

import {
  AUTO_TASKS, autoTaskDuration, autoTaskFreeRuns, autoTaskGroupBase, autoTaskQuickGold, type AutoTaskDef, type AutoTaskPayload,
} from '@mc/shared';

export interface AutoRun { id: number; st: number }

/** Persisted shape (character_autotask minus ids). `dg` lists tasks started through the phụ bản gate that still owe the completion reward. */
export interface AutoState {
  day: string;
  use: number; // free runs spent on `day`
  run: AutoRun | null;
  queue: number[];
  finish: Record<string, number>; // tid -> finished battles waiting for the award
  dg: number[];
}

export const emptyAutoState = (): AutoState => ({ day: '', use: 0, run: null, queue: [], finish: {}, dg: [] });

export const taskOf = (tid: number): AutoTaskDef | undefined => AUTO_TASKS[tid];

/** Free runs reset with the day key; queue / run / finish survive. True when changed. */
export function rollDay(st: AutoState, day: string): boolean {
  if (st.day === day) return false;
  st.day = day;
  st.use = 0;
  return true;
}

function startNext(st: AutoState, at: number): void {
  if (st.run || st.queue.length === 0) return;
  st.run = { id: st.queue[0], st: at };
  st.queue = st.queue.slice(1);
}

/** Go Advance: finished runs move to `finish` and the next queued task starts at the previous end (offline progress). True when changed. */
export function advance(st: AutoState, now: number): boolean {
  let changed = false;
  while (st.run) {
    const t = taskOf(st.run.id);
    if (!t) {
      st.run = null;
      changed = true;
      break;
    }
    const end = st.run.st + autoTaskDuration(t);
    if (now < end) break;
    st.finish[String(st.run.id)] = t.battleCount;
    st.run = null;
    changed = true;
    startNext(st, end);
  }
  return changed;
}

/** One active / queued / unclaimed entry per difficulty group. */
export function groupBusy(st: AutoState, tid: number): boolean {
  const base = autoTaskGroupBase(tid);
  if (st.run && autoTaskGroupBase(st.run.id) === base) return true;
  if (st.queue.some((q) => autoTaskGroupBase(q) === base)) return true;
  return Object.keys(st.finish).some((f) => autoTaskGroupBase(Number(f)) === base);
}

/** Go Start tail: queue the task and start it when nothing runs. */
export function enqueue(st: AutoState, tid: number, now: number, viaDungeon: boolean): void {
  if (viaDungeon && !st.dg.includes(tid)) st.dg.push(tid);
  st.queue.push(tid);
  startNext(st, now);
}

/** Go Cancel: a running task keeps floor(elapsed / time) battles (at most count - 1) as a finish; a queued one is dropped. False = nothing to cancel. */
export function cancelTask(st: AutoState, tid: number, now: number): boolean {
  const t = taskOf(tid);
  if (!t) return false;
  if (st.run?.id === tid) {
    const done = Math.min(t.battleCount - 1, t.time > 0 ? Math.floor((now - st.run.st) / t.time) : 0);
    if (done > 0) st.finish[String(tid)] = done;
    else st.dg = st.dg.filter((x) => x !== tid);
    st.run = null;
    startNext(st, now);
    return true;
  }
  const at = st.queue.indexOf(tid);
  if (at < 0) return false;
  st.queue.splice(at, 1);
  st.dg = st.dg.filter((x) => x !== tid);
  return true;
}

/** Quick finish price of the running (remaining time) or a queued (full price) task; null when it is neither. */
export function goldQuote(st: AutoState, tid: number, now: number): number | null {
  const t = taskOf(tid);
  if (!t) return null;
  if (st.run?.id === tid) return autoTaskQuickGold(t, st.run.st + autoTaskDuration(t) - now);
  return st.queue.includes(tid) ? t.gold : null;
}

/** Go CompleteByGold state change: the task jumps to a full finish; the next queued task starts now. */
export function finishNow(st: AutoState, tid: number, now: number): boolean {
  const t = taskOf(tid);
  if (!t || goldQuote(st, tid, now) === null) return false;
  if (st.run?.id === tid) {
    st.run = null;
    startNext(st, now);
  } else st.queue = st.queue.filter((q) => q !== tid);
  st.finish[String(tid)] = t.battleCount;
  return true;
}

/** Whether the finished task owes the phụ bản completion reward (started through the gate and every battle finished). */
export const owesCompletion = (st: AutoState, tid: number, battles: number): boolean =>
  st.dg.includes(tid) && battles >= (taskOf(tid)?.battleCount ?? Infinity);

export function payloadOf(st: AutoState, level: number, now: number): AutoTaskPayload {
  const queue: Record<string, 1> = {};
  for (const q of st.queue) queue[String(q)] = 1;
  return {
    todayNum: autoTaskFreeRuns(level),
    useNum: st.use,
    data: { data: st.run ? { id: st.run.id, st: st.run.st } : {}, queue, finish: { ...st.finish } },
    ct: now,
  };
}

/** Go refusal texts (handlers/autotask handler.go notices and application/autotask dungeon.go Refusal.Notice). */
export const AT_TEXT = {
  INVALID: 'Phụ bản không hợp lệ',
  BUSY: 'Phụ bản này đang được tự động hoàn thành',
  NOT_RUNNING: 'Phụ bản này chưa bắt đầu tự động hoàn thành',
  NOT_FINISHED: 'Phụ bản này chưa hoàn thành',
  NO_RUNS: 'Đã hết lượt miễn phí, cần có Sách Tự Động Hoàn Thành Phụ Bản',
  NO_MONEY: 'Bạc của bạn không đủ',
  NO_GOLD: 'Vàng của bạn không đủ',
  BAG_FULL: 'Túi đồ đã đầy, hãy dọn bớt rồi nhận thưởng.',
  PARTIAL: 'Túi đồ đã đầy, một phần phần thưởng không nhận được.',
  UNAVAILABLE: (task: string) => `${task} chưa mở, chưa thể tự động hoàn thành.`,
  LEVEL: (level: number, dungeon: string) => `Cần đạt cấp ${level} mới có thể tự động hoàn thành ${dungeon}.`,
  NEVER_CLEARED: (dungeon: string) => `Cần tự mình hoàn thành ${dungeon} ở độ khó này ít nhất 1 lần mới có thể tự động hoàn thành.`,
  IN_RUN: (dungeon: string) => `Ngươi đang trong lượt ${dungeon} hôm nay, hãy hoàn thành hoặc đợi hết giờ rồi mới tự động hoàn thành.`,
  NO_TICKET: (ticket: string, dungeon: string) => `Cần mang theo 1 ${ticket} để tự động hoàn thành ${dungeon}.`,
  REWARD: (task: string, exp: number) => `Tự động hoàn thành ${task}, nhận được kinh nghiệm ${exp}.`,
} as const;

/** Go clearedAtLevel: a dungeon with one difficulty (or a clear stamped without a level) needs any clear, else the difficulty itself. */
export function clearedAtLevel(levels: readonly number[] | undefined, difficultyCount: number, level: number): boolean {
  if (!levels || levels.length === 0 || level <= 0 || difficultyCount <= 1) return true;
  return levels.includes(level);
}

/** Go EverCleared (without the quest-history fallback): a first-clear stamp or a daily-lock stamp. */
export const everCleared = (clearedAt: number | undefined, doneAt: number | undefined): boolean => (clearedAt ?? 0) > 0 || (doneAt ?? 0) > 0;

export interface DungeonGate {
  name: string;
  level: number;
  ticketName: string;
  everCleared: boolean;
  clearedAtDifficulty: boolean;
  openRunToday: boolean; // a run of today that is not closed yet
  tickets: number;
}

export interface StartCheck {
  task: AutoTaskDef;
  charLevel: number;
  money: number;
  books: number;
  state: AutoState;
  tid: number;
  /** null = the task's dungeon is not ported yet */
  gate: DungeonGate | null;
}

/** Go Start order: group busy, silver, free run / book, then the phụ bản gate (level, clear, open run, ticket). First refusal text or null. */
export function startRefusal(c: StartCheck): string | null {
  if (groupBusy(c.state, c.tid)) return AT_TEXT.BUSY;
  if (c.money < c.task.money) return AT_TEXT.NO_MONEY;
  if (autoTaskFreeRuns(c.charLevel) - c.state.use <= 0 && c.books < 1) return AT_TEXT.NO_RUNS;
  const g = c.gate;
  if (!g) return AT_TEXT.UNAVAILABLE(c.task.name);
  if (c.charLevel < g.level) return AT_TEXT.LEVEL(g.level, g.name);
  if (!g.everCleared || !g.clearedAtDifficulty) return AT_TEXT.NEVER_CLEARED(g.name);
  if (g.openRunToday) return AT_TEXT.IN_RUN(g.name);
  if (g.tickets < 1) return AT_TEXT.NO_TICKET(g.ticketName, g.name);
  return null;
}
