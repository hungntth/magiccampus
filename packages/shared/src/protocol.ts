// Wire protocol between the H5 client and the NestJS game server (JSON over WebSocket).
// Mirrors the old RTMP shape: client "call" (method + args) and server "callback" pushes.

import type { QuestKill } from './battle.js';
import type { CharProperty } from './character.js';
import type { PetLoginInfo, PetSceneView } from './pet.js';
import type { GuildInfo, GuildMember } from './guild.js';
import type { GuildSlot } from './guildBank.js';
import type { Currencies, TitleView } from './progression.js';
import type { AchieveReqProgress } from './achievement.js';
import type { AwakenLogin } from './statFeatures.js';
import type { ActivityLogin } from './activity.js';
import type { LoopStateDTO, NpcLoopInfo } from './loop.js';
import type { VipLogin } from './vip.js';
import type { OfflineLogin } from './offline.js';
import type { MountLogin } from './mount.js';
import type { StarsData } from './zodiac.js';

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

export interface PlayerData extends PetLoginInfo, Partial<AwakenLogin>, Partial<ActivityLogin>, Partial<VipLogin>, Partial<OfflineLogin>, Partial<MountLogin> {
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
  goldBind: number;
  bagSlotNum: number; // opened general bag pages (1..7)
  bankSlotNum: number; // opened bank pages (1..5)
  selectedMoneyType: number; // payment preference: 1 moneyBind / 2 money (changeMoneyType)
  selectedGoldType: number; // payment preference: 3 goldBind / 4 gold (changeMoneyType)
  iconCode: string;
  attrPoints: number;
  questLog: string; // "|id|id|" finished quests, "|" when none
  qn: number; // active quest count
  attStrength: number;
  attAgility: number;
  attStamina: number;
  attIntelligence: number;
  attEnergy: number;
  property: CharProperty; // final stats (gear + buffs applied), see character.ts
  state: number; // CharState: 1 normal, 5 in battle (always 1 at login in M2: battles end on disconnect)
  /** Guild login payload (M6): own guild object, own member row, guild bank map; absent when the server has no guild module. */
  guild?: GuildInfo | null;
  gData?: GuildMember | null;
  gi?: Record<string, GuildSlot>;
  /** PK opt-in (uif apvp); the minimap PK button shows selected = closed when false. */
  apvp?: boolean;
  /** Progression (M7): special currencies, active titles (`t`, `actT`) and owned title lists (`ct` "|a|b|", `cts` "a|b|"). */
  currencies?: Currencies;
  t?: number;
  actT?: number;
  ct?: string;
  cts?: string;
  /** H5 extension: display data of the active titles. */
  tv?: TitleView;
  atv?: TitleView;
  /** Achievements (M7 phase B): login snapshot (Flash names; reqLog keyed by requirement id). */
  achPnt?: number;
  achieveLog?: Record<string, number>;
  achieveReqLog?: Record<string, AchieveReqProgress>;
  takeAchieveAwardLog?: Record<string, number>;
  /** Stat features (M7 phase C): train soul level / progress (awaken* come from AwakenLogin). */
  trainSoulLvl?: number;
  trainSoulExp?: number;
  /** Zodiac stars (M7 phase D): starsData snapshot (Flash name); finishDate is server time (see getStarsData for the clock). */
  starsData?: StarsData;
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
  /** Party flags (multiplayer phase B); false when the character has no party. */
  inGroup: boolean;
  isLeader: boolean;
  groupAfk: boolean;
  /** Following pet (pets phase B): present only when the character has one and is not in an active party. */
  showPetId?: number;
  showPetObj?: PetSceneView;
  /** Active titles (M7): data_tbl_title ids (0 = none) and their H5 display views. */
  t?: number;
  actT?: number;
  tv?: TitleView;
  atv?: TitleView;
  /** VIP level 0..9 (M8 phase B); absent = 0. */
  pmLevel?: number;
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
  safeFlag: number; // > 0: no random encounters (the client never sends cbom there)
  pk?: number; // > 0: forced PvP map (the entry notice); -1 / 0 none
  sArea?: string; // PK safe rectangles "x1,y1-x2,y2|..." ("0" none), see pk.ts parseSafeAreas
  info: string;
}

export interface SceneLoginResponse {
  mapId: number;
  map: MapInfo;
  self: SceneCharacter;
}

/** createSceneItems(): scene items on the caller's map. H5 joins the template (no client gameData tables). */
export interface SceneItem {
  id: number;
  tid: number;
  type: number; // template type; 3 = transport gate
  name: string; // for gates: destination map name
  posX: number; // top-left of the item SWF stage, map pixels
  posY: number;
  posDir: number; // 1 = mirrored
  layer: number; // 0 = opaque, else alpha 0.6
  resCode: string;
}

export const SceneItemType = { TRANSPORT: 3 } as const;

/** onSceneEnter push after sceneChange(gateId) (H5 payload: same shape as the sceneLogin reply). */
export type SceneEnterPush = SceneLoginResponse;

export interface MoveUpdate {
  id: number;
  x: number;
  y: number;
  dir: number;
  route: number[][];
}

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
  loopInfo: NpcLoopInfo;
  // H5 extension: the Flash client read this from its static NPC table; we have no client copy.
  onServiceText: string;
}

// --- NPC shop (view only): push onOpenShop after clickNpc / npcFuncClick ---

