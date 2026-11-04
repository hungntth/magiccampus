// Conditional single-row location writes shared by the bag / page operations. A row is addressed by
// (characterId, slotType, slotIndex); a miss or a unique-index collision (E11000) means the world changed under us.
// Swaps go through a temporary negative slotIndex so the unique (character, slotType, slotIndex) index never collides.

import type { Model } from 'mongoose';
import type { SlotRef } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
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
