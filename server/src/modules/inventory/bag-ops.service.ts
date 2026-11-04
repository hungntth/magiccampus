// Bag operations (legacy Service.MoveItem / MoveItemPartial / DropItem / SortBag) on slotType 0 rows. The decisions
// come from the pure planners in bag-rules.ts; this file applies them with conditional single-row writes (no
// transactions): swaps and sorts go through a temporary slotIndex so the unique (character, slotType, slotIndex)
// index never collides, merges delete the source before crediting the target and restore it on failure.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BAG_PAGE_SLOTS, BAG_SID_BASE, ItemKind, SlotType, type ItemSortEntry } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Counter } from '../character/counter.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack, planMove, planSort, planSplit, sidOf, type BagSlotRow } from './bag-rules';
import { CharacterItem } from './character-item.schema';
import { withCharLock } from './char-lock';
import { InventoryService } from './inventory.service';
import { push, type Push } from './pushes';

const SORT_OFFSET = 10000;
const TEMP_INDEX = -1;
const busy = (): RpcException => RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');

@Injectable()
export class BagOpsService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
  ) {}

  /** moveItem(fromSid, toSid): both must be bag sids. */
  moveItem(characterId: number, fromSid: number, toSid: number): Promise<Push[]> {
    const from = slotOf(fromSid);
    const to = slotOf(toSid);
    return withCharLock(characterId, async () => {
      const plan = planMove(await this.rows(characterId), from, to);
      switch (plan.kind) {
        case 'error':
          throw RpcException.invalidArgs(plan.reason);
        case 'move':
          await this.setIndex(characterId, plan.id, plan.from, plan.to);
          return [push('onMoveItem', fromSid, toSid, plan.id)];
        case 'merge': {
          const src = await this.items.findOneAndDelete({ _id: plan.srcId, characterId, slotType: SlotType.BAG, slotIndex: from }).lean();
          if (!src) throw busy();
          const ok = await this.items.updateOne({ _id: plan.destId, characterId }, { $inc: { stackCount: src.stackCount } });
          if (ok.modifiedCount !== 1) {
            await this.items.create(src).catch(() => undefined);
            throw busy();
          }
          const [dest] = await this.inventory.byIds(characterId, [plan.destId]);
          return [push('onAddCharactorSlot', dest), push('onStackItemInto', fromSid, toSid, plan.srcId, plan.destId, plan.merged)];
        }
        case 'swap':
          await this.swap(characterId, plan.aId, plan.bId, from, to);
          return [push('onSwapItem', fromSid, toSid)];
      }
    });
  }

  /** moveItemNum(fromSid, toSid, n): split `n` off a stack into an empty slot or a matching stack. */
  moveItemNum(characterId: number, fromSid: number, toSid: number, n: number): Promise<Push[]> {
    const from = slotOf(fromSid);
    const to = slotOf(toSid);
    return withCharLock(characterId, async () => {
      const bag = await this.rows(characterId);
      const plan = planSplit(bag, from, to, n);
      if (plan.kind === 'error') throw RpcException.invalidArgs(plan.reason);
      const src = bag.find((r) => r.id === plan.srcId)!;
      // Spend first: take `n` from the source, then credit the destination; refund when the credit fails.
      const took = await this.items.updateOne(
        { _id: src.id, characterId, slotType: SlotType.BAG, stackCount: src.stackCount },
        { $inc: { stackCount: -plan.count } },
      );
      if (took.modifiedCount !== 1) throw busy();
      const refund = (): Promise<unknown> => this.items.updateOne({ _id: src.id, characterId }, { $inc: { stackCount: plan.count } });
      let destId: number;
      try {
        if (plan.kind === 'new') {
          destId = await this.nextId();
          await this.items.create({
            _id: destId, characterId, templateId: src.templateId, itemType: src.itemType, slotType: SlotType.BAG,
            slotIndex: to, stackCount: plan.count, isBound: src.isBound, colorCode: src.colorCode, // H5: colour is inherited
          });
        } else {
          destId = plan.destId;
          const ok = await this.items.updateOne(
            { _id: destId, characterId, stackCount: { $lte: bag.find((r) => r.id === destId)!.maxStack - plan.count } },
            { $inc: { stackCount: plan.count } },
          );
          if (ok.modifiedCount !== 1) throw busy();
        }
      } catch (e) {
        await refund();
        throw (e as { code?: number }).code === 11000 ? busy() : e;
      }
      const [dest] = await this.inventory.byIds(characterId, [destId]);
      return [push('onAddCharactorSlot', dest), push('onMoveItemNum', fromSid, plan.srcId, plan.remaining)];
    });
  }

  /** dropItem(itemId): deletes a bag item (equipped items must be unequipped first). */
  dropItem(characterId: number, itemId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const item = await this.items.findOne({ _id: itemId, characterId }).lean();
      if (!item) throw RpcException.notFound('Không tìm thấy vật phẩm');
      if (item.slotType !== SlotType.BAG) throw RpcException.forbidden('Hãy tháo trang bị trước khi vứt');
      const del = await this.items.deleteOne({ _id: itemId, characterId, slotType: SlotType.BAG });
      if (del.deletedCount !== 1) throw busy();
      return [push('onDelCharactorSlot', itemId, sidOf(item.slotIndex))];
    });
  }

  /** bagSort(): merge, order and repack the whole bag; pushes merged-away rows, then one onItemSort. */
  bagSort(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const plan = planSort(await this.rows(characterId));
      for (const k of plan.kept.filter((x) => x.countChanged)) {
        await this.items.updateOne({ _id: k.id, characterId, slotType: SlotType.BAG }, { $set: { stackCount: k.stackCount } });
      }
      if (plan.removed.length > 0) {
        await this.items.deleteMany({ characterId, slotType: SlotType.BAG, _id: { $in: plan.removed.map((r) => r.id) } });
      }
      const moved = plan.kept.filter((k) => k.from !== k.to);
      const bulk = (index: (k: (typeof moved)[number]) => number) =>
        moved.map((k) => ({
          updateOne: { filter: { _id: k.id, characterId, slotType: SlotType.BAG }, update: { $set: { slotIndex: index(k) } } },
        }));
      if (moved.length > 0) {
        await this.items.bulkWrite(bulk((k) => k.from + SORT_OFFSET), { ordered: true });
        await this.items.bulkWrite(bulk((k) => k.to), { ordered: true });
      }
      const entries: ItemSortEntry[] = plan.kept.map((k) => ({ oldId: sidOf(k.from), newId: sidOf(k.to), stackNum: k.stackCount }));
      return [...plan.removed.map((r) => push('onDelCharactorSlot', r.id, sidOf(r.slotIndex))), push('onItemSort', entries)];
    });
  }

  private async rows(characterId: number): Promise<BagSlotRow[]> {
    const docs = await this.items.find({ characterId, slotType: SlotType.BAG }).lean();
    const tpls = await this.gameData.templatesByIds(29, [...new Set(docs.filter((d) => d.itemType === ItemKind.ITEM).map((d) => d.templateId))]);
    return docs.map((d) => ({
      id: d._id, slotIndex: d.slotIndex, templateId: d.templateId, itemType: d.itemType, isBound: d.isBound,
      colorCode: d.colorCode, stackCount: d.stackCount,
      maxStack: d.itemType === ItemKind.ITEM ? maxStack(tpls.get(d.templateId)) : 1,
    }));
  }

  private async setIndex(characterId: number, id: number, from: number, to: number): Promise<void> {
    try {
      const r = await this.items.updateOne({ _id: id, characterId, slotType: SlotType.BAG, slotIndex: from }, { $set: { slotIndex: to } });
      if (r.modifiedCount === 1) return;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    throw busy();
  }

  /** a -> temp, b -> a's slot, a -> b's slot. */
  private async swap(characterId: number, aId: number, bId: number, from: number, to: number): Promise<void> {
    await this.setIndex(characterId, aId, from, TEMP_INDEX);
    try {
      await this.setIndex(characterId, bId, to, from);
    } catch (e) {
      await this.setIndex(characterId, aId, TEMP_INDEX, from).catch(() => undefined);
      throw e;
    }
    await this.setIndex(characterId, aId, TEMP_INDEX, to);
  }

  private async nextId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('items', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}

/** Bag sid (2101..2130) -> slot index; anything else (equip slots, other pages) is rejected. */
function slotOf(sid: number): number {
  if (!Number.isInteger(sid) || sid < BAG_SID_BASE || sid >= BAG_SID_BASE + BAG_PAGE_SLOTS) throw RpcException.invalidArgs('sid');
  return sid - BAG_SID_BASE;
}
