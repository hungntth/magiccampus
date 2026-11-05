// M12 pet soul-gem (Menh Hon) contracts and pure level / dissolve rules shared by the pet ring panel and the server.
// Wire (push / reply) shapes live in petSoulWire.ts.

export const PET_SOUL_LEVEL: readonly number[] = [80, 80, 80, 80, 80, 100, 120, 140];
export const PET_SOUL_BAG_SLOTS = 16;
export const PET_SOUL_TEMP_SLOTS = 14;
/** Character bag slots open from the start (owner rule 2026-10-30); openBag sells 13..16. */
export const PET_SOUL_FREE_BAG_SLOTS = 12;
export const PET_SOUL_MAX_LEVEL = 10;
/** Pet ring slots travel on the wire as `slot + 100`. */
export const PET_SOUL_WIRE_OFFSET = 100;
/** Gold (never bound) per extra character bag slot (PET_SOUL_S[21] "10 vang"). */
export const PET_SOUL_OPEN_BAG_GOLD = 10;
/** GamePredef.SOUL_CRSTAL_COST: Pha Le per crystal 1..5; the sixth entry (200 gold) is the advanced (VIP) divination. */
export const SOUL_CRYSTAL_COST: readonly number[] = [4000, 5000, 7000, 9000, 12000];
export const SOUL_ADVANCED_GOLD = 200;
/** Chance (percent) that crystal N lights crystal N + 1 after a divination (Go assumption, no data). */
export const SOUL_CRYSTAL_ADVANCE_PCT: Readonly<Record<number, number>> = { 1: 50, 2: 40, 3: 30, 4: 20 };
/** PetSoulPanel.SOULNUM_PET_BAG_ADD: soul exp price of extra ring slot `openNum2 + 1` (1..8). */
export const PET_SOUL_EXTRA_COST: Readonly<Record<number, number>> = {
  1: 20000, 2: 25000, 3: 30000, 4: 35000, 5: 40000, 6: 45000, 7: 50000, 8: 55000,
};

export interface PetSoulTemplate {
  id: number;
  /** Family key: the Go rule "consecutive ids with the same name and colour". */
  family: string;
  level: number;
  color: number;
  /** data_tbl_pet_soul.type: -1 prey pool / not exchangeable, 1 classic Manh Vo exchange row. */
  type: number;
  exp: number;
  upExp: number;
  chip: number;
  reqChip: number;
  propType: number;
  propValue: number;
  iconCode: string;
}

export interface SoulSlot {
  sid: number;
  exp: number;
  lock?: boolean;
}

export interface PetSoulInfo {
  openNum: number;
  openNum2: number;
  data: Record<string, SoulSlot | null>;
}

export interface SoulBagInfo {
  openNum: number;
  data: Record<string, SoulSlot | null>;
  temp: Record<string, SoulSlot | null>;
  crystalSid: number;
}

export interface OnPetLevelUpPush {
  openNum: number;
  pid: number;
}

/** Number of the eight normal ring sockets unlocked by a pet level (never decreases on persistence). */
export function petSoulOpenNum(level: number): number {
  return PET_SOUL_LEVEL.reduce((open, need) => open + (level >= need ? 1 : 0), 0);
}

/** The full refund for a gem: base exp, every completed rung and its current in-level exp. */
export function soulDissolveExp(slot: SoulSlot, ladder: readonly PetSoulTemplate[]): number {
  const current = ladder.findIndex((row) => row.id === slot.sid);
  if (current < 0) return 0;
  const base = Math.max(0, ladder[0].exp);
  const spent = ladder.slice(0, current).reduce((sum, row) => sum + Math.max(0, row.upExp), 0);
  return base + spent + Math.max(0, slot.exp);
}

export interface SoulLevelPlan {
  nextSid: number;
  poolCost: number;
  /** In-level exp carried into the next level (only > 0 when putInToExp poured more than up_exp). */
  exp: number;
}

/** Plans one level-up; undefined means max level, malformed ladder, or an insufficient pool (Go levelUpGem). */
export function planSoulLevelUp(slot: SoulSlot, ladder: readonly PetSoulTemplate[], pool: number): SoulLevelPlan | undefined {
  const i = ladder.findIndex((row) => row.id === slot.sid);
  if (i < 0 || i >= ladder.length - 1) return undefined;
  const have = Math.max(0, slot.exp);
  const need = Math.max(0, ladder[i].upExp - have);
  if (pool < need) return undefined;
  return { nextSid: ladder[i + 1].id, poolCost: need, exp: Math.max(0, have - ladder[i].upExp) };
}

/** The kind a ring may hold once: the stat the gem raises (prop_type), the family name when a row has none (Go swap_kind.go). */
export function soulKind(template: PetSoulTemplate): string {
  return template.propType > 0 ? `p${template.propType}` : `n${template.family}`;
}

/**
 * A ring cannot contain a second gem of the same kind. `occupied` must already exclude the slot the gem lands in (a swap
 * replaces that gem). An unknown candidate id is refused; unknown occupied ids never block.
 */
export function canPlacePetSoul(sid: number, occupied: readonly number[], templateById: ReadonlyMap<number, PetSoulTemplate>): boolean {
  const candidate = templateById.get(sid);
  if (!candidate) return false;
  const kind = soulKind(candidate);
  return !occupied.some((id) => {
    const other = templateById.get(id);
    return !!other && soulKind(other) === kind;
  });
}

/** Ring socket 1..16 is usable: 1..8 follow openNum (pet level), 9..16 follow openNum2 (PetSoulPanel.updatePetSoulBagView). */
export function ringSlotOpen(info: Pick<PetSoulInfo, 'openNum' | 'openNum2'>, slot: number): boolean {
  if (!Number.isInteger(slot) || slot < 1 || slot > 16) return false;
  return slot <= info.openNum || (slot > 8 && slot <= info.openNum2 + 8);
}
