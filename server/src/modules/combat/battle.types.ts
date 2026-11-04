// Internal battle model (in memory only): fighters with combat stats, the battle record and the injectable RNG type.
// The wire shapes live in @mc/shared battle.ts.

import type { AddItemNotice, BagItem, BattleReport, LearnedSkill, SkillCategory } from '@mc/shared';
import type { Push } from '../inventory/pushes';
import type { KillCredit } from '../quest/quest.service';
import type { SkillSpec } from './damage';

/** Returns a float in [0, 1). Injected so damage / round / encounter logic is deterministic in tests. */
export type Rng = () => number;

export interface CombatStats {
  attack: number;
  magicAttack: number;
  defense: number;
  magicDefense: number;
  hit: number;
  dodge: number;
  critical: number;
  criticalDmg: number; // 150 = x1.5
  speed: number;
  combo: number; // percent, from gear rates
  counter: number;
  resiCritical: number;
  resiDefy: number;
  praDef: number;
  praMagDef: number;
  reduceHurt1: number;
  reduceHurt2: number;
  enhPhyHurt: number;
  enhMagicHurt: number;
}

/** Loot credited to the bag at settle; its pushes (onAddItem, onAddCharactorSlot, onRedMsg) go out at battlePlayEnd. */
export interface BattleLoot {
  changed: BagItem[];
  notices: AddItemNotice[];
  bagFull: boolean;
}

export type Side = 'player' | 'enemy';

export interface Fighter extends CombatStats {
  slot: number;
  side: Side;
  kind: 'character' | 'creature' | 'pet';
  refId: number; // character id / creature template id / pet id
  name: string;
  level: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  sp: number;
  spMax: number;
  resCode: string;
  bossFlag: number;
  alive: boolean;
  expBase: number; // map row exp override (> 0), else level * 10 is used
  classId?: number;
  gender?: number;
  // pets only (kind 'pet', player side, slot = owner slot + 5)
  ownerCid?: number;
  tid?: number;
  colorCode?: string;
  iconCode?: string;
  element?: number;
  skills?: readonly number[]; // learned skill ids; a pet skill command must be one of them
  skillList?: readonly LearnedSkill[]; // the battle-usable ones for the cList entry
  // enemies only: set when a character caught it (-70); the pet is created at settle for that slot's member
  caughtBy?: number; // catcher player slot
}

/** What one participant is owed, filled when the battle is settled and pushed at that member's own battlePlayEnd. */
export interface MemberResult {
  report: BattleReport; // exp / money / items granted to this member (zeros when nothing)
  levelUp: boolean; // settle granted a level
  moneyTotal: number; // moneyBind after the reward, for onAddMoney
  quest: KillCredit | null; // kill credit persisted at settle
  loot: BattleLoot | null;
  petPushes: Push[]; // the owner's pet exp / life / level pushes (onUpdatePet.., onRefreshPetProp), sent at battlePlayEnd
  catchPushes: Push[]; // onAddPet per caught pet (or the red no-room note), sent last at battlePlayEnd
}

/** One player character in a battle (solo: exactly one). */
export interface BattleMember {
  cid: number;
  slot: number; // 10..14
  left: boolean; // disconnected mid-battle: counted as dead, nothing is credited, HP already persisted
  acked: boolean; // battlePlayEnd done (or the member is gone)
  result: MemberResult;
}

export interface Battle {
  id: string; // battleFieldId
  characterId: number; // the leader (first member): its level drives the rewards
  members: Map<number, BattleMember>; // by character id, leader first
  commands: Map<number, PlayerCommand>; // this round's submitted commands by player slot
  mapId: number;
  nid: number; // starting NPC id, 0 for random encounters
  fighters: Map<number, Fighter>; // by slot
  round: number;
  ended: boolean; // the result is decided and rewards are settled
  result: number; // BattleResult, meaningful once ended
  busy: boolean; // a round is being resolved
  deadline: number; // epoch ms of the round timeout
}

/** A validated skill cast (MP already checked; the round spends it before the hit). */
export interface SkillCast {
  name: string; // shown as the banner (sSObj.skill)
  category: SkillCategory;
  mpCost: number;
  spec: SkillSpec;
}

/** The player's resolved command for one round. `heal` is the pre-validated potion effect (already consumed). */
export interface PlayerCommand {
  action: number;
  targetSlot: number;
  heal?: { hp: number; mp: number };
  skill?: SkillCast; // set for a cast; absent for a basic attack (including the not-enough-MP fallback)
  leave?: boolean; // ESCAPE queued by a disconnect: the actor runs away and drops out, the battle goes on for the others
  catch?: { catchable: number; room: number }; // CATCH (-70): target template facts + free pet slots at command time
}
