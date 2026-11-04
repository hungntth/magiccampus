// Pure bag rules: stack size, where an added amount goes (top-ups + new slots), sid and sell price.
// Legacy: application/item/service.go:1664-1820 (stacking), domain/item/item.go (sid), shop/sell.go (price / 4).

import { BAG_PAGE_SLOTS, BAG_SID_BASE } from '@mc/shared';

export interface BagStack {
  id: number;
  slotIndex: number;
  templateId: number;
  itemType: number;
  isBound: boolean;
  colorCode: number;
  stackCount: number;
}

export interface AddSpec {
  templateId: number;
  itemType: number;
  bound: boolean;
  color: number;
  amount: number;
  maxStack: number;
}

export interface AddPlan {
  topUps: { id: number; add: number }[];
  newStacks: { slotIndex: number; count: number }[];
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Stack limit of a template: 1 when single_flag > 0 or stack_max <= 0. */
export function maxStack(tpl: { stack_max?: unknown; single_flag?: unknown } | undefined): number {
  if (!tpl || num(tpl.single_flag) > 0 || num(tpl.stack_max) <= 0) return 1;
  return Math.floor(num(tpl.stack_max));
}

export function sidOf(slotIndex: number): number {
  return BAG_SID_BASE + slotIndex;
}

/** Per-unit sale price: floor(template.price / 4); 0 = cannot be sold. */
export function sellUnit(tpl: { price?: unknown } | undefined): number {
  return Math.max(0, Math.floor(num(tpl?.price) / 4));
}

/** Plans adding `spec.amount`: fill matching stacks in slot order, then open new slots at the lowest free index. */
export function planAdd(bag: readonly BagStack[], spec: AddSpec, capacity = BAG_PAGE_SLOTS): AddPlan | null {
  if (!Number.isInteger(spec.amount) || spec.amount <= 0 || spec.maxStack < 1) return null;
  const ordered = [...bag].sort((a, b) => a.slotIndex - b.slotIndex);
  const topUps: AddPlan['topUps'] = [];
  let rest = spec.amount;
  for (const s of ordered) {
    if (rest <= 0) break;
    const same = s.templateId === spec.templateId && s.itemType === spec.itemType && s.isBound === spec.bound
      && s.colorCode === spec.color;
    if (!same || s.stackCount >= spec.maxStack) continue;
    const add = Math.min(rest, spec.maxStack - s.stackCount);
    topUps.push({ id: s.id, add });
    rest -= add;
  }
  const newStacks: AddPlan['newStacks'] = [];
  if (rest > 0) {
    const used = new Set(ordered.map((s) => s.slotIndex));
    for (let i = 0; i < capacity && rest > 0; i++) {
      if (used.has(i)) continue;
      const count = Math.min(rest, spec.maxStack);
      newStacks.push({ slotIndex: i, count });
      rest -= count;
    }
  }
  return rest > 0 ? null : { topUps, newStacks };
}

// --- Moves, splits and sorting (legacy MoveItem / MoveItemPartial / SortBag), pure over plain slot rows ---

export interface BagSlotRow extends BagStack {
  maxStack: number; // stack limit of the template (maxStack())
}

const sameStackKey = (a: BagSlotRow, b: BagSlotRow): boolean =>
  a.itemType === 1 && b.itemType === 1 && a.templateId === b.templateId && a.isBound === b.isBound
  && a.colorCode === b.colorCode && a.maxStack > 1;

export type MovePlan =
  | { kind: 'move'; id: number; from: number; to: number }
  | { kind: 'merge'; srcId: number; destId: number; from: number; to: number; merged: number }
  | { kind: 'swap'; aId: number; bId: number; from: number; to: number }
  | { kind: 'error'; reason: string };

/**
 * moveItem between two bag slot indexes: empty target -> move; same stackable (template, bound, colour) -> merge when
 * the total fits the stack limit (else error, no partial merge); anything else -> swap.
 */
export function planMove(bag: readonly BagSlotRow[], from: number, to: number): MovePlan {
  if (from === to) return { kind: 'error', reason: 'same slot' };
  const src = bag.find((s) => s.slotIndex === from);
  if (!src) return { kind: 'error', reason: 'empty source' };
  const dest = bag.find((s) => s.slotIndex === to);
  if (!dest) return { kind: 'move', id: src.id, from, to };
  if (sameStackKey(src, dest)) {
    const merged = src.stackCount + dest.stackCount;
    if (merged > dest.maxStack) return { kind: 'error', reason: 'stack limit' };
    return { kind: 'merge', srcId: src.id, destId: dest.id, from, to, merged };
  }
  return { kind: 'swap', aId: src.id, bId: dest.id, from, to };
}

export type SplitPlan =
  | { kind: 'new'; srcId: number; from: number; to: number; count: number; remaining: number }
  | { kind: 'merge'; srcId: number; destId: number; from: number; to: number; count: number; remaining: number; merged: number }
  | { kind: 'error'; reason: string };

/** moveItemNum: takes `n` (1 <= n < stack) from a stackable row into an empty slot or a matching stack. */
export function planSplit(bag: readonly BagSlotRow[], from: number, to: number, n: number): SplitPlan {
  if (from === to) return { kind: 'error', reason: 'same slot' };
  const src = bag.find((s) => s.slotIndex === from);
  if (!src) return { kind: 'error', reason: 'empty source' };
  if (src.itemType !== 1 || src.maxStack <= 1) return { kind: 'error', reason: 'not stackable' };
  if (!Number.isInteger(n) || n < 1 || n >= src.stackCount) return { kind: 'error', reason: 'bad amount' };
  const remaining = src.stackCount - n;
  const dest = bag.find((s) => s.slotIndex === to);
  if (!dest) return { kind: 'new', srcId: src.id, from, to, count: n, remaining };
  if (!sameStackKey(src, dest)) return { kind: 'error', reason: 'slot occupied' };
  const merged = dest.stackCount + n;
  if (merged > dest.maxStack) return { kind: 'error', reason: 'stack limit' };
  return { kind: 'merge', srcId: src.id, destId: dest.id, from, to, count: n, remaining, merged };
}

export interface SortPlan {
  removed: { id: number; slotIndex: number }[]; // rows merged away
  kept: { id: number; from: number; to: number; stackCount: number; countChanged: boolean }[]; // survivors in new order
}

/** bagSort: stable sort by (tid, itemType, unbound first, colour, slot, id), merge up to the stack limit, repack from 0. */
export function planSort(bag: readonly BagSlotRow[]): SortPlan {
  const sorted = [...bag].sort(
    (a, b) =>
      a.templateId - b.templateId || a.itemType - b.itemType || Number(a.isBound) - Number(b.isBound)
      || a.colorCode - b.colorCode || a.slotIndex - b.slotIndex || a.id - b.id,
  );
  const removed: SortPlan['removed'] = [];
  const survivors: { row: BagSlotRow; count: number }[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sameStackKey(sorted[i], sorted[j])) j++;
    if (j - i === 1) {
      survivors.push({ row: sorted[i], count: sorted[i].stackCount });
    } else {
      let total = 0;
      for (let k = i; k < j; k++) total += sorted[k].stackCount;
      for (let k = i; k < j; k++) {
        const take = Math.min(total, sorted[k].maxStack);
        if (take > 0) survivors.push({ row: sorted[k], count: take });
        else removed.push({ id: sorted[k].id, slotIndex: sorted[k].slotIndex });
        total -= take;
      }
    }
    i = j;
  }
  const kept = survivors.map((s, to) => ({
    id: s.row.id, from: s.row.slotIndex, to, stackCount: s.count, countChanged: s.count !== s.row.stackCount,
  }));
  return { removed, kept };
}

/** First bag slot index in 0..capacity-1 that no row occupies, or -1 when the bag is full. */
export function firstFreeSlot(used: Iterable<number>, capacity = BAG_PAGE_SLOTS): number {
  const set = new Set(used);
  for (let i = 0; i < capacity; i++) if (!set.has(i)) return i;
  return -1;
}

export interface RemovePlan {
  takes: { id: number; slotIndex: number; take: number; left: number }[];
}

/** Takes `count` units of a template from its stacks, lowest slot first (unbound before bound); null when the bag holds fewer. */
export function planRemove(bag: readonly BagStack[], templateId: number, itemType: number, count: number): RemovePlan | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  const stacks = bag
    .filter((s) => s.templateId === templateId && s.itemType === itemType && s.stackCount > 0)
    .sort((a, b) => Number(a.isBound) - Number(b.isBound) || a.slotIndex - b.slotIndex);
  const takes: RemovePlan['takes'] = [];
  let rest = count;
  for (const s of stacks) {
    if (rest <= 0) break;
    const take = Math.min(rest, s.stackCount);
    takes.push({ id: s.id, slotIndex: s.slotIndex, take, left: s.stackCount - take });
    rest -= take;
  }
  return rest > 0 ? null : { takes };
}
