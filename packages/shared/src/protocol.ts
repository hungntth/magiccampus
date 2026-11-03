// Wire protocol between the H5 client and the NestJS game server (JSON over WebSocket).
// Mirrors the old RTMP shape: client "call" (method + args) and server "callback" pushes.

export type ClientMessage = { t: 'call'; id: number; m: string; a: unknown[] };

export type ServerMessage =
  | { t: 'res'; id: number; ok: true; r: unknown }
  | { t: 'res'; id: number; ok: false; e: RpcError }
  | { t: 'cb'; m: string; a: unknown[] };

export interface RpcError {
  code: string;
  msg: string;
}

export const ErrorCodes = {
  INVALID_ARGS: 'INVALID_ARGS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  FORBIDDEN: 'FORBIDDEN',
  INTERNAL: 'INTERNAL',
  UNKNOWN_METHOD: 'UNKNOWN_METHOD',
} as const;

export interface CharListEntry {
  id: number;
  name: string;
  level: number;
  classId: number;
  gender: number;
  deleted: boolean;
  createTime: number;
  iconCode: string;
  portraitCode: string;
}

export interface CharListResponse {
  charList: CharListEntry[];
  accountInfo: { acountLv: number; maxCharSlots: number; gold: number };
}

export interface ClassInfo {
  id: number;
  name: string;
  description: string;
  iconCodeMale: string;
  iconCodeFemale: string;
  imgCodeMale: string;
  imgCodeFemale: string;
  largeImgMale: string;
  largeImgFemale: string;
}

export interface PlayerData {
  id: number;
  name: string;
  classId: number;
  gender: number;
  level: number;
  exp: number;
  posMapId: number;
  posX: number;
  posY: number;
  dir: number;
  maxHp: number;
  currentHp: number;
  maxMp: number;
  currentMp: number;
  money: number;
  moneyBind: number;
  gold: number;
  iconCode: string;
  attrPoints: number;
  questLog: string; // "|id|id|" finished quests, "|" when none
  qn: number; // active quest count
  attStrength: number;
  attAgility: number;
  attStamina: number;
  attIntelligence: number;
  attEnergy: number;
}

export interface SceneCharacter {
  id: number;
  name: string;
  classId: number;
  gender: number;
  level: number;
  posX: number;
  posY: number;
  posDir: number;
  iconCode: string;
  resCode: string;
}

export interface SceneNpc {
  id: number;
  name: string;
  posX: number;
  posY: number;
  posDir: number;
  iconCode: string;
  resCode: string;
  type: number;
  subType: string; // raw sub_type: "-1", "13|1720|1721", "all"
  questState: number; // H5 extension: initial head marker (QuestState or -1); later via onSetNpcState
}

export interface MapInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  type: number;
  resCode: string;
  safeX: number;
  safeY: number;
  info: string;
}

export interface SceneLoginResponse {
  mapId: number;
  map: MapInfo;
  self: SceneCharacter;
}

export interface MoveUpdate {
  id: number;
  x: number;
  y: number;
  dir: number;
  route: number[][];
}

export interface ChatMessage {
  id: number;
  name: string;
  channelId: number;
  msg: string;
  time: number;
}

export const ChatChannel = {
  LOCAL: 1,
  GLOBAL: 2,
  SYSTEM: 9,
} as const;

// --- NPC talk (clickNpc RPC -> npcFuncInit push) ---

export const NpcType = {
  QUEST: 1, SHOP: 2, MAIL: 3, PLAN: 4, AUCTION: 5, SKILL: 6, BANK: 7, HEAL: 8, TRANSPORT: 9,
  BATTLE: 10, CLASS_QUEST: 11, MAT: 12, CALLBOARD: 13, ANSWER: 14, BOSS: 15, TUTOR: 16, GUILD: 17,
  BUILD: 18, STORY_BATTLE: 19, QUEST_BATTLE: 20, FISH_POOL: 21, PLANT: 22, HERB: 23, GATHER: 24,
  WALK: 25, SYNCHRO: 26, HULA: 27, DOTA: 28, TRIPLE_TOWN: 29,
} as const;

