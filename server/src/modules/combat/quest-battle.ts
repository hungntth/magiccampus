// Pure rules for quest-battle NPCs (legacy npc/quest_battle.go:19-136): which NPC types start a fight, which quest and
// which creatures it picks, and the enemy level. The service in quest-battle.service.ts loads data and starts the battle.

import { incompleteKillTargets } from '../quest/quest-progress';
import type { QuestObjective } from '../quest/quest.schema';
import { spawnLevel } from './creature-stats';

/** data_tbl_npc.type: 10 battle, 19 story battle, 20 quest battle. */
export const QUEST_BATTLE_NPC_TYPES: ReadonlySet<number> = new Set([10, 19, 20]);

/** npc.sub_type "50|5418|5419" -> [50, 5418, 5419]. */
export function parseSubTypeQuests(subType: string): number[] {
  return subType
    .split('|')
    .map((p) => Number(p.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
}

export interface ActiveObjectives {
  questId: number;
  objectives: readonly QuestObjective[];
}

/**
 * The first ACTIVE quest of the NPC's list decides: its incomplete kill objectives give one enemy each (not multiplied by
 * the count). A quest with nothing left to kill returns null, so the normal dialog opens (the turn-in must not re-fight).
 */
export function questBattleTargets(
  subType: string, active: readonly ActiveObjectives[],
): { questId: number; creatureIds: number[] } | null {
  for (const questId of parseSubTypeQuests(subType)) {
    const quest = active.find((a) => a.questId === questId);
    if (!quest) continue;
    const creatureIds = incompleteKillTargets(quest.objectives);
    return creatureIds.length > 0 ? { questId, creatureIds } : null;
  }
  return null;
}

/** max(1, min_level / 2) when the quest has a level gate (integer division), else the usual spawn-level fallbacks. */
export function questBattleLevel(questMinLevel: number, creatureUseLevel: number, mapLevel: number): number {
  if (questMinLevel > 0) return Math.max(1, Math.floor(questMinLevel / 2));
  return spawnLevel(0, creatureUseLevel, mapLevel);
}
