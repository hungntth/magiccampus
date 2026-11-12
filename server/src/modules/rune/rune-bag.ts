// Pure rune bag operations (Go application/rune/rune_bag.go, rune_upgrade.go): tolerant parsers of the `rune` / `rune_chip` feature documents,
// stacking, runeMove, arrangeRuneBag, resolve and chip exchange plans. Bag keys are 0-based strings, chip keys start at "1".

import {
  RUNE_BAG, RUNE_BAG_SLOTS, RUNE_CHIP_BAG_SLOTS, RUNE_CHIP_MAX, RUNE_UP_HOLE, emptyRuneBag, isRareRuneType, runeBagOfKind, type RuneBag, type RuneBagType, type RuneChipBag,
  type RuneChipSlot, type RuneSlot,
} from '@mc/shared';
import type { DecoRuneDef, RuneChipDef } from '../gamedata/deco-data';

export const RUNE_FEATURE_KEY = 'rune';
export const RUNE_CHIP_FEATURE_KEY = 'rune_chip';

const int = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function parseSlots(raw: unknown): Record<string, RuneSlot> {
  const out: Record<string, RuneSlot> = {};
  for (const [k, v] of Object.entries(obj(raw))) {
    const pos = Number(k);
    const s = obj(v);
    if (!Number.isInteger(pos) || pos < 0 || pos >= RUNE_BAG_SLOTS || int(s.r) <= 0 || int(s.n) <= 0) continue;
    out[String(pos)] = { n: int(s.n), r: int(s.r) };
  }
  return out;
}

export function parseRuneBag(raw: unknown): RuneBag {
  const s = obj(raw);
  return { chaBag: parseSlots(s.chaBag), petBag: parseSlots(s.petBag), upLvlHole: Math.max(0, int(s.upLvlHole)) };
}

export function parseChipBag(raw: unknown): RuneChipBag {
  const out: RuneChipBag = {};
  for (const [k, v] of Object.entries(obj(obj(raw).bag))) {
    const pos = Number(k);
    const s = obj(v);
    const chipId = String(int(s.chipId));
    if (!Number.isInteger(pos) || pos < 1 || pos > RUNE_CHIP_BAG_SLOTS || chipId === '0' || int(s.num) <= 0) continue;
    out[String(pos)] = { chipId, num: Math.min(int(s.num), RUNE_CHIP_MAX) };
  }
  return out;
}

export const bagKey = (type: RuneBagType): 'chaBag' | 'petBag' => (type === RUNE_BAG.PET ? 'petBag' : 'chaBag');
export const validBagType = (t: number): t is RuneBagType => t === RUNE_BAG.CHA || t === RUNE_BAG.PET;

const withBag = (bag: RuneBag, type: RuneBagType, slots: Record<string, RuneSlot>): RuneBag => ({ ...bag, [bagKey(type)]: slots });

/** First free 0-based key of a bag, -1 when full. */
export function firstFree(slots: Record<string, RuneSlot>): number {
  for (let i = 0; i < RUNE_BAG_SLOTS; i++) if (!slots[String(i)]) return i;
  return -1;
}

/** True when one more rune `runeId` fits (stack on the same id, or a free slot). */
export function canAdd(bag: RuneBag, type: RuneBagType, runeId: number): boolean {
  const slots = bag[bagKey(type)];
  return Object.values(slots).some((s) => s.r === runeId) || firstFree(slots) >= 0;
}

/** Adds `n` runes: onto `preferred` when it holds the same id (or is empty), else onto any stack of the id, else the first free slot. Null when full. */
export function addRune(bag: RuneBag, type: RuneBagType, runeId: number, n: number, preferred = -1): RuneBag | null {
  const slots = { ...bag[bagKey(type)] };
  const pref = slots[String(preferred)];
  if (preferred >= 0 && preferred < RUNE_BAG_SLOTS && (!pref || pref.r === runeId)) {
    slots[String(preferred)] = { r: runeId, n: (pref?.n ?? 0) + n };
    return withBag(bag, type, slots);
  }
  const same = Object.entries(slots).find(([, s]) => s.r === runeId);
  if (same) {
    slots[same[0]] = { r: runeId, n: same[1].n + n };
    return withBag(bag, type, slots);
  }
  const free = firstFree(slots);
  if (free < 0) return null;
  slots[String(free)] = { r: runeId, n };
  return withBag(bag, type, slots);
}

/** Takes one rune out of slot `pos`; null when the slot is empty (or holds another id than `runeId` > 0). */
export function takeOne(bag: RuneBag, type: RuneBagType, pos: number, runeId = 0): { bag: RuneBag; runeId: number } | null {
  const slots = { ...bag[bagKey(type)] };
  const s = slots[String(pos)];
  if (!s || (runeId > 0 && s.r !== runeId)) return null;
  if (s.n > 1) slots[String(pos)] = { ...s, n: s.n - 1 };
  else delete slots[String(pos)];
  return { bag: withBag(bag, type, slots), runeId: s.r };
}

