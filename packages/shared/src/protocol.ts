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
  gold: number;
  iconCode: string;
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
  subType: number;
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
