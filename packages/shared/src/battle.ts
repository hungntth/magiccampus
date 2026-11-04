// Battle wire types (M2 combat): onSetCharState / onBattleStart pushes, battleUpdateCmd commands, onBattlePlayList
// steps and the revive RPC results. Flash names and numeric ids come from GamePredef.as / BattleStage.as.

export const BattleAction = {
  ATTACK: -10, DEFENCE: -20, ESCAPE: -30, TIMEOUT: -40, SKILL: -50, ITEM: -60,
  CATCH: -70, POSITION: -80, RETURN: -90, PET: -100, AUTO: -110,
} as const;

export const BattleBehavior = {
  STAND: 0, RUN_FAST: 1, RUN_NORMAL: 2, ATTACK: 3, DEAD: 4, HURT: 5, DEFENCE: 6, MAGIC: 7,
  BACK: 10080, TURNBACK: 10100, TURNTO: 10110, DIE: 10120, ESCAPE: 10130,
} as const;

export const BattleParticipantType = { CHARACTER: 2, CREATURE: 12, PET: 39 } as const;
export const BattleResult = { LOSE: 0, WIN: 1, FLED: 2 } as const;
export const CharState = { NORMAL: 1, BATTLE: 5 } as const;
/** Client countdown per round; the server deadline is 30 s. */
export const BATTLE_TURN_SECONDS = 25;
/** Solo player slot, and the slot order enemies are filled in. */
export const BATTLE_PLAYER_SLOT = 10;
export const BATTLE_ENEMY_SLOTS: readonly number[] = [0, 2, 1, 4, 3];

/** battleUpdateCmd([cmd]) argument (Battle.battleCmd): tid = target slot, id = bag item row id / skill id. */
export interface BattleCommand {
  tid: number;
  action: number; // BattleAction
  id: number;
  level: number;
}

export interface BattleParticipant {
  id: number; // character id or creature template id
  type: number; // BattleParticipantType
  battleId: number; // slot 0..19
  name: string;
  level: number;
  hp: number;
  hpMax: number;
  mp: number;
  mpMax: number;
  sp: number;
  spMax: number;
  resCode: string; // sprite resource code (creature res_code / character resCode)
  bossFlag: number;
  classId?: number; // characters only: the client picks the same sheet as on the map
  gender?: number;
}

/** onBattleStart payload. `cList` is keyed by slot (as a string). */
export interface BattleStart {
  battleFieldId: string;
  nid: number; // starting NPC id, 0 for random encounters
  cList: Record<string, BattleParticipant>;
  bossFlag: number;
  sneakFlag: number;
  guest: boolean;
  airBattle: boolean;
}

/** sSObj / tSObj: hHp / rHp carry the NEW hp (the client shows the popup `old - new`). */
export interface BattleStateObj {
  hHp?: number; // hit: new hp (unclamped on overkill)
  rHp?: number; // heal: new hp
  rMp?: number; // heal: new mp
  uMp?: number; // resource cost: new mp, no popup
  cri?: number; // truthy = critical hit
  skill?: string; // banner text
  miss?: boolean; // H5 extension: attack dodged ("Né" popup)
}

/** H5 extension on the end marker: what the win granted (the Flash client had no report window). */
export interface BattleReport {
  exp: number;
  money: number;
  items: { name: string; count: number }[];
}

export interface BattleStep {
  sid: number;
  tid: number;
  bid: number; // BattleBehavior
  sSObj?: BattleStateObj;
  tSObj?: BattleStateObj;
  delay?: number; // ms to wait after the group finishes (last step of a group)
  end?: boolean;
  result?: number; // BattleResult, on the end marker
  report?: BattleReport;
}

/** onBattlePlayList payload: groups run in order, the steps of one group run together. */
export type BattlePlayList = BattleStep[][];

export interface SetCharState {
  cid: number;
  state: number; // CharState
}

/** questKill entry inside ChaQuest (phase B): num = REMAINING kills (legacy semantics). */
export interface QuestKill {
  creatureId: number;
  num: number;
}

/** reliveSwitch() result: 0 = nothing to do, 2 = free revive dialog (legacy BattleStage.onReliveSwitch). */
export type ReliveSwitchResult = 0 | 2;
