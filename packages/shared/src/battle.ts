// Battle wire types (M2 combat): onSetCharState / onBattleStart pushes, battleUpdateCmd commands, onBattlePlayList
// steps and the revive RPC results. Flash names and numeric ids come from GamePredef.as / BattleStage.as.

import type { LearnedSkill } from './skill.js';

export const BattleAction = {
  ATTACK: -10, DEFENCE: -20, ESCAPE: -30, TIMEOUT: -40, SKILL: -50, ITEM: -60,
  CATCH: -70, POSITION: -80, RETURN: -90, PET: -100, AUTO: -110,
} as const;

export const BattleBehavior = {
  STAND: 0, RUN_FAST: 1, RUN_NORMAL: 2, ATTACK: 3, DEAD: 4, HURT: 5, DEFENCE: 6, MAGIC: 7,
  BACK: 10080, TURNBACK: 10100, TURNTO: 10110, DIE: 10120, ESCAPE: 10130, CATCHED: 10160,
  // M10 E2 (BattleStage.globalBehavior / BattleCreatureView): stand up after a revive, summon cast, unit removed, unit fades in
  RELIVE: 12000, SUMMON: 16000, RETURNED: 17000, SUMMONED: 18000,
} as const;

export const BattleParticipantType = { CHARACTER: 2, CREATURE: 12, PET: 39 } as const;
export const BattleResult = { LOSE: 0, WIN: 1, FLED: 2 } as const;
export const CharState = { NORMAL: 1, BATTLE: 5 } as const;
/** Client countdown per round; the server deadline is 30 s. */
export const BATTLE_TURN_SECONDS = 25;
/** Solo player slot, and the slot order enemies are filled in. */
export const BATTLE_PLAYER_SLOT = 10;
/** Group battle (M3 phase C): up to 5 player characters, leader first, at slots 10..14. */
export const BATTLE_PLAYER_SLOTS: readonly number[] = [10, 11, 12, 13, 14];
export const BATTLE_ENEMY_SLOTS: readonly number[] = [0, 2, 1, 4, 3];

/** Pet fighters sit at owner slot + BATTLE_PET_SLOT_OFFSET (15..19). */
export const BATTLE_PET_SLOT_OFFSET = 5;

/** battleUpdateCmd([ownerCmd, petCmd?]) entry (index 0 = owner, index 1 = pet): tid = target slot, id = bag item row id / skill id. */
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
  // type 39 (pet) only: the owner's character id, the creature template, and the look codes (strings, see pet.ts)
  cid?: number;
  tid?: number;
  colorCode?: string;
  iconCode?: string;
  element?: number;
  skills?: LearnedSkill[]; // type 39: the pet's battle-usable skills, for its command menu
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
  miss?: boolean; // H5 extension: attack dodged or resisted (no damage)
  /** GamePredef.BS_STATUS text floated over the unit ("Né tránh", "Kháng cự", "Vô hiệu"), or {text, color, size}. */
  status?: string | { text: string; color?: number; size?: number };
  reborn?: number; // Miễn Tử saved the unit (or a revive): its new hp, "Miễn tử" popup
  catchF?: CatchFailed; // failed catch (-70): the client of `cid` shows the rate text
  // M10 E2 buff icons (BattleCreatureView.battleState): add one, drop ids, drop every icon (death / revive)
  buffAdd?: BattleBuffAdd;
  buffDel?: number | number[];
  buffClear?: number;
}

/** sSObj / tSObj buffAdd (Go buffAddState): TBL_BUFF id, rounds shown (+1, Go), icon = H5 extension (TBL_BUFF icon_code). */
export interface BattleBuffAdd {
  id: number;
  round: number;
  icon?: string;
}

/** sSObj.catchF (GamePredef.BS_CATCH_FAILED): rate > 0 = "Bạn có {rate}% xác suất...", rate 0 = "Điểm bắt Pet của bạn là {selfCatch}...". */
export interface CatchFailed {
  cid: number; // the catching character
  rate: number; // percent, 0 when a gate failed
  selfCatch: number; // the catcher level
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
  // M10 E2.2 summon cast (bid 16000): type 2 and the new units (Go buildNPCSummonActions)
  type?: number;
  creList?: BattleParticipant[];
}

/** onBattlePlayList payload: groups run in order, the steps of one group run together. */
export type BattlePlayList = BattleStep[][];

/** onCmdReady(slot) push (positional arg): the player character at this slot submitted its command, so its wait icon clears. */
export type BattleCmdReady = number;

export interface SetCharState {
  cid: number;
  state: number; // CharState
}

/** questKill entry inside ChaQuest (phase B): num = REMAINING kills (legacy semantics). */
export interface QuestKill {
  creatureId: number;
  num: number;
}

/** reliveSwitch() result (M9): 0 = alive / in battle, else the map relive mode 1 Hình Nhân, 2 free, 3 gold (world boss). */
export type ReliveSwitchResult = 0 | 1 | 2 | 3;

/** Push `onWatch(start)` (M9 spectate): the watched battle's onBattleStart payload; `onWatchEnd()` closes the stage. */
export type WatchPush = BattleStart & { watch: true };

/** startWatch(targetCid) refusals (Go combat/watch.go), replied as `{success:false, error}` plus onSystemSay. */
export const WATCH_ERR = {
  INVALID: 'Không thể xem trận chiến này.',
  SELF_IN_BATTLE: 'Bạn đang trong trận chiến.',
  OFFLINE: 'Người chơi không trực tuyến.',
  OTHER_MAP: 'Người chơi không ở cùng bản đồ.',
  NOT_IN_BATTLE: 'Người chơi không trong trận chiến.',
  ENDED: 'Trận chiến đã kết thúc.',
} as const;

export interface StartWatchReply {
  success: boolean;
  error?: string;
}

/** Delay between the watched battle's end marker and onWatchEnd. */
export const WATCH_END_DELAY_MS = 5000;
