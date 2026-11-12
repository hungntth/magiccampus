// Hồn Khí (deco) contract (M13 phase E1, legacy DecoratePanel / DecorateItem). RPCs (Flash names), all answering the full DecoInfo:
// activeDecoShow(id, position), equipDecoShow(id, position), equipOffDecoShow(id, position), showDecoShow(position), hideDecoShow(position),
// changeShowLvl(showLvl, position), updateActiveDecoShow(obj), addDecoHoleLevel(position), addDecoHoleLevelTenTimes(position); plus
// getDecoSuitProp(suitId, linkSuitId, linkId) -> DecoSuitPropReply and the H5 getDecoCatalog() -> DecoCatalog, getDecoInfo() -> DecoInfo.
// Pushes: onDeco{Head,Light,Foot,Bottom}{On,Off} {cid, decoInfo, pos, res?, mask?}, onUPP (stats / balances). Pure rules live here so the
// client previews and the server cannot drift.

import type { PropLine } from './statFeatures.js';

/** Positions 1..4 = Hoàng Quan (head halo), Thánh Quang (aura), Ấn Tích (footprints), Pháp Trận (circle under the feet). */
export const DECO_POSITIONS = [1, 2, 3, 4] as const;
export const DECO_POSITION_CALLBACK = ['', 'Head', 'Light', 'Foot', 'Bottom'] as const;
/** Base TBL_DECO_HOLE id (level 0 row) per position 1..4. */
export const DECO_BASE_HOLE_IDS = [1, 2, 3, 4] as const;
/** `activeFlag.s[showId]` value of a permanent show (anything else is an expiry in epoch ms). */
export const DECO_PERMANENT_DUE = 1;
export const DECO_RUNE_SLOTS = 16;
export const DECO_TEN_TIMES = 10;
/** Hole level that unlocks look tiers 2 and 3. */
export const DECO_SHOW_LVL_AT = { 2: 30, 3: 50 } as const;
/** Hồn Khí level that opens rune slot 0..15 (holePos = index + 1; odd = character page, even = pet page). Go-invented (client tooltips only). */
export const DECO_RUNE_UNLOCK_LEVELS = [5, 5, 10, 10, 15, 15, 20, 20, 25, 25, 30, 30, 40, 40, 50, 50] as const;
/** Full-suit / linked-suit bonus percents of the pieces' summed props (Go-invented, no client table) and the suit stat types shown. */
export const DECO_SUIT_BONUS_PCT = 20;
export const DECO_LINK_BONUS_PCT = 10;
export const DECO_SUIT_PROP_TYPES = [1, 4, 5] as const;
export const DECO_RATE_LIMIT_MS = 500;

export interface DecoActiveFlag {
  /** Rune slot open flags by 0-based slot index. */
  r: Record<string, number>;
  /** Activated shows: showId -> 1 (permanent) or expiry epoch ms. */
  s: Record<string, number>;
}

export interface DecoPositionInfo {
  position: number;
  /** Current TBL_DECO_HOLE row id, the equipped show id (0 none), visible flag, look tier. */
  hid: number;
  did: number;
  isShow: 0 | 1;
  showLvl: number;
  /** Hole level derived from `hid` (never stored). */
  level: number;
  /** Socketed rune count. */
  n: number;
  /** Socketed rune ids by 0-based slot (holePos - 1), 0 = empty. */
  r: number[];
  activeFlag: DecoActiveFlag;
}

/** The whole Hồn Khí state keyed by position "1".."4" (Flash `player.decoInfo`). */
export type DecoInfo = Record<string, DecoPositionInfo>;

export interface DecoHoleRow {
  id: number;
  position: number;
  level: number;
  nextId: number;
  /** Bí Ngân and silver per attempt, success percent. */
  costNum: number;
  costSil: number;
  rate: number;
  props: PropLine[];
}

export interface DecoShowRow {
  id: number;
  name: string;
  desc: string;
  iconCode: string;
  position: number;
  suitId: number;
  linkSuitId: number;
  /** Unbound gold to activate (0 = event only) and the duration in minutes (<= 1 permanent). */
  activeGold: number;
  t: number;
  props: PropLine[];
  /** res_code1..6 as strings ('0' none): [lv1 main, lv1 mask, lv2 main, lv2 mask, lv3 main, lv3 mask]. */
  res: string[];
}

export interface DecoCatalog {
  holes: DecoHoleRow[];
  shows: DecoShowRow[];
}

export interface DecoSuitPropReply {
  actName: string;
  suitIdObj: Record<string, number>;
  suitProp: { t: number; propVal: number }[];
  actArr: number[];
  actFlag: boolean;
  linkProp: { t: number; propVal: number }[] | 'null';
  linkFlag: boolean;
  actLinkSuitFlag: boolean;
  actLinkSuitName: string;
}

/** onDeco{Head,Light,Foot,Bottom}On: the look of one position (`res` = main art, `mask` = the second layer, '0' none). */
export interface DecoLook {
  pos: number;
  res: string;
  mask: string;
}

export interface DecoOnPush extends DecoLook {
  cid: number;
  decoInfo: DecoInfo;
}

export interface DecoOffPush {
  cid: number;
  pos: number;
  decoInfo: DecoInfo;
}

/** Look tier allowed by the hole level (1 below 30, 2 below 50, 3 at 50). */
export function decoMaxShowLvl(level: number): number {
  return level >= DECO_SHOW_LVL_AT[3] ? 3 : level >= DECO_SHOW_LVL_AT[2] ? 2 : 1;
}

/** Is rune slot `slotIdx` (0-based) open at Hồn Khí level `level`. */
export function decoRuneSlotOpen(level: number, slotIdx: number): boolean {
  const need = DECO_RUNE_UNLOCK_LEVELS[slotIdx];
  return need !== undefined && level >= need;
}

/** Art of a show for a look tier: [main, mask] ('0' = none), the tier clamped to 1..3. */
export function decoShowArt(show: Pick<DecoShowRow, 'res'>, showLvl: number): [string, string] {
  const tier = Math.min(3, Math.max(1, Math.trunc(showLvl) || 1));
  const main = show.res[2 * tier - 2] ?? '0';
  const mask = show.res[2 * tier - 1] ?? '0';
  return [main, mask];
}

/** A show is live while permanent (due <= 1) or before its expiry. */
export const decoShowLive = (due: number, now: number): boolean => due <= DECO_PERMANENT_DUE || due > now;

/** Expiry value stored on activation: permanent for t <= 1 minute, else now + t minutes. */
export const decoShowDue = (t: number, now: number): number => (t <= 1 ? DECO_PERMANENT_DUE : now + t * 60_000);

/** Show ids live on a state at `now`. */
export function decoLiveShows(info: DecoInfo, now: number): Set<number> {
  const out = new Set<number>();
  for (const p of Object.values(info)) {
    for (const [id, due] of Object.entries(p.activeFlag.s)) if (decoShowLive(due, now)) out.add(Number(id));
  }
  return out;
}
