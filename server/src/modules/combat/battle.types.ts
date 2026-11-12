// Internal battle model (in memory only): fighters with combat stats, the battle record and the injectable RNG type.
// The wire shapes live in @mc/shared battle.ts.

import type { AddItemNotice, BagItem, BattleReport, BattleStart, LearnedSkill, SkillCategory } from '@mc/shared';
import type { Push } from '../inventory/pushes';
import type { KillCredit } from '../quest/quest.service';
import type { SkillSpec } from './damage';
import type { ActiveBuff, ActiveStatus } from './mechanics/battle-buffs';
import type { DoomsdayStrike } from './mechanics/doomsday';
import type { FairyKit } from './mechanics/fairy-battle-rules';
import type { DeathRule } from './mechanics/revive';
import type { SummonPlan } from './mechanics/summon';

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
  criticalDmg: number; // Go CriticalDmg: base 200 + bonus (characters, creatures), bonus only for pets; × (class base + bonus) / 100
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
  // M10 E2.-1 (current Go formula); optional so inline test fighters stay valid
  defy?: number; // XPN chance (finalDefy)
  rebornRate?: number; // Miễn Tử (finalRebornRate)
  breakReborn?: number; // Phá Miễn Tử (finalBreakReborn)
  // M10 E2.6 buff pseudo props 908 / 909 (immunity: the hit deals 0) and 910 / 911 (every hit of that kind resisted)
  immunePhys?: number;
  immuneMagic?: number;
  fullResistPhys?: number;
  fullResistMagic?: number;
  // M13 G2 (fairy buffs): Go 901 damage taken % (negative = less), 903 reflect % of every hit taken, life steal % of damage dealt
  damageTaken?: number;
  reflectAll?: number;
  lifeSteal?: number;
}

/**
 * M10 E2 NPC kit (Go Participant fields set by the feature builders): skill pool override (else data_tbl_creature_skill),
 * AI roll scale (Go SkillChanceScale, 0 = unscaled), opener queue, 4-slot rotation, immunities and the control resist.
 */
export interface NpcKit {
  pool?: number[];
  chanceScale?: number;
  opener?: number[];
  rotation?: number[][];
  controlImmune?: boolean;
  debuffImmune?: boolean;
  controlResist?: number; // minion hard-control resist (points)
  elite?: boolean; // E2.8 combo / counter caps lifted
}

/** Loot credited to the bag at settle; its pushes (onAddItem, onAddCharactorSlot, onRedMsg) go out at battlePlayEnd. */
export interface BattleLoot {
  changed: BagItem[];
  notices: AddItemNotice[];
  bagFull: boolean;
  /** Temp-bag / Túi tạm thời pushes (onAddTempDirect, warnTemporaryBag, onAddTemporaryItem, notes) sent after the bag pushes. */
  pushes?: Push[];
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
  wp?: string; // characters only: weapon art in hand
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
  deathImmuneUsed?: boolean; // Miễn Tử already saved this fighter once in this battle
  // M10 E2: NPC kit, battle buffs / statuses (mechanics/battle-buffs.ts), pre-buff stat snapshot, debuff rates by kind
  npc?: NpcKit;
  buffs?: ActiveBuff[];
  statuses?: ActiveStatus[];
  statBase?: Partial<Record<string, number>>;
  debuffHit?: number[];
  debuffResist?: number[];
  summon?: SummonPlan; // E2.2 / E2.4 summon or split plan (enemy NPCs)
  roundRevives?: number; // E2.3 same-round revives left (Atula)
  deathMarks?: number; // E2.7 Mehdi stacks on this unit
  doomsday?: DoomsdayStrike; // E2.10 world boss Ngày Diệt Vong
  fairy?: FairyKit; // M13 G2: the guarding fairy's active skills (player characters, PvE and PvP)
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

/**
 * M10 battle context: which feature started the battle (BattleHooks key) and its facts. roundCap is a per-battle round
 * limit (unset = Go: PvE has none); reaching it without a winner is a loss.
 */
export interface BattleContext {
  source: string; // "dungeon", "star", "nineboss", …
  bossNid?: number; // the NPC whose line-up is fought
  floor?: number;
  key?: string; // feature sub-key (dungeon key, …)
  roundCap?: number;
  // M10 phase I
  noRewards?: boolean; // world boss: no encounter exp / bound silver / loot (the event pays per battle itself)
  atkMul?: number; // multiplier of the player characters' attack and magicAttack (world boss cheer)
  bossLevel?: number; // schedule boss: members more than 10 levels above it get exp 1 and no loot
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
  pvp?: boolean; // M6 PvP: two player sides (attacker 'player' at slot 10, target 'enemy' at slot 0); no rewards
  /** M9 spectate: the onBattleStart payload shown to watchers (the attacker's view in PvP) and the watching character ids. */
  start?: BattleStart;
  watchers?: Set<number>;
  ctx?: BattleContext; // M10: feature battles (end hooks, battlePlayEnd reply, round cap)
  deathRule?: DeathRule; // M10 E2.3 revive rule asked after every death settle
  fallen?: Fighter[]; // M10 E2.2 / E2.4 corpses taken off the board (refill, split): still rewarded at settle
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
  catch?: { catchable: number; room: number; bonusPoints?: number }; // CATCH (-70): target template facts + free pet slots at command time
}
