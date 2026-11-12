// Ấn Chương (medal) contract (M13 phase E2, legacy MedalPanel / MedalSlot). RPCs (Flash names): getMedalInfo() -> MedalInfo, moveMedal(fromSid, toSid) ->
// null + push onMoveMedal, arrangeMedalBag() -> MedalBagMap, upMedal(index) -> MedalOpPush + push onUpMedal, breakMedal(index, count, breakType) ->
// MedalOpPush (or the literal "ban" for a rare medal) + push onBreakMedal; H5 catalog read getMedalCatalog() -> MedalCatalog.
// Pushes: onMoveMedal, onUpMedal, onBreakMedal, updateMedalInBag (a granted stack), onUPP (character stats), onRefreshPetProp (pet medals).
// Slot ids: bag 1..600 (display <= 320), pet equip 1001..1005, character equip 2001..2005; 1006 / 2006 are the engrave lines (never real slots).

export const MEDAL = {
  BAG_MAX: 600,
  BAG_DISPLAY: 320,
  PET_FIRST: 1001,
  PET_LAST: 1005,
  PET_ENGRAVE: 1006,
  CHAR_FIRST: 2001,
  CHAR_LAST: 2005,
  CHAR_ENGRAVE: 2006,
  /** Panel-only slots of the client (never sent to the server). */
  UP_SLOT: 3001,
  BREAK_SLOT: 3000,
  /** Medals of quality >= 4 cannot be dissolved. */
  RARE_Q: 4,
  /** Panel value = prop_val / 100. */
  DISPLAY_DIVISOR: 100,
  /** `moveMedal` push `type`. */
  TYPE_CHAR: 1,
  TYPE_PET: 2,
  MAX_LEVEL: 10,
} as const;

export const MEDAL_RARE_REPLY = 'ban';

export interface MedalEntry {
  i: number;
  /** data_tbl_medal id. */
  t: number;
  n: number;
}

/** Slot id (string) -> entry; the id inside the entry equals the key. */
export type MedalBagMap = Record<string, MedalEntry>;

export interface MedalBuff {
  /** Active engrave line id (data_tbl_medal row of sid 1006 / 2006), 0 = none. */
  t: number;
}

export interface MedalInfo {
  medalExp: number;
  medalBag: MedalBagMap;
  petBuff: MedalBuff;
  charBuff: MedalBuff;
}

export interface MoveMedalPush {
  type: number;
  joinTid: number;
  petJoinTid: number;
  /** Slot that became empty (bag or equip). */
  del?: number;
  /** Changed equip slots. */
  pa: MedalBagMap;
  /** Changed bag slots. */
  ba: MedalBagMap;
}

export interface MedalOpPush {
  medalExp: number;
  del?: number;
  ba: MedalBagMap;
}

/** H5 catalog row (the client has no data_tbl_medal). */
export interface MedalRow {
  id: number;
  basic: number;
  level: number;
  /** Equip slot the medal fits (1001..1005 pet, 2001..2005 character) or 1006 / 2006 for an engrave line. */
  sid: number;
  clevel: number;
  exp: number;
  upExp: number;
  q: number;
  pt: number;
  pv: number;
  /** 1 = the value is a percent. */
  pf: number;
  name: string;
  desc: string;
  icon: string;
  /** "|a|b|c|d|e|" basic ids of an engrave line. */
  join: string;
}

export interface MedalCatalog {
  medals: MedalRow[];
}

export const MEDAL_TEXT = {
  BAG_FULL: 'Túi ấn chương đã đầy, hãy dọn bớt 1 ô rồi thử lại.',
  WRONG_SLOT: 'Vị trí không đúng',
  LOW_LEVEL: 'Cấp độ không đủ',
  CHAR_LOW_LEVEL: 'Cấp độ nhân vật không đủ',
  MAX_LEVEL: 'Đã đạt cấp cao nhất',
  NO_EXP: 'Không đủ kinh nghiệm thăng cấp',
  RARE: 'Ấn Chương quý hiếm, không thể phân giải!',
  EMPTY_SLOT: 'Ô trống',
  BAD_MOVE: 'Không thể di chuyển ấn chương tới vị trí này',
} as const;

export const medalIsPetEquip = (sid: number): boolean => sid >= MEDAL.PET_FIRST && sid <= MEDAL.PET_LAST;
export const medalIsCharEquip = (sid: number): boolean => sid >= MEDAL.CHAR_FIRST && sid <= MEDAL.CHAR_LAST;
export const medalIsEquip = (sid: number): boolean => medalIsPetEquip(sid) || medalIsCharEquip(sid);
export const medalIsBag = (sid: number): boolean => Number.isInteger(sid) && sid >= 1 && sid <= MEDAL.BAG_MAX;

/** Panel value of a medal line (MedalPanel prints propVal / 100, "%" when preflag = 1). */
export const medalPanelValue = (row: Pick<MedalRow, 'pv'>): number => row.pv / MEDAL.DISPLAY_DIVISOR;

/**
 * Engrave line of five worn medals (Go gamedata.MedalEngraveLine): all five slots filled with distinct basic ids, line level = the lowest worn level
 * (level 0 activates nothing), and the line row (sid = engrave slot) whose `join` lists exactly those five basic ids. Lowest id wins a tie.
 */
export function medalEngraveLine(engraveSid: number, equipped: readonly (MedalRow | undefined)[], lines: readonly MedalRow[]): MedalRow | undefined {
  if (equipped.length !== 5) return undefined;
  const basics = new Set<number>();
  let minLevel = Infinity;
  for (const m of equipped) {
    if (!m || m.basic <= 0) return undefined;
    basics.add(m.basic);
    minLevel = Math.min(minLevel, m.level);
  }
  if (basics.size !== 5 || minLevel <= 0) return undefined;
  let found: MedalRow | undefined;
  for (const l of lines) {
    if (l.sid !== engraveSid || l.level !== minLevel) continue;
    const parts = l.join.split('|').map((s) => s.trim()).filter((s) => s !== '').map(Number);
    if (parts.length !== 5 || !parts.every((p) => basics.has(p)) || new Set(parts).size !== 5) continue;
    if (!found || l.id < found.id) found = l;
  }
  return found;
}

/** Items that credit medal exp on a double click (Go effect_point_items.go; amounts from the item descriptions): Ngọc Vinh Quang, Túi Quà Kinh Nghiệm / EXP Ấn Chương. */
export const MEDAL_EXP_ITEMS: Readonly<Record<number, number>> = { 3816: 25, 5114: 125, 5275: 2000 };
