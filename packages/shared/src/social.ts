// Social wire contract (multiplayer phase A): chat channels (legacy ids), onSay / onWisper / onP2pWisper pushes,
// chat limits, the whitelisted showChaInfo view and friends/blacklist relationships (party.ts, trade.ts are separate).

import type { BagItem } from './inventory.js';
import type { CharProperty } from './character.js';

/** Legacy channel ids (GamePredef MSG_CHANNEL_*); SYSTEM is H5-local (client log only, never sent). */
export const ChatChannel = {
  LOCAL: 0,
  WORLD: 1,
  GUILD: 2,
  TEAM: 3,
  WHISPER: 4,
  AREA: 5,
  HEADLINE: 6,
  RUMOUR: 9,
  SYSTEM: 99,
} as const;

/** `sourceIdType` of a character (TBL_CHARACTOR); the Flash whisper formatter only renders this value. */
export const SOURCE_ID_CHARACTER = 2;

export const ChatLimits = {
  /** Item template "Loa" consumed by a world message. */
  LOA_ITEM_ID: 719,
  MAX_MSG_LEN: 500,
  /** Private chat window text cap (CHAT_STR_MAX). */
  MAX_P2P_LEN: 55,
  /** Server rate limit shared by say, wisper and p2pWisper (RPC_DELAY say 1100 ms). */
  INTERVAL_MS: 1100,
  /** World chat is free once per window for characters of at least this level. */
  WORLD_FREE_LEVEL: 10,
  WORLD_FREE_WINDOW_MS: 5 * 60 * 1000,
} as const;

/** Push `onSay` (legacy ChatCanvas.onSay keys). `type` = sourceIdType, `cname` = name used for blacklist checks. */
export interface SayPush {
  channelId: number;
  id: number;
  type: number;
  name: string;
  cname: string;
  msg: string;
  pmLevel: number;
}

/**
 * Push `onWisper`, sent to the target and echoed to the sender (`self`). `id` / `name` are the sender, `targetName` the
 * receiver; `sourceIdType` is always SOURCE_ID_CHARACTER.
 */
export interface WisperPush {
  sourceIdType: number;
  id: number;
  name: string;
  targetName: string;
  msg: string;
  self: boolean;
}

/** Push `onP2pWisper(text, senderId, senderName)` is positional; `onP2pWisperError(targetId)` when the target is offline. */
export interface P2pWisper {
  text: string;
  senderId: number;
  senderName: string;
}

/** `showChaInfo(cid)` reply: whitelisted view of an online character (no money, gold or position). */
export interface ChaInfo {
  id: number;
  name: string;
  classId: number;
  gender: number;
  level: number;
  iconCode: string;
  /** Equipped items (equip sids 1..22); the Flash key spelling is kept. */
  equiptList: BagItem[];
  /** Final stats, as in the character panel. */
  property: CharProperty;
}

/** Relationship wire types (GamePredef.RELATIONSHIP_TYPE); enemy / couple / tutor / brother (3..6) are not ported. */
export const RelationType = { FRIEND: 1, BLACK: 2 } as const;
export type RelationTypeId = (typeof RelationType)[keyof typeof RelationType];

/** Caps per type (GamePredef.RELATIONSHIP_SIZE): friends 120, blacklist 30. */
export const RelationLimits = { FRIEND: 120, BLACK: 30 } as const;

/** One list row. `id` is the relationship row id (used by delRelationship), `cid` the other character; `data` only when online. */
export interface RelationEntry {
  id: number;
  cid: number;
  name: string;
  level: number;
  classId: number;
  iconCode: string;
  type: RelationTypeId;
  data?: { online: true };
}

/** Push `onInitViewImC` (reply to the fire-and-forget initViewImC): snapshot of both lists, newest first. */
export interface InitViewImC {
  friend: RelationEntry[];
  black: RelationEntry[];
}
