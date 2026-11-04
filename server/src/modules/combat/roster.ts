// Pure group-battle rules (M3 phase C, legacy group_battle.go / encounters.go / rewards.go): who fights, how many enemies,
// who still has to submit a command, and the reward split. No sockets, no Mongo; the combat service supplies the facts.

import { BATTLE_PLAYER_SLOTS } from '@mc/shared';
import type { Rng } from './battle.types';

/** One party member as the encounter sees it. */
export interface RosterCandidate {
  cid: number;
  afk: boolean;
  online: boolean;
  mapId: number;
  hp: number;
  inBattle: boolean;
}

/**
 * The fighters of a random encounter rolled by `initiatorId`, leader first, at most 5 (slots 10..14).
 * Not in a party (`members` empty) or not the leader: the initiator fights alone. Otherwise every member in party order is
 * kept unless AFK, offline, on another map, dead or already fighting; an empty result falls back to the initiator.
 */
export function selectRoster(initiatorId: number, mapId: number, members: readonly RosterCandidate[], leaderId: number | null): number[] {
  if (members.length === 0 || leaderId !== initiatorId) return [initiatorId];
  const out = members
    .filter((m) => !m.afk && m.online && m.mapId === mapId && m.hp > 0 && (!m.inBattle || m.cid === initiatorId))
    .map((m) => m.cid)
    .slice(0, BATTLE_PLAYER_SLOTS.length);
  return out.length > 0 ? out : [initiatorId];
}

/** Random-encounter enemy count range by roster size: 1 -> 1-2, 2 -> 2-4, 3 -> 3-5, 4-5 -> 4-5. */
export function enemyRange(rosterSize: number): { min: number; max: number } {
  if (rosterSize <= 1) return { min: 1, max: 2 };
  if (rosterSize === 2) return { min: 2, max: 4 };
  if (rosterSize === 3) return { min: 3, max: 5 };
  return { min: 4, max: 5 };
}

/** Uniform in the range (one RNG draw), capped by the number of distinct normal creature ids on the map. */
export function groupEnemyCount(rosterSize: number, distinctCreatures: number, rng: Rng): number {
  const { min, max } = enemyRange(rosterSize);
  return Math.min(min + Math.floor(rng() * (max - min + 1)), distinctCreatures);
}

/** Slot of the player character fighting as roster entry `index` (leader = 0). */
export const playerSlot = (index: number): number => BATTLE_PLAYER_SLOTS[index];

export interface Combatant {
  slot: number;
  side: 'player' | 'enemy';
  kind: 'character' | 'creature' | 'pet';
  alive: boolean;
}

/** Slots of the ALIVE player characters that still owe a command this round (members that left owe nothing). */
export function missingCommands(fighters: Iterable<Combatant>, submitted: ReadonlySet<number>, left: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (const f of fighters) {
    if (f.side === 'player' && f.kind === 'character' && f.alive && !left.has(f.slot) && !submitted.has(f.slot)) out.push(f.slot);
  }
  return out;
}

/** Exp / money share of one survivor: floor division of the leader-level total among the surviving characters. */
export function splitReward(total: number, survivors: number): number {
  return survivors <= 0 ? 0 : Math.floor(total / survivors);
}

/** Survivors of a won battle: player-side characters that are alive (or have no HP pool at all, legacy MaxHP == 0). */
export function isSurvivor(f: { side: string; kind: string; alive: boolean; hpMax: number }): boolean {
  return f.side === 'player' && f.kind === 'character' && (f.alive || f.hpMax === 0);
}

/** What a pet participant is owed at settle: exp only when its owner survived a win (even if the pet died), life drain always. */
export interface PetSettlement {
  petId: number;
  ownerCid: number;
  exp: number | null;
}

export function petSettlements(
  fighters: Iterable<{ kind: string; refId: number; ownerCid?: number }>, survivorCids: ReadonlySet<number>, petExp: number,
): PetSettlement[] {
  const out: PetSettlement[] = [];
  for (const f of fighters) {
    if (f.kind === 'pet' && f.ownerCid !== undefined) out.push({ petId: f.refId, ownerCid: f.ownerCid, exp: survivorCids.has(f.ownerCid) ? petExp : null });
  }
  return out;
}
