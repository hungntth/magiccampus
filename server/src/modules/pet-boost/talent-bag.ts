// Pure operations on the Thien Phu stone bag (`b`: slot -> {t, n}, 320 slots, one growing stack per stone id) that also record the
// Flash delta (`a[slot] = {tid, ln}`, `d[slot] = {ln}`) the client merges (PetTalentFuncPanel._updateTalentData). Go pettalent/delta.go.

import { TALENT_BAG_SLOTS, type TalentBagDelta, type TalentBagEntry } from '@mc/shared';

export type TalentBag = Record<string, TalentBagEntry>;

export class BagDelta {
  readonly a: TalentBagDelta['a'] = {};
  readonly d: TalentBagDelta['d'] = {};

  wire(): TalentBagDelta {
    return { a: { ...this.a }, d: { ...this.d } };
  }

  /** Slot now holds `entry`. */
  put(slot: number, entry: TalentBagEntry): void {
    delete this.d[String(slot)];
    this.a[String(slot)] = { tid: entry.t, ln: entry.n };
  }

  /** Slot now holds `left` (0 = gone). */
  drop(slot: number, left: number): void {
    delete this.a[String(slot)];
    this.d[String(slot)] = { ln: left };
  }
}

export const validBagSlot = (slot: number): boolean => Number.isInteger(slot) && slot >= 1 && slot <= TALENT_BAG_SLOTS;

/** Takes `count` from a stack (the caller checked it); an emptied slot is removed. */
export function reduceStack(bag: TalentBag, delta: BagDelta, slot: number, count: number): void {
  const entry = bag[String(slot)];
  if (!entry) return;
  entry.n -= count;
  if (entry.n <= 0) {
    delete bag[String(slot)];
    delta.drop(slot, 0);
  } else delta.drop(slot, entry.n);
}

/** First slot 1..320 that is empty and was not emptied by this operation. */
export function freeSlot(bag: TalentBag, delta: BagDelta): number {
  for (let slot = 1; slot <= TALENT_BAG_SLOTS; slot++) if (!bag[String(slot)] && !delta.d[String(slot)]) return slot;
  return 0;
}

/** Adds stones: into the existing stack of the same id (lowest slot), else the first free slot. False when the bag is full. */
export function addStone(bag: TalentBag, delta: BagDelta, tid: number, count: number): boolean {
  const slots = Object.keys(bag).map(Number).sort((a, b) => a - b);
  for (const slot of slots) {
    const entry = bag[String(slot)]!;
    if (entry.t === tid) {
      entry.n += count;
      delta.put(slot, entry);
      return true;
    }
  }
  const slot = freeSlot(bag, delta);
  if (slot === 0) return false;
  bag[String(slot)] = { t: tid, n: count };
  delta.put(slot, bag[String(slot)]!);
  return true;
}

/** takeOffTalentStone target: the asked slot when empty or the same stone, else anywhere (Go addStoneAtSlot). */
export function addStoneAt(bag: TalentBag, delta: BagDelta, slot: number, tid: number, count: number): boolean {
  const there = validBagSlot(slot) ? bag[String(slot)] : undefined;
  if (validBagSlot(slot) && !there) {
    bag[String(slot)] = { t: tid, n: count };
    delta.put(slot, bag[String(slot)]!);
    return true;
  }
  if (there && there.t === tid) {
    there.n += count;
    delta.put(slot, there);
    return true;
  }
  return addStone(bag, delta, tid, count);
}

/** moveStoneBagToBag: move into an empty slot, merge the same stone, else swap. */
export function moveStone(bag: TalentBag, delta: BagDelta, from: number, to: number): void {
  const src = bag[String(from)];
  if (!src) return;
  const dst = bag[String(to)];
  if (!dst) {
    delete bag[String(from)];
    bag[String(to)] = src;
    delta.drop(from, 0);
    delta.put(to, src);
  } else if (dst.t === src.t) {
    dst.n += src.n;
    delete bag[String(from)];
    delta.drop(from, 0);
    delta.put(to, dst);
  } else {
    bag[String(from)] = dst;
    bag[String(to)] = src;
    delta.put(from, dst);
    delta.put(to, src);
  }
}

/** arrangeTalentBag: stacks of the same stone merge into the first one met, then every stack is packed to slots 1..N in that order. */
export function arrangeBag(bag: TalentBag): TalentBag {
  const out: TalentBag = {};
  const slotOf = new Map<number, string>();
  for (const slot of Object.keys(bag).map(Number).sort((a, b) => a - b)) {
    const entry = bag[String(slot)]!;
    const dense = slotOf.get(entry.t);
    if (dense) out[dense]!.n += entry.n;
    else {
      const next = String(Object.keys(out).length + 1);
      out[next] = { t: entry.t, n: entry.n };
      slotOf.set(entry.t, next);
    }
  }
  return out;
}

/** Units each slot must hold for a list of picked slots (a slot picked twice needs two). */
export function slotNeeds(slots: readonly number[]): Map<number, number> {
  const need = new Map<number, number>();
  for (const s of slots) need.set(s, (need.get(s) ?? 0) + 1);
  return need;
}