/** Currency a shop price is paid in (legacy Currency.TYPE_*; 'special' = GamePredef.CURRENCY_* id in `pType`). */
export const ShopCurrency = {
  MONEY: 'money', // bạc only (gt = 1)
  MONEY_ALL: 'moneyAll', // bạc or bạc khóa
  GOLD: 'gold', // vàng only (gt = 1)
  GOLD_ALL: 'goldAll', // vàng or kim phiếu
  EX_POINT: 'exPoint',
  HONOR: 'honor',
  SPECIAL: 'special',
} as const;
export type ShopCurrencyKind = (typeof ShopCurrency)[keyof typeof ShopCurrency];

export interface ShopPrice {
  currency: ShopCurrencyKind;
  cost: number;
  pType?: number; // only for 'special'
}

export interface ShopSlotView {
  slotId: number; // data_tbl_shop_slot.id (future buy arg)
  type: number; // 19 equip / 29 item
  itemId: number;
  name: string;
  iconCode: string; // template icon_code, '0' if none
  color: number; // palette index 0..8
  info: string; // template info / description for the tooltip ('' if none)
  amount: number; // -1 unlimited
  stackMax: number; // NumPanel max for the amount dialog (template stack_max; 1 when single_flag)
  st: number; // 1 Hot, 2 Sale, 3 Limit, 4 New, else none
  prices: ShopPrice[]; // 0..2 entries
}

/** Push `onOpenShop` (to the caller). */
export interface OpenShop {
  shopId: number;
  npcId: number; // -1 when not opened from an NPC
  shopType: number; // data_tbl_shop.type: 1 = 12 per page, else 9
  slots: ShopSlotView[];
}

// --- Quests (takeQuest / finishQuest / cancelQuest / initQuestManager) ---
// Pushes: onAddChaQuest(ChaQuest) · onCancelQuest(CancelQuestResult) · onSetNpcState(npcId, state)
//         onAddMoney(charId, key: MoneyKey, amount, newTotal) · onUPP(PlayerUpdate) · onPlayerLevelUp(PlayerLevelUp)

export const QuestState = { ENOUGH_LEVEL: 101, CAN_TAKE: 102, TAKEN: 103, CAN_FINISH: 104 } as const;
export const QuestType = { NEWHAND: 1, MAIN: 2, CLASS: 3, WORLD: 4, LOOP: 7, CALLBOARD: 9, GROWUP: 10 } as const;
export const MoneyType = { MONEY_BIND: 1, MONEY: 2, GOLD_BIND: 3, GOLD: 4 } as const;
export const MAX_QUEST_NUM = 25;
/** QuestData.at: 1 every award row, 2 the player picks one (finishQuest s = award row id), 3 items of the player's class. */
export const QuestAwardMode = { ALL: 1, CHOOSE_ONE: 2, CLASS: 3 } as const;
/** data_tbl_quest_award.kind (GamePredef.QUEST_AWARD_*). */
export const QuestAwardKind = { ITEM: 1, PET: 2, SKILL: 3 } as const;

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
  at: number; // QuestAwardMode
  /** H5 extension: loop id of a loop round (type 7), so the client can cancel / repair its loop. */
  loopId?: number;
}

export interface QuestRequire {
  kind: number; // 1 item · 2 creature · 3 pet
  type: number; // template table: 29 item · 19 equipment · 12 creature
  itemId: number;
  num: number;
  q: number;
  name: string;
}

/** One data_tbl_quest_award row as the quest panel's Quà slots show it. */
export interface QuestAward {
  id: number; // award row id (finishQuest s for QuestAwardMode.CHOOSE_ONE)
  kind: number; // QuestAwardKind
  type: number; // template table: 29 item · 19 equipment · 12 creature
  itemId: number;
  num: number;
  q: number; // equipment quality (0 = template colour)
  name: string; // H5: the client has no template tables
  iconCode: string;
  color: number; // colour index of the granted instance
  reqClass: string; // template req_class ('' = any): CLASS mode shows only the player's class
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
  award: QuestAward[]; // H5: Flash read TBL_QUEST_AWARD from its static data
  questKill: QuestKill[]; // kill objectives, num = REMAINING kills (all of them for a quest not taken yet)
  sName: string; // start NPC name
  sMid: number; // start NPC map id (legacy QuestCanvas sMid), 0 if unknown
  sMap: string; // start NPC map name (H5: the client has no map table)
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
  /** active loop quest states by loop id (Flash player.loopList) */
  l?: Record<string, LoopStateDTO>;
}

/** onUPP: partial player props after exp/money/level changes. */
export type PlayerUpdate = Partial<
  Pick<
    PlayerData,
    | 'level' | 'exp' | 'money' | 'moneyBind' | 'gold' | 'goldBind' | 'attrPoints' | 'currentHp' | 'currentMp' | 'maxHp'
    | 'maxMp' | 'attStrength' | 'attAgility' | 'attStamina' | 'attIntelligence' | 'attEnergy' | 'property' | 'petMaxNum' | 'bagSlotNum'
    | 'bankSlotNum' | 'selectedMoneyType' | 'selectedGoldType' | 'name' | 'currencies' | 'pmLevel'
  >
>;

export interface PlayerLevelUp {
  id: number;
  level: number;
  exp: number;
  lp: number;
}

// --- Main HUD ---

/** checkNetDelay(): server epoch ms. Client delay = round((now - start) / 2) (MiniMapCanvas.checkNetDelay). */
export type NetDelayReply = number;
