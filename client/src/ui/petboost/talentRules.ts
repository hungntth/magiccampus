// Pure rules of the Thiên Phú window: merging the server bag / socket deltas into the local state (Flash _updateTalentData /
// _updateTalentDataInTal), slot levels and socket gates, stone power, bag paging and the fuse / reset tray checks.

import {
  isTalentStone, petTalentDef, petTalentSlotRow, talentPageOf, talentPowerRate, TALENT_BAG_SLOTS, TALENT_GOLD_RATE, TALENT_MAX_SLOT_LEVEL,
  type PetTalentData, type PetTalentDef, type TalentBagDelta, type TalentBagEntry, type TalentStonePush,
} from '@mc/shared';
import { TALENT_TEXT_UI } from './boostText';

export const BAG_PAGE_CELLS = 40;
export const BAG_PAGES = TALENT_BAG_SLOTS / BAG_PAGE_CELLS;
export const FUSE_COUNT = 5;
export const RESET_COUNT = 2;

export type TalentBag = Record<string, TalentBagEntry>;

/** Merges a bag delta: `a[slot]` adds / updates a stack, `d[slot].ln` is what is left of a stack (0 = gone). */
export function applyBagDelta(bag: Readonly<TalentBag>, delta: TalentBagDelta): TalentBag {
  const out: TalentBag = { ...bag };
  for (const [slot, d] of Object.entries(delta.d ?? {})) {
    const cur = out[slot];
    if (d.ln > 0 && cur) out[slot] = { t: cur.t, n: d.ln };
    else delete out[slot];
  }
  for (const [slot, a] of Object.entries(delta.a ?? {})) out[slot] = { t: a.tid, n: a.ln };
  return out;
}

/** Merges the socket part of onFillOrTakeOffTalentStone (`pan.a[sid] = {tid}`, `pan.d[sid] = 1`) and its bag delta. */
export function applyStonePush(data: PetTalentData, push: TalentStonePush): PetTalentData {
  const inTal = { ...data.inTal };
  for (const [sid, v] of Object.entries(push.pan?.a ?? {})) inTal[sid] = v.tid;
  for (const sid of Object.keys(push.pan?.d ?? {})) delete inTal[sid];
  return { ...data, inTal, b: applyBagDelta(data.b, push.bag) };
}

export const slotKey = (page: number, slot: number): number => page * 10000 + slot;
export const isSocket = (sid: number): boolean => sid % 10000 >= 10;

export function slotLevel(data: PetTalentData, sid: number): number {
  const id = data.tal[String(sid)];
  return id ? petTalentDef(id)?.lv ?? 0 : 0;
}

/** A socket (slot 10 / 11) is open once it has a record in `tal`. */
export const socketOpen = (data: PetTalentData, sid: number): boolean => (data.tal[String(sid)] ?? 0) > 0;

/** Gate of a socket upgrade: slots 1..4 of the page must sum to 20 (slot 10), slots 1..9 to 35 (slot 11). */
export function socketGate(data: PetTalentData, sid: number): { have: number; need: number } {
  const page = talentPageOf(sid);
  const eleven = sid % 10000 === 11;
  let have = 0;
  for (let i = 1; i <= (eleven ? 9 : 4); i++) have += slotLevel(data, slotKey(page, i));
  return { have, need: eleven ? 35 : 20 };
}

/** Next record of a slot (the cost row), undefined at the cap. */
export const nextSlotDef = (sid: number, level: number): PetTalentDef | undefined => (level >= TALENT_MAX_SLOT_LEVEL ? undefined : petTalentSlotRow(sid, level + 1));
export const goldCostOf = (upExp: number): number => Math.ceil(upExp * TALENT_GOLD_RATE);

/** Total energy of every inlaid stone (all pages) and the % it adds to every stat. */
export function stonePower(data: PetTalentData): { power: number; rate: number } {
  let power = 0;
  for (const id of Object.values(data.inTal)) power += petTalentDef(id)?.p ?? 0;
  return { power, rate: talentPowerRate(power) };
}

/** The 40 cells of a bag page (slots 1-based); `entry` null = empty. */
export function bagCells(bag: Readonly<TalentBag>, page: number): { slot: number; entry: TalentBagEntry | null }[] {
  const start = page * BAG_PAGE_CELLS + 1;
  return Array.from({ length: BAG_PAGE_CELLS }, (_, i) => ({ slot: start + i, entry: bag[String(start + i)] ?? null }));
}

export interface TrayStone {
  slot: number;
  tid: number;
}

/** Same colour page and level (Flash checkSameTypeAndLvTalentStone). */
export function sameKind(a: number, b: number): boolean {
  const x = petTalentDef(a);
  const y = petTalentDef(b);
  return !!x && !!y && talentPageOf(x.sid) === talentPageOf(y.sid) && x.lv === y.lv;
}

/** Adds one stone of `slot` to the tray; the error text when it does not fit (not a stone, full, stack used up, other kind). */
export function trayAdd(bag: Readonly<TalentBag>, tray: readonly TrayStone[], slot: number, max: number): { tray: TrayStone[] } | { error: string } {
  const entry = bag[String(slot)];
  if (!entry || !isTalentStone(petTalentDef(entry.t))) return { error: TALENT_TEXT_UI.empty };
  if (tray.length >= max) return { error: '' };
  if (tray.filter((s) => s.slot === slot).length >= entry.n) return { error: TALENT_TEXT_UI.stackLeft };
  if (tray.length > 0 && !sameKind(tray[0]!.tid, entry.t)) return { error: TALENT_TEXT_UI.sameKind };
  return { tray: [...tray, { slot, tid: entry.t }] };
}

/** Drops tray stones whose bag stack changed under them (a push merged a delta). */
export function trayPrune(bag: Readonly<TalentBag>, tray: readonly TrayStone[]): TrayStone[] {
  const used = new Map<number, number>();
  return tray.filter((s) => {
    const e = bag[String(s.slot)];
    const n = (used.get(s.slot) ?? 0) + 1;
    used.set(s.slot, n);
    return !!e && e.t === s.tid && e.n >= n;
  });
}

/** Display name of a stone record. */
export function stoneFamilyName(tid: number): string {
  const d = petTalentDef(tid);
  return d ? d.name : `#${tid}`;
}
