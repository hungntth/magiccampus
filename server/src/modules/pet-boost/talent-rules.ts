// Pure Thien Phu (pet talent) rules, ported from Go application/pettalent + statfeature/pet_talent.go and Flash PetTalentPanel /
// TalentSlot: the stat bonus (sum x power rate), socket gates, stone inlay checks and the fuse / reset result draws.
// sid = page * 10000 + slot: slots 1..9 are upgradeable nodes (`tal`), 10..11 are stone sockets (`inTal`); stones live in the bag.

import { TALENT_MAX_SLOT_LEVEL, talentPowerRate, type PetTalentData } from '@mc/shared';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses, type PropEntry } from '../character/character-stats';
import type { PetTalentRow } from '../gamedata/pet-depth-data';

export type TalentLookup = (id: number) => PetTalentRow | undefined;

/** Flash language lines (TALENT_PANEL_U / TALENT_PANEL_FUNC_U) and Go refusals. */
export const TALENT_TEXT = {
  PVE: 'Điểm Anh Linh cần thăng cấp không đủ',
  GOLD: 'Không đủ Vàng để thăng cấp Ô Thiên Phú',
  GATE_10: 'Tổng cấp độ chưa đạt 20, không thể thăng cấp Ô Thiên Phú',
  GATE_11: 'Tổng cấp độ chưa đạt 35 (không bao gồm Ô Thiên Phú có thể khảm), không thể thăng cấp Ô Thiên Phú này',
  MAX: 'Ô Thiên Phú đã đạt cấp tối đa',
  NO_ROW: 'Thiếu dữ liệu Thiên Phú',
  OCCUPIED: 'Ô Thiên Phú đã có Thiên Phú Thạch, vui lòng gỡ ra trước',
  NOT_OPEN: 'Ô Thiên Phú chưa kích hoạt, không thể khảm nạm',
  STONE_LV: 'Không thể dùng Thiên Phúc Thạch cấp độ cao hơn Ô Thiên Phú',
  STONE_QUALITY: 'Không thể dùng Thiên Phúc Thạch phẩm chất cao hơn Ô Thiên Phú',
  NOT_SOCKET: 'Đây không phải Ô Thiên Phú có thể khảm',
  EMPTY_SOCKET: 'Ô Thiên Phú không có Thiên Phú Thạch',
  SAME_KIND: 'Xác nhận cấp độ và màu của Thiên Phú Thạch tương đồng',
  STONE_MISSING: 'Không tìm thấy Thiên Phú Thạch trong túi',
  BAG_SLOT: 'Trong túi số vật phẩm ở ô {num} không đủ',
  BAG_FULL: 'Túi Thiên Phú đã đầy',
  DIRECTION: 'Số Định Hướng Phù cần cho dung hợp không đủ',
  STONE_MAX: 'Thiên Phú Thạch đã đạt cấp tối đa',
  BAD_BAG_SLOT: 'Vị trí túi Thiên Phú không hợp lệ',
} as const;

export const powerRate = talentPowerRate;

const rate = (key: string): PropEntry => ({ target: { kind: 'rate', key } });
/** Go petTalentDirectProps (1 2 4..11 13 -> flat) and petTalentFloatProps (31 32 58 59..63 -> rates). 58 and 32 are pet-only keys. */
export const TALENT_PROPS: Readonly<Record<number, PropEntry>> = {
  1: BUFF_PROP[1]!, 2: BUFF_PROP[2]!, 4: BUFF_PROP[4]!, 5: BUFF_PROP[5]!, 6: BUFF_PROP[6]!, 7: BUFF_PROP[7]!, 8: BUFF_PROP[8]!,
  9: BUFF_PROP[9]!, 10: BUFF_PROP[10]!, 11: BUFF_PROP[11]!, 13: BUFF_PROP[13]!,
  31: BUFF_PROP[31]!, 32: rate('finalDebuffSuccRate'), 58: rate('finalDebuffResiRate'), 59: BUFF_PROP[59]!, 60: BUFF_PROP[60]!,
  61: BUFF_PROP[61]!, 62: BUFF_PROP[62]!, 63: BUFF_PROP[63]!,
};

/** Per-prop sums of the `tal` + `inTal` records (an id counted once per occurrence) and the power of the inlaid stones. */
export function talentSums(state: PetTalentData, lookup: TalentLookup): { sums: Map<number, number>; power: number } {
  const sums = new Map<number, number>();
  let power = 0;
  for (const [key, ids] of [['tal', Object.values(state.tal ?? {})], ['inTal', Object.values(state.inTal ?? {})]] as const) {
    for (const id of ids) {
      const row = id > 0 ? lookup(id) : undefined;
      if (!row) continue;
      if (key === 'inTal') power += row.p;
      if (row.propType > 0 && row.propVal !== 0) sums.set(row.propType, (sums.get(row.propType) ?? 0) + row.propVal);
    }
  }
  return { sums, power };
}

/** Go petTalentPropTotals: value = floor(sum x (100 + rate) / 100 + 1e-9) / 100 (prop_val is stored x100); additive, the bag gives nothing. */
export function talentBonuses(state: PetTalentData, lookup: TalentLookup): Bonuses {
  const out = emptyBonuses();
  const { sums, power } = talentSums(state, lookup);
  const r = powerRate(power);
  for (const [prop, sum] of sums) addProp(out, TALENT_PROPS, prop, Math.floor((sum * (100 + r)) / 100 + 1e-9) / 100, false);
  return out;
}

