// Loop-boss rules (M9 phase E, Go application/quest/loop_boss.go): the round -> boss pairing, the presence rule and the
// boss rows sent in onCreateBoss / onBossOn. Trị An rounds summon their boss with an order item; Trừ Ma rounds show it on
// the listed maps. A boss stays while its round's kill objective is unfinished. Pure; the service holds the summons.

import type { BossRow } from '@mc/shared';
import { incompleteKillTargets } from '../quest/quest-progress';
import type { QuestObjective } from '../quest/quest.schema';

export interface LoopBossSpec {
  questId: number;
  npcId: number;
  /** Order item that summons the boss (Trị An); 0 for map-mode rounds. */
  itemId: number;
  /** Maps where a map-mode boss stands (Trừ Ma); empty for item rounds. */
  maps: readonly number[];
  air: boolean;
}

export const LOOP_BOSSES: readonly LoopBossSpec[] = [
  { questId: 4671, npcId: 1143, itemId: 2263, maps: [], air: false },
  { questId: 7667, npcId: 2167, itemId: 4843, maps: [], air: false },
  { questId: 7668, npcId: 1173, itemId: 0, maps: [10, 38, 31], air: false },
  { questId: 7669, npcId: 2169, itemId: 0, maps: [27], air: true },
  { questId: 7670, npcId: 2168, itemId: 0, maps: [27], air: true },
];

export const LOOP_BOSS_AIR_LAYER = 3;
/** Summons stand this far right of the player (Go triAnLocationNpcOffset). */
export const SUMMON_OFFSET_X = 80;
/** Owner-tuned HP divisors of the item bosses (Go loop_boss_level.go), applied at the character's level. */
export const LOOP_BOSS_LIFE_DIVISOR: Readonly<Record<number, number>> = { 4671: 10, 7667: 100 };

export const bossByQuest = (questId: number): LoopBossSpec | undefined => LOOP_BOSSES.find((b) => b.questId === questId);
export const bossByNpc = (npcId: number): LoopBossSpec | undefined => LOOP_BOSSES.find((b) => b.npcId === npcId);
export const bossByItem = (tid: number): LoopBossSpec | undefined =>
  tid > 0 ? LOOP_BOSSES.find((b) => b.itemId === tid) : undefined;

export function hasUnfinishedKill(objectives: readonly QuestObjective[] | undefined): boolean {
  return !!objectives && incompleteKillTargets(objectives).length > 0;
}

/** Map-mode presence: the round is active, the map is listed and the kill is still open. */
export function mapBossPresent(
  spec: LoopBossSpec, mapId: number, activeRoundIds: ReadonlySet<number>, objectives: readonly QuestObjective[] | undefined,
): boolean {
  return spec.maps.includes(mapId) && activeRoundIds.has(spec.questId) && hasUnfinishedKill(objectives);
}

/** The NPC's own spot, 1000,1000 when both are zero (Go). */
export function standPos(posX: number, posY: number): [number, number] {
  return posX === 0 && posY === 0 ? [1000, 1000] : [posX, posY];
}

export interface BossNpc {
  id: number;
  name: string;
  resCode: string;
  type: number;
}

export function bossRow(npc: BossNpc, x: number, y: number, air: boolean): BossRow {
  const row: BossRow = { id: npc.id, nid: npc.id, name: npc.name, resCode: npc.resCode, posX: x, posY: y, x, y, type: npc.type };
  if (air) row.layer = LOOP_BOSS_AIR_LAYER;
  return row;
}

/** Item bosses fight at the clicking character's level with divided HP; map bosses keep the quest-battle level. */
export function lifeDivisor(questId: number): number {
  return Math.max(1, LOOP_BOSS_LIFE_DIVISOR[questId] ?? 1);
}
