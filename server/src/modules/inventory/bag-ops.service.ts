// Bag operations (legacy Service.MoveItem / MoveItemPartial / DropItem / SortBag) over the bag, bank, quest page and
// pet-item page. The decisions come from the pure planners in bag-rules.ts, run over rows keyed by sid (slotIndex = sid) so
// one planner serves every page; this file gates them (opened pages, bank open, per-page item rules) and applies them
// with conditional single-row writes (no transactions): merges delete the source before crediting the target and restore
// it on failure, swaps and sorts go through temporary slot indexes (slot-writes.ts).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, sidOf as sidAt, slotOf, type ItemSortEntry, type SlotRef } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Counter } from '../character/counter.schema';
import { isMovable } from './bag-pages';
import { maxStack, planMove, planSort, planSplit, sidOf, type BagSlotRow } from './bag-rules';
import { CharacterItem } from './character-item.schema';
import { withCharLock } from './char-lock';
import { InventoryService } from './inventory.service';
import { PageGate, type TemplateMaps } from './page-gate.service';
import { push, type Push } from './pushes';
import { busy, setLocation, swapLocations } from './slot-writes';

const SORT_OFFSET = 10000;
const DROPPABLE: readonly number[] = [SlotType.BAG, SlotType.QUEST_BAG, SlotType.PET_BAG];

/** sid -> slot of a movable page (bag / bank / quest / pet-item); anything else (equip slots, pet gear) is rejected. */
export function movableSlot(sid: number): SlotRef {
  const ref = slotOf(sid);
  if (!ref || !isMovable(ref)) throw RpcException.invalidArgs('sid');
  return ref;
}

@Injectable()
export class BagOpsService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly inventory: InventoryService,
    private readonly gate: PageGate,
  ) {}

  /** moveItem(fromSid, toSid): bag, bank, quest and pet-item sids (bank only while the bank is open). */
  moveItem(characterId: number, fromSid: number, toSid: number, bankOpen: boolean): Promise<Push[]> {
    const from = movableSlot(fromSid);
    const to = movableSlot(toSid);
    return withCharLock(characterId, async () => {
      this.gate.assertUsable([from, to], await this.gate.context(characterId), bankOpen);
      const { rows, docs, tpls } = await this.load(characterId, [from, to]);
      const plan = planMove(rows, fromSid, toSid);
      switch (plan.kind) {
        case 'error':
          throw RpcException.invalidArgs(plan.reason);
        case 'move':
          this.gate.assertAccepts(to, this.gate.factsOf(docs.get(plan.id)!, tpls));
          await setLocation(this.items, characterId, plan.id, from, to);
          return [push('onMoveItem', fromSid, toSid, plan.id)];
        case 'merge': {
          const src = await this.items.findOneAndDelete({ _id: plan.srcId, characterId, slotType: from.slotType, slotIndex: from.slotIndex }).lean();
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
          this.gate.assertAccepts(to, this.gate.factsOf(docs.get(plan.aId)!, tpls));
          this.gate.assertAccepts(from, this.gate.factsOf(docs.get(plan.bId)!, tpls));
          await swapLocations(this.items, characterId, plan.aId, plan.bId, from, to);
          return [push('onSwapItem', fromSid, toSid)];
      }
    });
  }

  /** moveItemNum(fromSid, toSid, n): split `n` off a stack into an empty slot or a matching stack. */
  moveItemNum(characterId: number, fromSid: number, toSid: number, n: number, bankOpen: boolean): Promise<Push[]> {
    const from = movableSlot(fromSid);
    const to = movableSlot(toSid);
    return withCharLock(characterId, async () => {
      this.gate.assertUsable([from, to], await this.gate.context(characterId), bankOpen);
      const { rows, docs, tpls } = await this.load(characterId, [from, to]);
      const plan = planSplit(rows, fromSid, toSid, n);
      if (plan.kind === 'error') throw RpcException.invalidArgs(plan.reason);
      const src = rows.find((r) => r.id === plan.srcId)!;
      if (plan.kind === 'new') this.gate.assertAccepts(to, this.gate.factsOf(docs.get(src.id)!, tpls));
      // Spend first: take `n` from the source, then credit the destination; refund when the credit fails.
      const took = await this.items.updateOne(
        { _id: src.id, characterId, slotType: from.slotType, stackCount: src.stackCount },
        { $inc: { stackCount: -plan.count } },
      );
      if (took.modifiedCount !== 1) throw busy();
      const refund = (): Promise<unknown> => this.items.updateOne({ _id: src.id, characterId }, { $inc: { stackCount: plan.count } });
      let destId: number;
      try {
        if (plan.kind === 'new') {
          destId = await this.nextId();
          await this.items.create({
            _id: destId, characterId, templateId: src.templateId, itemType: src.itemType, slotType: to.slotType,
            slotIndex: to.slotIndex, stackCount: plan.count, isBound: src.isBound, colorCode: src.colorCode, // H5: colour is inherited
          });
        } else {
          destId = plan.destId;
          const ok = await this.items.updateOne(
            { _id: destId, characterId, stackCount: { $lte: rows.find((r) => r.id === destId)!.maxStack - plan.count } },
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

  /** dropItem(itemId): deletes a bag / quest-page / pet-page item (equipped items must be unequipped first). */
  dropItem(characterId: number, itemId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const item = await this.items.findOne({ _id: itemId, characterId }).lean();
      if (!item) throw RpcException.notFound('Không tìm thấy vật phẩm');
      if (!DROPPABLE.includes(item.slotType)) throw RpcException.forbidden('Hãy cất vật phẩm vào túi trước khi vứt');
      const del = await this.items.deleteOne({ _id: itemId, characterId, slotType: item.slotType });
      if (del.deletedCount !== 1) throw busy();
      return [push('onDelCharactorSlot', itemId, sidAt(item.slotType, item.slotIndex))];
    });
  }

  /** bagSort(): merge, order and repack the whole general bag (all opened pages); pushes merged-away rows, then one onItemSort. */
  bagSort(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const docs = await this.items.find({ characterId, slotType: SlotType.BAG }).lean();
      const tpls = await this.gate.templates(docs);
      const plan = planSort(docs.map((d) => this.toRow(d, tpls, d.slotIndex)));
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

  /** Rows of the slot types of `refs`, as planner rows keyed by sid, plus the documents and templates for the gates. */
  private async load(characterId: number, refs: readonly SlotRef[]) {
    const types = [...new Set(refs.map((r) => r.slotType))];
    const list = await this.items.find({ characterId, slotType: { $in: types } }).lean();
    const tpls = await this.gate.templates(list);
    const docs = new Map(list.map((d) => [d._id, d]));
    const rows = list.map((d) => this.toRow(d, tpls, sidAt(d.slotType, d.slotIndex)));
    return { rows, docs, tpls };
  }

  private toRow(d: CharacterItem, tpls: TemplateMaps, key: number): BagSlotRow {
    return {
      id: d._id, slotIndex: key, templateId: d.templateId, itemType: d.itemType, isBound: d.isBound,
      colorCode: d.colorCode, stackCount: d.stackCount,
      maxStack: d.itemType === ItemKind.ITEM ? maxStack(tpls.items.get(d.templateId)) : 1,
    };
  }

  private async nextId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('items', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
