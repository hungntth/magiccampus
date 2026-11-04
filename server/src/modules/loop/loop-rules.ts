// Pure loop-quest rules (Go application/quest/loop_service.go + loop_completion.go): take gating with the cooldown anchored at the
// take time, uniform round pick (level filter, previous round excluded while >= 2 remain), cycle advance, diary hooks and the
// repair-button rule. No Nest / Mongo; time and randomness are injected.

import { LOOP_DIARY_TASK, LOOP_MILESTONE_TASK, LoopId } from '@mc/shared';
import type { NpcLoopInfo } from '@mc/shared';

export interface LoopDef {
  id: number;
  name: string;
  nid: number; // hosting NPC
  num: number; // rounds per cycle
  refresh: number; // cooldown seconds
  minLevel: number;
  maxLevel: number;
}

/** Persisted loop state (character_quest_loops). */
export interface LoopState {
  ft: number;
  takeDateMs: number;
  active: boolean;
  activeQuestId: number;
}

export interface RoundCandidate {
  id: number;
  minLevel: number;
  maxLevel: number; // 0 = unbounded
}

/** null when the loop can be taken, else the Vietnamese reason shown to the player. */
export function takeBlocker(
  def: LoopDef, level: number, inGuild: boolean, state: LoopState | null, hasRound: boolean, nowMs: number,
): string | null {
  if (def.minLevel > 0 && level < def.minLevel) return 'Chưa đủ cấp độ';
  if (def.maxLevel > 0 && level > def.maxLevel) return 'Cấp độ quá cao';
  if (def.id === LoopId.GUILD && !inGuild) return 'Cần gia nhập bang hội';
  if (state?.active) return 'Đang trong vòng nhiệm vụ này';
  if (state && nowMs < state.takeDateMs + def.refresh * 1000) return 'Chưa hết thời gian chờ của vòng nhiệm vụ';
  if (!hasRound) return 'Hiện chưa có nhiệm vụ vòng phù hợp';
  return null;
}

export const canTakeLoop = (
  def: LoopDef, level: number, inGuild: boolean, state: LoopState | null, hasRound: boolean, nowMs: number,
): boolean => takeBlocker(def, level, inGuild, state, hasRound, nowMs) === null;

/** Minutes until the next take (0 when none): Flash QUESTMANAGER_S[7] counts `ceil(abs / 60)`. */
export function cooldownMinutes(def: LoopDef, state: LoopState | null, nowMs: number): number {
  if (!state) return 0;
  const left = state.takeDateMs + def.refresh * 1000 - nowMs;
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

/** Rounds usable at `level`. */
export const roundsForLevel = (pool: readonly RoundCandidate[], level: number): RoundCandidate[] =>
  pool.filter((r) => level >= r.minLevel && (r.maxLevel <= 0 || level <= r.maxLevel));

/** Uniform pick among the level-fitting rounds, skipping `excludeId` while at least two remain; null when none fit. */
export function pickRound(pool: readonly RoundCandidate[], level: number, excludeId: number, rng: () => number): number | null {
  let list = roundsForLevel(pool, level);
  if (list.length === 0) return null;
  if (list.length >= 2) list = list.filter((r) => r.id !== excludeId);
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))].id;
}

export interface Advance {
  ft: number;
  done: boolean; // the cycle ended (all rounds or no round left)
  nextQuestId: number | null;
}

/** State after finishing a round with `ft` rounds already done; `nextQuestId` is the picked following round (null = none). */
export function advanceLoop(def: LoopDef, ft: number, nextQuestId: number | null): Advance {
  const done = ft + 1;
  if (done >= def.num || nextQuestId === null) return { ft: done, done: true, nextQuestId: null };
  return { ft: done, done: false, nextQuestId };
}

/** Diary hooks of a finished round: the loop's own task, plus the 200-vong milestones (rounds 50 / 100 / 150 / 200). */
export function diaryTasksFor(lid: number, ft: number): number[] {
  const out: number[] = [];
  const own = LOOP_DIARY_TASK[lid];
  if (own !== undefined) out.push(own);
  if (lid === LoopId.VONG_200 && LOOP_MILESTONE_TASK[ft] !== undefined) out.push(LOOP_MILESTONE_TASK[ft]);
  return out;
}

/** The repair button rule (QuestManager.as:895-920): the loop is active but no quest of its pool is in the quest list. */
export const needsRepair = (active: boolean, hasRoundQuest: boolean): boolean => active && !hasRoundQuest;

/** State after giving a loop up: inactive, round forgotten, the take time (cooldown anchor) and the counter kept. */
export const cancelledState = (s: LoopState): LoopState => ({ ...s, active: false, activeQuestId: 0 });

export interface LoopInfoEntry {
  def: LoopDef;
  state: LoopState | null;
  hasRound: boolean;
  inGuild: boolean;
}

/** `npcFuncInit.loopInfo`: one canTake flag per loop the NPC hosts; { d: null, flag: false } for NPCs without loops. */
export function buildLoopInfo(entries: readonly LoopInfoEntry[], level: number, nowMs: number): NpcLoopInfo {
  if (entries.length === 0) return { d: null, flag: false };
  const d: NonNullable<NpcLoopInfo['d']> = {};
  for (const e of entries) {
    d[String(e.def.id)] = { canTake: canTakeLoop(e.def, level, e.inGuild, e.state, e.hasRound, nowMs), name: e.def.name };
  }
  return { d, flag: true };
}
