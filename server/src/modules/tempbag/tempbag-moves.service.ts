// Túi Tiện Dụng item moves (Go tempbag_moves.go / tempbag_take.go / tempbag_sort.go): bag -> temp (addtItemFromBag / addmxFromBag),
// between temp slots, temp -> bag (tempToBag / addItemFromTemp, optional split count), delete and sort. Whole stacks move by
// changing the row's slot (unique key, no copy); a merge deletes the source before raising the target and restores it on failure;
// a split lowers the source before creating the new stack. Everything runs under the character lock and returns the ordered pushes.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ItemKind, SlotType, TEMP_BAG_TEXT, acceptsTemp, slotOf, tempIndex, validTempPos, type SlotRef } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Counter } from '../character/counter.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { firstFreeSlot, maxStack } from '../inventory/bag-rules';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { busy, mergeInto, setLocation, swapLocations } from '../inventory/slot-writes';
import { planBetween, planPut, planSortTemp, sameStack, type StackKey } from './tempbag-rules';
import { TempBagStateService } from './tempbag-state.service';

const SORT_OFFSET = 100_000;
const names = (mx: boolean) => ({
  toTemp: mx ? 'onMoveMXToTBag' : 'onMoveToTBag',
  between: mx ? 'onMoveMXBtw' : 'onMoveTempBtw',
  slot: mx ? 'onAddItemDelmx' : 'onAddItemDelTemp',
});
const tempRef = (mx: boolean, pos: number): SlotRef => ({ slotType: SlotType.TEMP_BAG, slotIndex: tempIndex(mx, pos) });
const keyOf = (d: CharacterItem): StackKey => ({ templateId: d.templateId, itemType: d.itemType, isBound: d.isBound, colorCode: d.colorCode });

