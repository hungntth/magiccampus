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
 * With no list (sub_type empty or "-1") the active quests this NPC gives or takes are tried in order, skipping those with
 * nothing left to kill (Go questBattleMatchesNPC): NPC 600 Khảo Quan Trung Cấp fights the six Khảo Quan of quest 645.
 */
export function questBattleTargets(
  subType: string, active: readonly ActiveObjectives[], isQuestNpc: (questId: number) => boolean = () => false,
): { questId: number; creatureIds: number[] } | null {
  const listed = parseSubTypeQuests(subType);
  if (listed.length === 0) {
    for (const quest of active) {
      if (!isQuestNpc(quest.questId)) continue;
      const creatureIds = incompleteKillTargets(quest.objectives);
      if (creatureIds.length > 0) return { questId: quest.questId, creatureIds };
    }
    return null;
  }
  for (const questId of listed) {
    const quest = active.find((a) => a.questId === questId);
    if (!quest) continue;
    const creatureIds = incompleteKillTargets(quest.objectives);
    return creatureIds.length > 0 ? { questId, creatureIds } : null;
  }
  return null;
}

/** Owner tuning (2026-11-07): quest-battle enemies of these quests get HP and attack divided (645: the six Khảo Quan). */
export const QUEST_BATTLE_WEAKEN: Readonly<Record<number, number>> = { 645: 10 };

/** Divides HP, both attacks and both defenses by the quest's QUEST_BATTLE_WEAKEN divisor (floored, at least 1). */
export function weakenQuestEnemy(
  f: { hp: number; hpMax: number; attack: number; magicAttack: number; defense: number; magicDefense: number },
  questId: number,
): void {
  const div = QUEST_BATTLE_WEAKEN[questId] ?? 1;
  if (div <= 1) return;
  const cut = (v: number): number => Math.max(1, Math.floor(v / div));
  f.hp = f.hpMax = cut(f.hpMax);
  f.attack = cut(f.attack);
  f.magicAttack = cut(f.magicAttack);
  f.defense = cut(f.defense);
  f.magicDefense = cut(f.magicDefense);
}

/** max(1, min_level / 2) when the quest has a level gate (integer division), else the usual spawn-level fallbacks. */
export function questBattleLevel(questMinLevel: number, creatureUseLevel: number, mapLevel: number): number {
  if (questMinLevel > 0) return Math.max(1, Math.floor(questMinLevel / 2));
  return spawnLevel(0, creatureUseLevel, mapLevel);
}
