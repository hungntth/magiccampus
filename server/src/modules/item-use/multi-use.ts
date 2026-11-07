// Pure part of useMultiItem (Go use_multi.go): run the single use n times, stop at the first refusal, and fold the per-unit pushes so the
// client gets one slot update of the stack instead of one per unit.

import type { Push } from '../inventory/pushes';

export interface UnitOutcome {
  /** The unit was consumed (the stack shrank). */
  used: boolean;
  pushes: Push[];
}

export interface BatchResult {
  consumed: number;
  pushes: Push[];
}

/** Runs `step` up to `count` times; the first unit that is not consumed ends the loop (its pushes, e.g. the refusal note, are kept). */
export async function runBatch(count: number, step: (index: number) => Promise<UnitOutcome>): Promise<BatchResult> {
  const pushes: Push[] = [];
  let consumed = 0;
  for (let i = 0; i < count; i++) {
    const unit = await step(i);
    pushes.push(...unit.pushes);
    if (!unit.used) break;
    consumed++;
  }
  return { consumed, pushes };
}

const slotItemId = (p: Push): number | null => {
  if (p.m === 'onDelCharactorSlot') return Number(p.a[0]);
  if (p.m === 'onAddCharactorSlot') return Number((p.a[0] as { id?: unknown } | undefined)?.id);
  return null;
};

/** Keeps only the last slot push of `itemId` (the stack row after the whole batch); every other push stays in order. */
export function foldSlotPushes(pushes: readonly Push[], itemId: number): Push[] {
  let last = -1;
  pushes.forEach((p, i) => {
    if (slotItemId(p) === itemId) last = i;
  });
  return pushes.filter((p, i) => slotItemId(p) !== itemId || i === last);
}