@Injectable()
export class TempBagMovesService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly inventory: InventoryService,
    private readonly state: TempBagStateService,
    private readonly gameData: GameDataService,
  ) {}

  /** addtItemFromBag / addmxFromBag(bagSid, posId): a whole bag stack into the temp bag. A stale (already empty) bag slot is ignored. */
  put(cid: number, mx: boolean, bagSid: number, pos: number): Promise<Push[]> {
    if (!validTempPos(pos)) throw RpcException.invalidArgs('posId');
    const ref = slotOf(bagSid);
    if (!ref || ref.slotType !== SlotType.BAG) throw RpcException.invalidArgs('bagSid');
    return withCharLock(cid, async () => {
      const src = await this.items.findOne({ characterId: cid, slotType: SlotType.BAG, slotIndex: ref.slotIndex }).lean();
      if (!src) return [];
      const tpl = src.itemType === ItemKind.ITEM ? await this.gameData.template(29, src.templateId) : undefined;
      const facts = tpl ? { kind: Number(tpl.kind ?? 0), type: Number(tpl.type ?? 0) } : undefined;
      if (!facts || !acceptsTemp(mx, facts, src.templateId)) throw RpcException.forbidden(mx ? TEMP_BAG_TEXT.MX_ONLY : TEMP_BAG_TEXT.MATERIAL);
      const [rows, cap] = await Promise.all([this.state.rows(cid, mx), this.state.capacity(cid, mx)]);
      const plan = planPut(rows, cap, pos, { ...keyOf(src), stackCount: src.stackCount, maxStack: maxStack(tpl) });
      if (plan.kind === 'error') throw RpcException.forbidden(plan.note);
      let landed: CharacterItem;
      if (plan.kind === 'move') {
        await setLocation(this.items, cid, src._id, ref, tempRef(mx, pos));
        landed = { ...src, slotType: SlotType.TEMP_BAG, slotIndex: tempIndex(mx, pos) };
      } else {
        landed = await this.merge(cid, src, plan.destId, maxStack(tpl));
      }
      return [push(names(mx).toTemp, bagSid, pos, await this.state.slot(landed), await this.state.count(cid, mx))];
    });
  }

  /** moveItemBtwTemp / movemxBtwTemp(from, to): move, merge or swap two temp slots. */
  between(cid: number, mx: boolean, from: number, to: number): Promise<Push[]> {
    if (!validTempPos(from) || !validTempPos(to) || from === to) throw RpcException.invalidArgs('posId');
    return withCharLock(cid, async () => {
      const [rows, cap] = await Promise.all([this.state.rows(cid, mx), this.state.capacity(cid, mx)]);
      const plan = planBetween(rows, cap, from, to);
      if (plan.kind === 'missing') return [];
      if (plan.kind === 'error') throw RpcException.forbidden(plan.note);
      const src = rows.find((r) => r.pos === from)!;
      const cur = rows.length;
      const out = (a: unknown, b: unknown, n = cur): Push[] => [push(names(mx).between, from, a, to, b, n)];
      if (plan.kind === 'move') {
        await setLocation(this.items, cid, plan.id, tempRef(mx, from), tempRef(mx, to));
        return out(null, await this.state.slotRow(src, mx));
      }
      const dest = rows.find((r) => r.pos === to)!;
      if (plan.kind === 'merge') {
        const merged = await this.merge(cid, await this.mustRow(cid, plan.srcId), plan.destId, dest.maxStack);
        return out(null, await this.state.slot(merged), cur - 1);
      }
      await swapLocations(this.items, cid, plan.aId, plan.bId, tempRef(mx, from), tempRef(mx, to));
      return out(await this.state.slotRow(dest, mx), await this.state.slotRow(src, mx));
    });
  }

  /**
   * tempToBag(pos) (auto target) / addItemFromTemp(pos, bagSid[, num]): temp -> bag. `num` splits part of the stack off.
   * Pushes the temp slot update, then the bag slot (onAddCharactorSlot).
   */
  take(cid: number, mx: boolean, pos: number, bagSid: number | null, num: number | null): Promise<Push[]> {
    if (!validTempPos(pos)) throw RpcException.invalidArgs('posId');
    const ref = bagSid === null ? null : slotOf(bagSid);
    if (bagSid !== null && (!ref || ref.slotType !== SlotType.BAG)) throw RpcException.invalidArgs('bagSid');
    return withCharLock(cid, async () => {
      const src = await this.items.findOne({ characterId: cid, slotType: SlotType.TEMP_BAG, slotIndex: tempIndex(mx, pos) }).lean();
      if (!src) return [];
      const tpl = await this.gameData.template(29, src.templateId);
      const limit = src.itemType === ItemKind.ITEM ? maxStack(tpl) : 1;
      const count = num !== null && num >= 1 && num <= src.stackCount ? num : src.stackCount;
      const bagCap = await this.inventory.capacity(cid);
      const bagDocs = await this.items.find({ characterId: cid, slotType: SlotType.BAG }).lean();
      let index = ref ? ref.slotIndex : -1;
      if (ref && ref.slotIndex >= bagCap) throw RpcException.invalidArgs('bagSid');
      if (!ref) {
        const fit = bagDocs.find((d) => d.slotIndex < bagCap && sameStack(keyOf(src), keyOf(d)) && d.stackCount + count <= limit);
        index = fit ? fit.slotIndex : firstFreeSlot(bagDocs.map((d) => d.slotIndex), bagCap);
        if (index < 0) throw RpcException.forbidden(TEMP_BAG_TEXT.BAG_FULL);
      }
      const dst = bagDocs.find((d) => d.slotIndex === index);
      let bagId: number;
      if (dst) {
        if (!sameStack(keyOf(src), keyOf(dst)) || dst.stackCount + count > limit) throw RpcException.forbidden(TEMP_BAG_TEXT.SLOT_TAKEN);
        await this.transfer(cid, src, dst._id, count, limit);
        bagId = dst._id;
      } else if (count === src.stackCount) {
        await setLocation(this.items, cid, src._id, tempRef(mx, pos), { slotType: SlotType.BAG, slotIndex: index });
        bagId = src._id;
      } else {
        bagId = await this.split(cid, src, count, index);
      }
      const left = await this.items.findOne({ _id: src._id, characterId: cid, slotType: SlotType.TEMP_BAG }).lean();
      const [dto] = await this.inventory.byIds(cid, [bagId]);
      return [push(names(mx).slot, left ? await this.state.slot(left) : null, pos, await this.state.count(cid, mx)), push('onAddCharactorSlot', dto)];
    });
  }

  /** delTempSlot / delmxTempSlot(posId[, md5]): destroys the stack (no secondary password in H5). */
  remove(cid: number, mx: boolean, pos: number): Promise<Push[]> {
    if (!validTempPos(pos)) throw RpcException.invalidArgs('posId');
    return withCharLock(cid, async () => {
      const gone = await this.items.findOneAndDelete({ characterId: cid, slotType: SlotType.TEMP_BAG, slotIndex: tempIndex(mx, pos) }).lean();
      if (!gone) return [];
      return [push(names(mx).slot, null, pos, await this.state.count(cid, mx))];
    });
  }

  /** tempBagSort / mxBagSort: stage every moved row above the layout, then pack back to posId 1..n. */
  sort(cid: number, mx: boolean): Promise<void> {
    return withCharLock(cid, async () => {
      const steps = planSortTemp(await this.state.rows(cid, mx)).filter((s) => s.from !== s.to);
      if (steps.length === 0) return;
      const bulk = (index: (s: (typeof steps)[number]) => number, at: (s: (typeof steps)[number]) => number) =>
        steps.map((s) => ({
          updateOne: {
            filter: { _id: s.id, characterId: cid, slotType: SlotType.TEMP_BAG, slotIndex: at(s) },
            update: { $set: { slotIndex: index(s) } },
          },
        }));
      await this.items.bulkWrite(bulk((s) => tempIndex(mx, s.from) + SORT_OFFSET, (s) => tempIndex(mx, s.from)), { ordered: true });
      await this.items.bulkWrite(bulk((s) => tempIndex(mx, s.to), (s) => tempIndex(mx, s.from) + SORT_OFFSET), { ordered: true });
    });
  }

  private async mustRow(cid: number, id: number): Promise<CharacterItem> {
    const doc = await this.items.findOne({ _id: id, characterId: cid }).lean();
    if (!doc) throw busy();
    return doc;
  }

  /** Whole-stack merge (source deleted first, restored on failure). Returns the target row. */
  private async merge(cid: number, src: CharacterItem, destId: number, limit: number): Promise<CharacterItem> {
    await mergeInto(this.items, cid, src, destId, limit);
    return this.mustRow(cid, destId);
  }

  /** Moves `count` units of `src` into the row `destId` (merge when all, else lower then raise with refund). */
  private async transfer(cid: number, src: CharacterItem, destId: number, count: number, limit: number): Promise<void> {
    if (count === src.stackCount) {
      await this.merge(cid, src, destId, limit);
      return;
    }
    const took = await this.items.updateOne({ _id: src._id, characterId: cid, stackCount: src.stackCount }, { $inc: { stackCount: -count } });
    if (took.modifiedCount !== 1) throw busy();
    const ok = await this.items.updateOne({ _id: destId, characterId: cid, stackCount: { $lte: limit - count } }, { $inc: { stackCount: count } });
    if (ok.modifiedCount !== 1) {
      await this.items.updateOne({ _id: src._id, characterId: cid }, { $inc: { stackCount: count } });
      throw busy();
    }
  }

  /** Splits `count` units off `src` into a new bag row at `index`; returns the new row id. */
  private async split(cid: number, src: CharacterItem, count: number, index: number): Promise<number> {
    const took = await this.items.updateOne({ _id: src._id, characterId: cid, stackCount: src.stackCount }, { $inc: { stackCount: -count } });
    if (took.modifiedCount !== 1) throw busy();
    try {
      const id = await this.nextId();
      await this.items.create({
        _id: id, characterId: cid, templateId: src.templateId, itemType: src.itemType, slotType: SlotType.BAG, slotIndex: index,
        stackCount: count, isBound: src.isBound, colorCode: src.colorCode,
      });
      return id;
    } catch (e) {
      await this.items.updateOne({ _id: src._id, characterId: cid }, { $inc: { stackCount: count } });
      throw (e as { code?: number }).code === 11000 ? busy() : e;
    }
  }

  private async nextId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('items', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
