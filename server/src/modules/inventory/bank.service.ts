// Bank extras (M11 phase C, legacy Go bank_sort.go / bank_quick_move.go): bankSort() merges, orders and repacks the open bank pages;
// bagToBank(sid, dir) moves a whole stack bag -> bank (dir 1) or bank -> bag (dir 2), merging into a matching stack that has room, else
// the first free slot of the destination's opened pages. Both need the bank panel open (Session.bankOpen) and run under the character lock.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BankQuickMove, ItemKind, SlotType, TEMP_BAG_TEXT, bagCapacity, bankCapacity, sidOf as sidAt, slotOf, type ItemSortEntry } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { firstFreeSlot, maxStack, planSort, type BagSlotRow } from './bag-rules';
import { NOTE } from './bag-pages';
import { CharacterItem } from './character-item.schema';
import { withCharLock } from './char-lock';
import { InventoryService } from './inventory.service';
import { PageGate } from './page-gate.service';
import { push, type Push } from './pushes';
import { applySortPlan, mergeInto, setLocation } from './slot-writes';

const BAG_TABS: readonly number[] = [SlotType.BAG, SlotType.QUEST_BAG, SlotType.PET_BAG];

@Injectable()
export class BankService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly inventory: InventoryService,
    private readonly gate: PageGate,
  ) {}

  /** bankSort(): merged-away rows are deleted (onDelCharactorSlot), then onBankSort([{oldId, newId, stackNum}]) keyed by bank sid. */
  bankSort(characterId: number, bankOpen: boolean): Promise<Push[]> {
    if (!bankOpen) throw RpcException.forbidden(NOTE.BANK_CLOSED);
    return withCharLock(characterId, async () => {
      const docs = await this.items.find({ characterId, slotType: SlotType.BANK }).lean();
      const tpls = await this.gate.templates(docs);
      const rows: BagSlotRow[] = docs.map((d) => ({
        id: d._id, slotIndex: d.slotIndex, templateId: d.templateId, itemType: d.itemType, isBound: d.isBound, colorCode: d.colorCode,
        stackCount: d.stackCount, maxStack: d.itemType === ItemKind.ITEM ? maxStack(tpls.items.get(d.templateId)) : 1,
      }));
      const plan = planSort(rows);
      await applySortPlan(this.items, characterId, SlotType.BANK, plan);
      const sid = (index: number): number => sidAt(SlotType.BANK, index);
      const entries: ItemSortEntry[] = plan.kept.map((k) => ({ oldId: sid(k.from), newId: sid(k.to), stackNum: k.stackCount }));
      return [...plan.removed.map((r) => push('onDelCharactorSlot', r.id, sid(r.slotIndex))), push('onBankSort', entries)];
    });
  }

  /** bagToBank(sid, dir): a stale (already empty) source slot is ignored; a full destination answers a note. */
  bagToBank(characterId: number, sid: number, dir: number, bankOpen: boolean): Promise<Push[]> {
    if (dir !== BankQuickMove.TO_BANK && dir !== BankQuickMove.TO_BAG) throw RpcException.invalidArgs('dir');
    const from = slotOf(sid);
    const toBank = dir === BankQuickMove.TO_BANK;
    if (!from || (toBank ? !BAG_TABS.includes(from.slotType) : from.slotType !== SlotType.BANK)) throw RpcException.invalidArgs('sid');
    if (!bankOpen) throw RpcException.forbidden(NOTE.BANK_CLOSED);
    const toType = toBank ? SlotType.BANK : SlotType.BAG;
    return withCharLock(characterId, async () => {
      const src = await this.items.findOne({ characterId, slotType: from.slotType, slotIndex: from.slotIndex }).lean();
      if (!src) return [];
      const ctx = await this.gate.context(characterId);
      const cap = toBank ? bankCapacity(ctx.bankSlotNum) : bagCapacity(ctx.bagSlotNum);
      const existing = await this.items.find({ characterId, slotType: toType }).lean();
      const tpl = src.itemType === ItemKind.ITEM ? (await this.gate.templates([src])).items.get(src.templateId) : undefined;
      const limit = src.itemType === ItemKind.ITEM ? maxStack(tpl) : 1;
      const fit = limit > 1
        ? existing.find((d) => d.slotIndex < cap && d.itemType === src.itemType && d.templateId === src.templateId
          && d.isBound === src.isBound && d.colorCode === src.colorCode && d.stackCount + src.stackCount <= limit)
        : undefined;
      let targetId: number;
      if (fit) {
        await mergeInto(this.items, characterId, src, fit._id, limit);
        targetId = fit._id;
      } else {
        const index = firstFreeSlot(existing.map((d) => d.slotIndex), cap);
        if (index < 0) throw RpcException.forbidden(toBank ? TEMP_BAG_TEXT.BANK_FULL : TEMP_BAG_TEXT.BAG_FULL_BANK);
        await setLocation(this.items, characterId, src._id, from, { slotType: toType, slotIndex: index });
        targetId = src._id;
      }
      const [dto] = await this.inventory.byIds(characterId, [targetId]);
      return [push('onDelCharactorSlot', src._id, sid), push('onAddCharactorSlot', dto)];
    });
  }
}
