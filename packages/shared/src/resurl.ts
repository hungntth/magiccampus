// Port of the Flash client's UrlUtil.getUrl + GamePredef RES_URL_* tables.
// A numeric resource code encodes: ext (1e12) | word1 (1e9) | word2 (1e6) | 6-digit number.
// Logical path is then hashed with md5 (prefixed by "resource/" or "icon/") to find the CDN file.

import { md5 } from './md5.js';

const URL_WORD_EXT = 1_000_000_000_000;
const URL_WORD_1 = 1_000_000_000;
const URL_WORD_2 = 1_000_000;
const URL_NUM_LENGTH = 6;

const FOLDER: Record<number, string> = {
  10: '',
  15: 'scene/',
  20: 'item/',
  30: 'item/',
  40: 'tile/',
  50: 'creature/',
  60: 'creature/',
  70: 'equip/',
  80: 'effect/',
  90: 'sound/',
  100: 'bullet/',
  110: 'emotion/',
  120: 'state/',
  130: 'ui/',
  140: 'skill/',
};

const WORD1: Record<number, string> = {
  10: '',
  15: 'SCENE_',
  20: 'SITEM_',
  30: 'ITEM_',
  40: 'TILE_',
  50: 'PC_',
  60: 'NPC_',
  70: 'EQUIP_',
  80: 'EFF_',
  90: 'WAV_',
  100: 'BLT_',
  110: 'EM_',
  120: 'ST_',
  130: 'UI_',
  140: 'SKILL_',
};

const WORD2: Record<number, string> = {
  10: '',
  15: 'FOLDER_',
  16: 'FLOWER_',
  20: 'TREE_',
  30: 'HOUSE_',
  40: 'SPAWN_',
  50: 'DESERT_',
  60: 'FOREST_',
  70: 'MALE_',
  80: 'FEMALE_',
  90: 'FUNC_',
  100: 'CRE_',
  110: 'WEAPON_',
  120: 'SCENE_',
  130: 'PLAYER_',
  140: 'SIDE_',
  150: 'SCREEN_',
  160: 'NPC_',
  170: 'UI_',
  180: 'EFF_',
  190: 'FIRE_',
  200: 'NORMAL_',
  210: 'LOCAL_',
  220: 'GLOBAL_',
  230: 'STAGE_',
  240: 'BATTLE_',
  250: 'LOADING_',
  260: 'FC1_',
  270: 'FC2_',
  280: 'FC3_',
  290: 'FC4_',
  300: 'FC5_',
  310: 'FC6_',
  320: 'MC1_',
  330: 'MC2_',
  340: 'MC3_',
  350: 'MC4_',
  360: 'MC5_',
  370: 'MC6_',
  380: 'FLY_',
  390: 'WING_',
};

const EXT: Record<number, string> = {
  1: '',
  2: '.swf',
  3: '.jpg',
  4: '.png',
  5: '.wav',
  6: '.mp3',
  7: '.ogg',
};

export const ROOT_RES = 'resource/';
export const ROOT_ICON = 'icon/';

export interface DecodedRes {
  ext: number;
  word1: number;
  word2: number;
  num: string;
  path: string;
}

export function decodeResCode(code: number | string): DecodedRes {
  let n = typeof code === 'string' ? Number(code) : code;
  const ext = Math.floor(n / URL_WORD_EXT);
  n = n % URL_WORD_EXT;
  const word1 = Math.floor(n / URL_WORD_1);
  n = n % URL_WORD_1;
  const word2 = Math.floor(n / URL_WORD_2);
  const numStr = String(n);
  const num = numStr.substring(numStr.length - URL_NUM_LENGTH).padStart(URL_NUM_LENGTH, '0');
  const path = `${FOLDER[word1] ?? ''}${WORD1[word1] ?? ''}${WORD2[word2] ?? ''}${num}${EXT[ext] ?? ''}`;
  return { ext, word1, word2, num, path };
}

export function resPath(code: number | string): string {
  return ROOT_RES + decodeResCode(code).path;
}

export function iconPath(code: number | string): string {
  return ROOT_ICON + decodeResCode(code).path;
}

export function hashPath(logicalPath: string): string {
  return md5(logicalPath);
}

export function resHash(code: number | string): string {
  return hashPath(resPath(code));
}

export function iconHash(code: number | string): string {
  return hashPath(iconPath(code));
}

export function mapTilePath(mapResCode: number | string, col: number, row: number): string {
  return `${resPath(mapResCode)}/MAP_${col}_${row}.jpg`;
}

export function mapTileHash(mapResCode: number | string, col: number, row: number): string {
  return hashPath(mapTilePath(mapResCode, col, row));
}