export const pageOf = (sid: number): number => Math.floor(sid / 10000);
export const slotIndexOf = (sid: number): number => sid % 10000;
export const isSocketSid = (sid: number): boolean => validTalentSid(sid) && slotIndexOf(sid) >= 10;
/** Page 1..4, slot 1..11. */
export function validTalentSid(sid: number): boolean {
  return Number.isInteger(sid) && pageOf(sid) >= 1 && pageOf(sid) <= 4 && slotIndexOf(sid) >= 1 && slotIndexOf(sid) <= 11;
}

export const levelOfTid = (tid: number | undefined, lookup: TalentLookup): number => (tid && tid > 0 ? lookup(tid)?.lv ?? 0 : 0);

/** Socket 10 needs slots 1..4 of its page to sum >= 20, socket 11 slots 1..9 >= 35 (Flash checkSpecSlotUp). Null when open to upgrade. */
export function socketGate(state: PetTalentData, sid: number, lookup: TalentLookup): string | null {
  const page = pageOf(sid) * 10000;
  const eleven = slotIndexOf(sid) === 11;
  const last = eleven ? 9 : 4;
  let total = 0;
  for (let i = 1; i <= last; i++) total += levelOfTid(state.tal?.[String(page + i)], lookup);
  return total >= (eleven ? 35 : 20) ? null : eleven ? TALENT_TEXT.GATE_11 : TALENT_TEXT.GATE_10;
}

/** Next record of a slot (exp 0 row with the same sid at level + 1), or undefined at the cap. Stones share sid x11 with exp > 0. */
export function nextSlotRow(sid: number, level: number, rows: readonly PetTalentRow[]): PetTalentRow | undefined {
  if (level >= TALENT_MAX_SLOT_LEVEL) return undefined;
  return rows.find((r) => r.sid === sid && r.lv === level + 1 && r.exp === 0);
}

/** Gold price of an upgrade paid in gold: the Flash display ceil(up_exp x _goldPoint). */
export const goldCostOf = (upExp: number, goldRate: number): number => Math.ceil(upExp * goldRate);

/** Flash dragDropHandler + Go FillTalentStone refusals, in the client order: occupied, not opened, stone level, stone quality. */
export function fillRefusal(state: PetTalentData, socketSid: number, stone: PetTalentRow, lookup: TalentLookup): string | null {
  if (!isSocketSid(socketSid)) return TALENT_TEXT.NOT_SOCKET;
  if (state.inTal?.[String(socketSid)]) return TALENT_TEXT.OCCUPIED;
  const socket = lookup(state.tal?.[String(socketSid)] ?? 0);
  if (!socket) return TALENT_TEXT.NOT_OPEN;
  if (socket.lv < stone.lv) return TALENT_TEXT.STONE_LV;
  if (socket.sid + 10 < stone.sid) return TALENT_TEXT.STONE_QUALITY;
  return null;
}

/** A stone record: socket-11 sid, level >= 1, no upgrade cost, positive exp (the dissolve value). */
export const isStoneRow = (r: PetTalentRow | undefined): r is PetTalentRow => !!r && r.sid % 10000 === 11 && r.lv >= 1 && r.upExp === 0 && r.exp > 0;

/** Colour grade of a stone family: the exp of its level-1 record (basic_tid), else its own exp. */
export function familyGrade(row: PetTalentRow, lookup: TalentLookup): number {
  const anchor = lookup(row.basicTid);
  return anchor && anchor.exp > 0 ? anchor.exp : row.exp;
}

/** Flash checkSameTypeAndLvTalentStone: same colour page and same level. */
export const sameKindAndLevel = (a: PetTalentRow, b: PetTalentRow): boolean => pageOf(a.sid) === pageOf(b.sid) && a.lv === b.lv;

/** Candidate result lines of a level and grade: one record (lowest id) per prop_type (Go levelMatchedPool). */
export function levelMatchedPool(rows: readonly PetTalentRow[], lookup: TalentLookup, lv: number, grade: number): PetTalentRow[] {
  const byProp = new Map<number, PetTalentRow>();
  for (const r of rows) {
    if (!isStoneRow(r) || r.lv !== lv || familyGrade(r, lookup) !== grade) continue;
    const cur = byProp.get(r.propType);
    if (!cur || r.id < cur.id) byProp.set(r.propType, r);
  }
  return [...byProp.values()].sort((a, b) => a.id - b.id);
}

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.min(list.length - 1, Math.floor(rng() * list.length))]!;

/** resetTalentSlot result: a same-level stone of a uniformly drawn line (the source line may repeat). Null without data. */
export function pickReroll(src: PetTalentRow, rows: readonly PetTalentRow[], lookup: TalentLookup, rng: () => number): PetTalentRow | null {
  const pool = levelMatchedPool(rows, lookup, src.lv, familyGrade(src, lookup));
  return pool.length === 0 ? null : pick(pool, rng);
}

/** The level + 1 record of the same line (id + 1 inside a family chain). */
export function sameLineNext(src: PetTalentRow, lookup: TalentLookup): PetTalentRow | null {
  const next = lookup(src.id + 1);
  return next && next.basicTid === src.basicTid && next.lv === src.lv + 1 ? next : null;
}

/**
 * upTalentStone result. With the direction talisman the fused stone keeps the main (first) stone's line (TALENT_PANEL_FUNC_U[24]);
 * otherwise a uniform line of the same colour at level + 1 (Go falls back to the same line when there is no pool).
 */
export function pickFuse(
  main: PetTalentRow, direction: boolean, rows: readonly PetTalentRow[], lookup: TalentLookup, rng: () => number,
): PetTalentRow | null {
  if (!direction) {
    const pool = levelMatchedPool(rows, lookup, main.lv + 1, familyGrade(main, lookup));
    if (pool.length > 0) return pick(pool, rng);
  }
  return sameLineNext(main, lookup);
}