export interface NpcFuncInit {
  npcId: number;
  npcName: string;
  npcType: number; // function type or 0
  npcQuest: { npcId: number; state: number; list: Record<string, QuestView> };
  loopInfo: { d: unknown; flag: boolean };
  // H5 extension: the Flash client read this from its static NPC table; we have no client copy.
  onServiceText: string;
}

// --- Quests (takeQuest / finishQuest / cancelQuest / initQuestManager) ---
// Pushes: onAddChaQuest(ChaQuest) · onCancelQuest(CancelQuestResult) · onSetNpcState(npcId, state)
//         onAddMoney(charId, key: MoneyKey, amount, newTotal) · onUPP(PlayerUpdate) · onPlayerLevelUp(PlayerLevelUp)

export const QuestState = { ENOUGH_LEVEL: 101, CAN_TAKE: 102, TAKEN: 103, CAN_FINISH: 104 } as const;
export const QuestType = { NEWHAND: 1, MAIN: 2, CLASS: 3, WORLD: 4, LOOP: 7, CALLBOARD: 9, GROWUP: 10 } as const;
export const MoneyType = { MONEY_BIND: 1, MONEY: 2, GOLD_BIND: 3, GOLD: 4 } as const;
export const MAX_QUEST_NUM = 25;

export type MoneyKey = 'moneyBind' | 'money' | 'goldBind' | 'gold';

export interface QuestData {
  id: number;
  name: string;
  info: string;
  type: number;
  startText: string;
  completeText: string;
  awardExp: number;
  moneyNum: number;
  moneyType: number;
  startNpc: number;
  finishNpc: number;
  minLevel: number;
  color: number;
}

export interface QuestRequire {
  kind: number; // 1 item · 2 creature · 3 pet
  type: number; // template table: 29 item · 19 equipment · 12 creature
  itemId: number;
  num: number;
  q: number;
  name: string;
}

export interface QuestPos {
  map: number;
  x: number;
  y: number;
  name: string;
}

/** Quest as shown in the NPC dialog / quest panel (offered or active). */
export interface QuestView {
  qid: number;
  state: number; // QuestState
  data: QuestData;
  require: QuestRequire[];
  sName: string; // start NPC name
  fName: string; // finish NPC name
  pos: QuestPos | null; // finish NPC location
}

/** Active quest (onAddChaQuest, initQuestManager). */
export interface ChaQuest extends QuestView {
  takeDate: number; // epoch ms
}

export interface FinishQuestArg {
  i: number;
  s: number;
  n: number;
}

export interface FinishQuestReply {
  flag: boolean;
  qid?: number;
  qn?: number;
  info?: string;
}

export interface CancelQuestResult {
  flag: boolean;
  qid: number;
  qn: number;
  info?: string;
}

export interface InitQuestManagerReply {
  q: Record<string, ChaQuest>;
}

/** onUPP: partial player props after exp/money/level changes. */
export type PlayerUpdate = Partial<Pick<PlayerData, 'level' | 'exp' | 'money' | 'moneyBind' | 'gold' | 'attrPoints'>>;

export interface PlayerLevelUp {
  id: number;
  level: number;
  exp: number;
  lp: number;
}

/** Cumulative exp to reach level L is LEVEL_EXP[L - 1] (levels 1..21, Go player_level_exp.go). */
export const LEVEL_EXP: readonly number[] = [
  1, 73, 358, 926, 1775, 3162, 5360, 8649, 13232, 18510, 25771, 38644, 62425, 98030, 139609, 187700, 242854,
  305634, 376620, 456403, 545587,
];

// --- Main HUD ---

/** checkNetDelay(): server epoch ms. Client delay = round((now - start) / 2) (MiniMapCanvas.checkNetDelay). */
export type NetDelayReply = number;
