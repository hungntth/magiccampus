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
