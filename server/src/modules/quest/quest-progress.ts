// Pure objective rules for collect / kill quests (Go domain/quest + application/quest service.go): initial objectives,
// bag-synced collect progress, kill credit and the "remaining" questKill list. No Nest / Mongo.
// Objectives that equal the quest's accept-time grant item are met at accept and never counted from the bag (the item is
// granted into the bag on accept; rows taken before that have none). On finish it is taken back if the bag still holds it.

import type { QuestKill } from '@mc/shared';
import type { QuestRequireRow, QuestTemplate } from '../gamedata/quest-data';
import type { LootNeed } from '../combat/loot';
import type { QuestObjective } from './quest.schema';

export const KIND_COLLECT = 1;
export const KIND_KILL = 2;

export const isGrantObjective = (tpl: Pick<QuestTemplate, 'startGrantItem'>, o: Pick<QuestObjective, 'kind' | 'itemId'>): boolean =>
  o.kind === KIND_COLLECT && tpl.startGrantItem > 0 && o.itemId === tpl.startGrantItem;

const isCollect = (tpl: QuestTemplate, o: QuestObjective): boolean => o.kind === KIND_COLLECT && !isGrantObjective(tpl, o);

export const allMet = (objectives: readonly QuestObjective[]): boolean => objectives.every((o) => o.current >= o.required);

/** Objectives at accept time: grant items are met, collect / kill start at 0 (collect is synced from the bag on read). */
export function initialObjectives(tpl: QuestTemplate, require: readonly QuestRequireRow[]): QuestObjective[] {
  return require.map((r) => {
    const required = Math.max(1, r.num);
    const met = isGrantObjective(tpl, { kind: r.kind, itemId: r.itemId });
    return { kind: r.kind, itemId: r.itemId, current: met ? required : 0, required };
  });
}

/** Item template ids whose bag count matters for this quest's collect objectives. */
export function collectItemIds(tpl: QuestTemplate, objectives: readonly QuestObjective[]): number[] {
  return [...new Set(objectives.filter((o) => isCollect(tpl, o)).map((o) => o.itemId))];
}

/** Collect objectives take min(bag count, required), like Go syncCollectObjectives; other objectives are untouched. */
export function syncCollect(
  tpl: QuestTemplate, objectives: readonly QuestObjective[], bag: ReadonlyMap<number, number>,
): QuestObjective[] {
  return objectives.map((o) =>
    isCollect(tpl, o) ? { ...o, current: Math.min(bag.get(o.itemId) ?? 0, o.required) } : { ...o },
  );
}

/** What finishQuest takes from the bag: the summed requirement per collected item id (Go consumeCollectObjectiveItems). */
export function collectConsumption(tpl: QuestTemplate, objectives: readonly QuestObjective[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const o of objectives) if (isCollect(tpl, o)) out.set(o.itemId, (out.get(o.itemId) ?? 0) + o.required);
  return out;
}

/** Accept-time grant items to take back on finish: item id -> required (taken only as far as the bag has them). */
export function grantConsumption(tpl: QuestTemplate, objectives: readonly QuestObjective[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const o of objectives) if (isGrantObjective(tpl, o)) out.set(o.itemId, (out.get(o.itemId) ?? 0) + o.required);
  return out;
}

/**
 * Kill credit: each killed creature adds +1 to the FIRST incomplete kill objective for that creature id
 * (Go QuestProgress.UpdateObjective). Returns new objectives and whether anything moved.
 */
export function creditKills(
  objectives: readonly QuestObjective[], creatureIds: readonly number[],
): { objectives: QuestObjective[]; changed: boolean } {
  const next = objectives.map((o) => ({ ...o }));
  let changed = false;
  for (const id of creatureIds) {
    const target = next.find((o) => o.kind === KIND_KILL && o.itemId === id && o.current < o.required);
    if (target) {
      target.current++;
      changed = true;
    }
  }
  return { objectives: next, changed };
}

/** questKill list for onAddChaQuest: num = REMAINING kills (required - current, never below 0). */
export function questKillOf(objectives: readonly QuestObjective[]): QuestKill[] {
  return objectives
    .filter((o) => o.kind === KIND_KILL)
    .map((o) => ({ creatureId: o.itemId, num: Math.max(0, o.required - o.current) }));
}

/** Creature ids of the incomplete kill objectives, one per objective (not multiplied by the count): the quest-battle roster. */
export function incompleteKillTargets(objectives: readonly QuestObjective[]): number[] {
  return objectives.filter((o) => o.kind === KIND_KILL && o.current < o.required).map((o) => o.itemId);
}

/** Loot needs: per item id the summed requirement of active collect objectives, with the bag count as current. */
export function lootNeeds(
  active: readonly { tpl: QuestTemplate; objectives: readonly QuestObjective[] }[], bag: ReadonlyMap<number, number>,
): Map<number, LootNeed> {
  const needs = new Map<number, LootNeed>();
  for (const { tpl, objectives } of active) {
    for (const o of objectives) {
      if (!isCollect(tpl, o)) continue;
      const cur = needs.get(o.itemId) ?? { current: bag.get(o.itemId) ?? 0, required: 0 };
      cur.required += o.required;
      needs.set(o.itemId, cur);
    }
  }
  return needs;
}
