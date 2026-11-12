// Social wire contract (multiplayer phase A, M14 A): chat channels (legacy ids), onSay / onWisper / onP2pWisper pushes, chat limits,
// the whitelisted showChaInfo view, relationships (friend / black / enemy / couple / tutor / brother) and intimacy (party.ts, trade.ts separate).

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
  /** Guild name, "Không bang hội" when none (legacy showChaInfo.guild). */
  guild?: string;
}

/** Relationship wire types (GamePredef.RELATIONSHIP_TYPE). Couple / tutor / brother rows are written only by their features. */
export const RelationType = { FRIEND: 1, BLACK: 2, ENEMY: 3, COUPLE: 4, TUTOR: 5, BROTHER: 6 } as const;
export type RelationTypeId = (typeof RelationType)[keyof typeof RelationType];

/** Caps per type (GamePredef.RELATIONSHIP_SIZE): friends 120, blacklist 30, enemies 100. Couple / tutor / brother are uncapped. */
export const RelationLimits = { FRIEND: 120, BLACK: 30, ENEMY: 100 } as const;

/** Types `addRelationByName` accepts (Go: only 1..3). */
export const ADDABLE_RELATION_TYPES: readonly RelationTypeId[] = [RelationType.FRIEND, RelationType.BLACK, RelationType.ENEMY];

/** Rows that make the other player a "friend" of the owner (friend tab, couple, tutor, brother); enemy and black do not. */
export const BOND_RELATION_TYPES: readonly RelationTypeId[] = [
  RelationType.FRIEND, RelationType.COUPLE, RelationType.TUTOR, RelationType.BROTHER,
];

/** Rows owned by their feature (marriage / mentor / brotherhood): `delRelationship` refuses them. */
export const MANAGED_RELATION_TYPES: readonly RelationTypeId[] = [RelationType.COUPLE, RelationType.TUTOR, RelationType.BROTHER];

export const isBondRelation = (type: number): boolean => BOND_RELATION_TYPES.some((t) => t === type);
export const isManagedRelation = (type: number): boolean => MANAGED_RELATION_TYPES.some((t) => t === type);

/** One list row. `id` is the relationship row id (used by delRelationship), `cid` the other character; `data` only when online. */
export interface RelationEntry {
  id: number;
  cid: number;
  name: string;
  level: number;
  classId: number;
  iconCode: string;
  type: RelationTypeId;
  /** Intimacy (điểm thân mật) of this direction; 0 for rows without one. */
  intimacy: number;
  data?: { online: true };
}

/** Push `onInitViewImC` (reply to the fire-and-forget initViewImC): snapshot of every list, newest first. */
export interface InitViewImC {
  friend: RelationEntry[];
  black: RelationEntry[];
  enemy: RelationEntry[];
  couple: RelationEntry[];
  tutor: RelationEntry[];
  brother: RelationEntry[];
}

/** Snapshot key of each wire type. */
export const RELATION_LIST_KEY = {
  [RelationType.FRIEND]: 'friend',
  [RelationType.BLACK]: 'black',
  [RelationType.ENEMY]: 'enemy',
  [RelationType.COUPLE]: 'couple',
  [RelationType.TUTOR]: 'tutor',
  [RelationType.BROTHER]: 'brother',
} as const satisfies Record<RelationTypeId, keyof InitViewImC>;

/** Push `onBeFriendOfOther` to the target of a friend add: `id` mirrors `otherId` (the requester). */
export interface BeFriendOfOther {
  id: number;
  otherId: number;
  name: string;
  /** The target already holds a friend / couple / tutor / brother row toward the requester: show a note, no prompt. */
  alreadyFriend: boolean;
}

/** `refuseToAddFriend` argument (the refuser is the session character; `selfName` is ignored by the server). */
export interface RefuseToAddFriendArg {
  targetId: number;
  selfName: string;
}

/** Push `onRefusedToAddFriend` to the requester. */
export interface RefusedToAddFriend {
  id: number;
  name: string;
}

/** Push `onSetClose(otherId, otherName, num)` is positional: num > 0 new total, num < 0 a drop by -num, 0 reset. */
export type SetClosePush = [otherId: number, otherName: string, num: number];

/** Intimacy gift items (template id -> points per unit), `useIntimacyItem(targetName, qty, templateId)`. */
export const INTIMACY_ITEMS: Readonly<Record<number, number>> = { 32: 660, 1302: 60, 1303: 60, 1315: 660 };
export const INTIMACY_ITEM_MAX_QTY = 9999;

/** Points per unit of an intimacy item, or null for any other template. */
export function intimacyItemAmount(templateId: number): number | null {
  return Object.prototype.hasOwnProperty.call(INTIMACY_ITEMS, templateId) ? INTIMACY_ITEMS[templateId] : null;
}

/** Team intimacy: +6 per player at most once per 55 s (won team battle and the 60 s online-party tick share the throttle). */
export const TEAM_INTIMACY = { gain: 6, intervalMs: 55_000, tickMs: 60_000 } as const;

/** `useIntimacyItem` reply. */
export interface UseIntimacyItemReply {
  success: true;
}

/** Client text of the friend-request pushes (CALLBACK_S[96] / [97] / [98]). */
export const FRIEND_REQUEST_TEXT = {
  note: (name: string): string => `${name} kết bạn với bạn.`,
  ask: (name: string): string => `${name} kết bạn với bạn, bạn có muốn kết bạn với người chơi này không?`,
  refused: (name: string): string => `Tiếc quá, ${name} đã từ chối kết bạn với bạn.`,
} as const;

/** Chat line of `onSetClose` (CALLBACK_S[77] / [78] / [103]). */
export function setCloseLine(name: string, num: number): string {
  if (num > 0) return `Bạn và ${name} có điểm thân mật tăng lên: ${num}`;
  if (num < 0) return `Điểm thân mật của bạn và ${name} giảm xuống: ${-num}`;
  return `Điểm thân mật của bạn và ${name} đã trở thành: 0`;
}
