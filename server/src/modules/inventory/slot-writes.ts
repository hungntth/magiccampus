// Conditional single-row location writes shared by the bag / page operations. A row is addressed by
// (characterId, slotType, slotIndex); a miss or a unique-index collision (E11000) means the world changed under us.
// Swaps go through a temporary negative slotIndex so the unique (character, slotType, slotIndex) index never collides.

import type { Model } from 'mongoose';
import type { SlotRef } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { SortPlan } from './bag-rules';
import type { CharacterItem } from './character-item.schema';

export const busy = (): RpcException => RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');

/** Moves row `id` from `from` to `to` (both locations are written, so it also changes slot type). */
export async function setLocation(
  items: Model<CharacterItem>, characterId: number, id: number, from: SlotRef, to: SlotRef,
): Promise<void> {
  try {
    const r = await items.updateOne(
      { _id: id, characterId, slotType: from.slotType, slotIndex: from.slotIndex },
      { $set: { slotType: to.slotType, slotIndex: to.slotIndex } },
    );
    if (r.modifiedCount === 1) return;
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
  }
  throw busy();
}

/** a -> temp, b -> a's place, a -> b's place; restores `a` when the middle step fails. */
export async function swapLocations(
  items: Model<CharacterItem>, characterId: number, aId: number, bId: number, a: SlotRef, b: SlotRef,
): Promise<void> {
  const temp: SlotRef = { slotType: a.slotType, slotIndex: -1 };
  await setLocation(items, characterId, aId, a, temp);
  try {
    await setLocation(items, characterId, bId, b, a);
  } catch (e) {
    await setLocation(items, characterId, aId, temp, a).catch(() => undefined);
    throw e;
  }
  await setLocation(items, characterId, aId, temp, b);
}

/** Whole-stack merge: deletes the source row first, then raises the target (the source is restored when the raise misses). */
export async function mergeInto(
  items: Model<CharacterItem>, characterId: number, src: Pick<CharacterItem, '_id' | 'slotType' | 'slotIndex' | 'stackCount'>, destId: number, limit: number,
): Promise<void> {
  const gone = await items
    .findOneAndDelete({ _id: src._id, characterId, slotType: src.slotType, slotIndex: src.slotIndex, stackCount: src.stackCount })
    .lean();
  if (!gone) throw busy();
  const ok = await items.updateOne(
    { _id: destId, characterId, stackCount: { $lte: limit - gone.stackCount } },
    { $inc: { stackCount: gone.stackCount } },
  );
  if (ok.modifiedCount !== 1) {
    await items.create(gone).catch(() => undefined);
    throw busy();
  }
}

const SORT_OFFSET = 10000;

/** Applies a planSort result to one slot type: counts, deletions of merged-away rows, then the repack through a staging offset. */
export async function applySortPlan(items: Model<CharacterItem>, characterId: number, slotType: number, plan: SortPlan): Promise<void> {
  for (const k of plan.kept.filter((x) => x.countChanged)) {
    await items.updateOne({ _id: k.id, characterId, slotType }, { $set: { stackCount: k.stackCount } });
  }
  if (plan.removed.length > 0) await items.deleteMany({ characterId, slotType, _id: { $in: plan.removed.map((r) => r.id) } });
  const moved = plan.kept.filter((k) => k.from !== k.to);
  if (moved.length === 0) return;
  const bulk = (index: (k: (typeof moved)[number]) => number) =>
    moved.map((k) => ({ updateOne: { filter: { _id: k.id, characterId, slotType }, update: { $set: { slotIndex: index(k) } } } }));
  await items.bulkWrite(bulk((k) => k.from + SORT_OFFSET), { ordered: true });
  await items.bulkWrite(bulk((k) => k.to), { ordered: true });
}