/** runeMove: -1 is the up-level hole (hole -> bag[to] stacks on the same id or needs an empty slot; bag[from] -> hole needs it empty); two slots swap / move. */
export function moveRune(bag: RuneBag, type: RuneBagType, from: number, to: number, runeOf: (id: number) => DecoRuneDef | undefined): RuneBag | null {
  const slots = { ...bag[bagKey(type)] };
  const inRange = (p: number): boolean => Number.isInteger(p) && p >= 0 && p < RUNE_BAG_SLOTS;
  if (from === RUNE_UP_HOLE && to === RUNE_UP_HOLE) return null;
  if (from === RUNE_UP_HOLE) {
    const id = bag.upLvlHole;
    if (id <= 0 || !inRange(to) || runeBagOfKind(runeOf(id)?.kind ?? 0) !== type) return null;
    const dst = slots[String(to)];
    if (dst && dst.r !== id) return null;
    slots[String(to)] = { r: id, n: (dst?.n ?? 0) + 1 };
    return { ...withBag(bag, type, slots), upLvlHole: 0 };
  }
  if (!inRange(from)) return null;
  const src = slots[String(from)];
  if (!src) return null;
  if (to === RUNE_UP_HOLE) {
    if (bag.upLvlHole > 0) return null;
    const taken = takeOne(bag, type, from);
    return taken ? { ...taken.bag, upLvlHole: taken.runeId } : null;
  }
  if (!inRange(to) || from === to) return null;
  const dst = slots[String(to)];
  if (dst) slots[String(from)] = dst;
  else delete slots[String(from)];
  slots[String(to)] = src;
  return withBag(bag, type, slots);
}

/** arrangeRuneBag: dense-pack into keys 0..n-1 in key order. */
export function arrange(bag: RuneBag, type: RuneBagType): RuneBag {
  const slots = bag[bagKey(type)];
  const packed: Record<string, RuneSlot> = {};
  Object.keys(slots).map(Number).sort((a, b) => a - b).forEach((k, i) => {
    packed[String(i)] = slots[String(k)];
  });
  return withBag(bag, type, packed);
}

export interface ResolvePlan {
  bag: RuneBag;
  gained: number;
}

/** runeResolve: every named slot whose id matches dissolves into `exp x stack` rune exp. */
export function planResolve(bag: RuneBag, type: RuneBagType, picked: Record<string, number>, runeOf: (id: number) => DecoRuneDef | undefined): ResolvePlan {
  const slots = { ...bag[bagKey(type)] };
  let gained = 0;
  for (const key of Object.keys(picked).sort()) {
    const s = slots[key];
    const def = s ? runeOf(s.r) : undefined;
    if (!s || !def || (picked[key] > 0 && s.r !== picked[key])) continue;
    gained += def.exp * s.n;
    delete slots[key];
  }
  return { bag: withBag(bag, type, slots), gained };
}

export interface ExchangePlan {
  chips: RuneChipBag;
  /** Runes made, by rune id. */
  made: Map<number, number>;
  converted: number;
  refusedRare: number;
}

/** exchangeRune: per chip `floor(stack / num)` runes of `rid`, the remainder stays; rare families never convert (their chips stay). */
export function planExchange(
  chips: RuneChipBag, chipOf: (id: number) => RuneChipDef | undefined, runeOf: (id: number) => DecoRuneDef | undefined,
): ExchangePlan {
  const next: RuneChipBag = { ...chips };
  const made = new Map<number, number>();
  let converted = 0;
  let refusedRare = 0;
  for (const key of Object.keys(chips).sort((a, b) => Number(a) - Number(b))) {
    const slot = chips[key];
    const chip = chipOf(Number(slot.chipId));
    if (!chip || chip.rid <= 0 || chip.num <= 0) continue;
    const count = Math.floor(slot.num / chip.num);
    if (count <= 0) continue;
    const rune = runeOf(chip.rid);
    if (!rune) continue;
    if (isRareRuneType(rune.type)) {
      refusedRare += count;
      continue;
    }
    const left = slot.num - count * chip.num;
    if (left > 0) next[key] = { ...slot, num: left };
    else delete next[key];
    made.set(chip.rid, (made.get(chip.rid) ?? 0) + count);
    converted += count;
  }
  return { chips: next, made, converted, refusedRare };
}

/** Adds chips to the chip bag (stack on the same id, else the first free key from "1"); capped at RUNE_CHIP_MAX. Null when full. */
export function addChips(chips: RuneChipBag, chipId: number, n: number): RuneChipBag | null {
  const next: RuneChipBag = { ...chips };
  const same = Object.entries(next).find(([, s]) => s.chipId === String(chipId));
  if (same) {
    next[same[0]] = { chipId: same[1].chipId, num: Math.min(same[1].num + n, RUNE_CHIP_MAX) } satisfies RuneChipSlot;
    return next;
  }
  for (let pos = 1; pos <= RUNE_CHIP_BAG_SLOTS; pos++) {
    if (!next[String(pos)]) {
      next[String(pos)] = { chipId: String(chipId), num: Math.min(n, RUNE_CHIP_MAX) };
      return next;
    }
  }
  return null;
}

export const encodeChipBag = (chips: RuneChipBag): { bag: RuneChipBag } => ({ bag: chips });
export { emptyRuneBag };
