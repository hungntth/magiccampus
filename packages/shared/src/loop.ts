// Loop quests (M8 phase C): wire contracts for takeLoop / cancelLoop / loopRepaire and their pushes, the loop ids with
// special rules, the diary task each loop feeds, and the per-round reward formula (Go gamedata/predef/quest_reward.go,
// the data holds no loop rewards). Pure; shared by server and client.

import { basicExp, basicMoney } from './rewardScale.js';

/** One loop's state as the Flash client keeps it in `player.loopList[lid]` (`initQuestManager.l`). */
export interface LoopStateDTO {
  id: number; // loop id (lid)
  qid: number; // same as id in Go
  takeDate: number; // ms
  ft: number; // rounds completed so far
  finished: number; // 0 while active
}

/** `npcFuncInit.loopInfo`: for NPCs that host loops. Flash reads only `canTake`; `name` is an H5 extension (no client table). */
export interface NpcLoopInfo {
  flag: boolean;
  d: Record<string, { canTake: boolean; name: string }> | null;
}

/** Push `onTakeLoop` (Go only; the Flash client has no handler). */
export interface TakeLoopPush {
  flag: boolean;
  d?: LoopStateDTO;
}

/** Push `onCancelLoopQuest`. */
export interface CancelLoopQuestPush {
  flag: boolean;
  id: number;
}

/** Push `onFinishLoopQuest`: `ft` rounds done; `ft == num` ends the cycle. */
export interface FinishLoopQuestPush {
  id: number;
  ft: number;
  /** H5 extension (the Flash client reads both from its static table): rounds per cycle and the loop name. */
  num?: number;
  name?: string;
}

/** Loop ids with special rules. */
export const LoopId = { GUILD: 2, TRI_AN: 4, PET_TRAIN: 5, TU_LUYEN: 6, THAN_TU: 7, VONG_200: 9, TRU_MA: 16 } as const;

/** Diary task fed by one finished round of a loop (TBL_DIARY ids, research A2). */
export const LOOP_DIARY_TASK: Readonly<Record<number, number>> = { 2: 5, 4: 19, 5: 20, 6: 3, 7: 4, 16: 17 };

/** 200-vong milestones: completed rounds -> diary task (13..16). */
export const LOOP_MILESTONE_TASK: Readonly<Record<number, number>> = { 50: 13, 100: 14, 150: 15, 200: 16 };

/** Round quests that only exist through boss summons (`createBoss`); H5 has no boss display, so they are never picked. */
export const LOOP_BOSS_QUEST_IDS: readonly number[] = [4671, 7667, 7668, 7669, 7670];

/** Loop id of a type-7 round (`sub_type` "7-<lid>"), 0 when it is not one. */
export function loopIdOfSubType(subType: string): number {
  const m = /^7-(\d+)$/.exec(subType.trim());
  return m ? Number(m[1]) : 0;
}

const LOOP_K: readonly number[] = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5];

/** Exp and bound silver of the round finished when `ft` rounds were already done (Go class-quest formula). */
export function loopRoundReward(level: number, ft: number): { exp: number; silver: number } {
  const k = LOOP_K[((ft % 10) + 10) % 10];
  return { exp: Math.round((basicExp(level) * k * 10) / 31.5), silver: Math.round((basicMoney(level) * k * 3) / 31.5) };
}
