// Pure phụ bản rules (Go application/dungeon service.go, mehuyen_rules.go, chest.go): definition indexes, floor reach / clear,
// pending parts, the gate guard, the sweeper verdicts and the daily lock. Quest completion arrives as a precomputed set (the
// ledger "completed today" plus party credit), so everything here is synchronous and unit-tested.

import { DUNGEONS, nextDayStartMs, type DungeonDef, type DungeonFloorDef, type DungeonRules } from '@mc/shared';
import type { DungeonRun } from './dungeon.schema';

export type ClosedReason = '' | 'left' | 'expired' | 'auto';

/** Only enabled dungeons are wired (the others keep their maps ungated until their phase). */
const ENABLED = DUNGEONS.filter((d) => d.enabled);

interface FighterRef { d: DungeonDef; floor: number; required: boolean }

const byKey = new Map<string, DungeonDef>();
const byEntrance = new Map<number, DungeonDef>();
const byFloorNpc = new Map<number, { d: DungeonDef; floor: number }>();
const byMap = new Map<number, { d: DungeonDef; floor: number }>();
const byFighter = new Map<number, FighterRef>();
const byChestNpc = new Map<number, DungeonDef>();
for (const d of ENABLED) {
  byKey.set(d.key, d);
  for (const n of d.entrances) byEntrance.set(n, d);
  for (const [npc, f] of Object.entries(d.floorNpcs)) byFloorNpc.set(Number(npc), { d, floor: f });
  if (d.chest) byChestNpc.set(d.chest.npc, d);
  d.floors.forEach((f, i) => {
    for (const m of f.maps) byMap.set(m, { d, floor: i });
    for (const n of f.bosses) byFighter.set(n, { d, floor: i, required: true });
    for (const n of f.extra) byFighter.set(n, { d, floor: i, required: false });
  });
}

export const enabledDungeons = (): readonly DungeonDef[] => ENABLED;
export const dungeonByKey = (key: string): DungeonDef | undefined => byKey.get(key);
export const dungeonByEntrance = (npc: number): DungeonDef | undefined => byEntrance.get(npc);
export const dungeonByFloorNpc = (npc: number): { d: DungeonDef; floor: number } | undefined => byFloorNpc.get(npc);
export const dungeonByMap = (mapId: number): { d: DungeonDef; floor: number } | undefined => byMap.get(mapId);
export const dungeonByFighter = (npc: number): FighterRef | undefined => byFighter.get(npc);
export const dungeonByChestNpc = (npc: number): DungeonDef | undefined => byChestNpc.get(npc);
export const isOpenerQuest = (qid: number): boolean => ENABLED.some((d) => d.openQuest === qid);
export const finalQuest = (d: DungeonDef): number => d.floors[d.floors.length - 1]?.quest ?? 0;
export const floorMap = (d: DungeonDef, floor: number): number => d.floors[floor]?.maps[0] ?? 0;
export const floorQuests = (d: DungeonDef): number[] => d.floors.map((f) => f.quest).filter((q) => q > 0);

export function difficultyOf(rules: DungeonRules, level: number): DungeonRules['difficulties'][number] {
  return rules.difficulties.find((x) => x.level === level) ?? rules.difficulties[0];
}

/** Today's run of `key` (a run from an earlier day counts as none). */
export function runOf(runs: Readonly<Record<string, DungeonRun>> | undefined, key: string, day: string): DungeonRun | null {
  const r = runs?.[key];
  return r && r.day === day ? r : null;
}

export function floorCleared(f: DungeonFloorDef, run: DungeonRun | null, done: ReadonlySet<number>): boolean {
  if (!run) return false;
  if (f.bosses.some((n) => !run.beaten.includes(n)) || f.steps.some((n) => !run.beaten.includes(n))) return false;
  return f.quest <= 0 || done.has(f.quest);
}

/** Highest reachable floor index; -1 without a run. */
export function reachable(d: DungeonDef, run: DungeonRun | null, done: ReadonlySet<number>): number {
  if (!run) return -1;
  let top = 0;
  while (top < d.floors.length - 1 && floorCleared(d.floors[top], run, done)) top++;
  return top;
}

export interface Pending { bosses: number[]; steps: number[]; quest: number }

export function pendingOf(f: DungeonFloorDef, run: DungeonRun | null, done: ReadonlySet<number>): Pending {
  const beaten = run?.beaten ?? [];
  return {
    bosses: f.bosses.filter((n) => !beaten.includes(n)),
    steps: f.steps.filter((n) => !beaten.includes(n)),
    quest: f.quest > 0 && !done.has(f.quest) ? f.quest : 0,
  };
}

/** Go pendingText: "đánh bại A, B; kích hoạt C; hoàn thành nhiệm vụ [Q]". */
export function pendingText(p: Pending, npcName: (id: number) => string, questName: (id: number) => string): string {
  const parts: string[] = [];
  if (p.bosses.length > 0) parts.push(`đánh bại ${p.bosses.map(npcName).join(', ')}`);
  if (p.steps.length > 0) parts.push(`kích hoạt ${p.steps.map(npcName).join(', ')}`);
  if (p.quest > 0) parts.push(`hoàn thành nhiệm vụ [${questName(p.quest)}]`);
  return parts.join('; ');
}

export type GateVerdict = 'ok' | 'norun' | 'locked';

/** Go GateAllowed: entering a floor map needs today's run and the floor reached; staying / going down in the same dungeon passes. */
export function gateVerdict(fromMap: number, toMap: number, runFor: (d: DungeonDef) => { run: DungeonRun | null; done: ReadonlySet<number> }): GateVerdict {
  const to = byMap.get(toMap);
  if (!to) return 'ok';
  const from = byMap.get(fromMap);
  if (from && from.d === to.d && to.floor <= from.floor) return 'ok';
  const { run, done } = runFor(to.d);
  if (!run) return 'norun';
  return reachable(to.d, run, done) < to.floor ? 'locked' : 'ok';
}

export const runDeadline = (run: DungeonRun, rules: DungeonRules): number => run.openedAt + rules.durationMin * 60_000;

export type FloorVerdict =
  | { action: 'none' }
  | { action: 'enter' }
  | { action: 'warn'; minutesLeft: number; threshold: number }
  | { action: 'eject'; reason: 'norun' | 'left' | 'expired' | 'auto' };

/** Go judgeOnFloor (no channel lock in H5): verdict for a character standing on a ruled floor map. */
export function judgeOnFloor(rules: DungeonRules, run: DungeonRun | null, now: number): FloorVerdict {
  if (!run) return { action: 'eject', reason: 'norun' };
  if (run.closed) return { action: 'eject', reason: run.closed };
  const deadline = runDeadline(run, rules);
  if (now >= deadline) return { action: 'eject', reason: 'expired' };
  if (!run.entered) return { action: 'enter' };
  const remain = deadline - now;
  let crossed = 0;
  for (const m of rules.warnMinutes) if (remain < m * 60_000 && (crossed === 0 || m < crossed)) crossed = m;
  if (crossed > 0 && (run.warned === 0 || crossed < run.warned)) {
    return { action: 'warn', minutesLeft: Math.ceil(remain / 60_000), threshold: crossed };
  }
  return { action: 'none' };
}

/** End of the daily lock started by a clear at `doneAt` (the next 00:00 UTC+7), 0 when not locked at `now`. */
export function lockedUntil(doneAt: number | undefined, now: number): number {
  if (!doneAt) return 0;
  const end = nextDayStartMs(doneAt);
  return now < end ? end : 0;
}
