// moveItemToPage(srcSid, pageType 1 bag | 2 bank, tab): drops an item into the first free slot of a page (legacy
// item/bag.go:226-344). Pushes onDelCharactorSlot(itemId, oldSid) then onAddCharactorSlot(item at its new sid).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BAG_PAGE_SLOTS, sidOf, type SlotRef } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { firstFreeIn, NOTE, pageTarget } from './bag-pages';
import { movableSlot } from './bag-ops.service';
import { CharacterItem } from './character-item.schema';
import { withCharLock } from './char-lock';
import { InventoryService } from './inventory.service';
import { PageGate } from './page-gate.service';
import { push, type Push } from './pushes';
import { setLocation } from './slot-writes';

@Injectable()
export class PageOpsService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly inventory: InventoryService,
    private readonly gate: PageGate,
  ) {}

  moveToPage(characterId: number, srcSid: number, pageType: number, tab: number, bankOpen: boolean): Promise<Push[]> {
    const from = movableSlot(srcSid);
    return withCharLock(characterId, async () => {
      const ctx = await this.gate.context(characterId);
      const target = pageTarget(pageType, tab, ctx.bagSlotNum, ctx.bankSlotNum);
      if (!target.ok) throw target.note ? RpcException.forbidden(target.note) : RpcException.invalidArgs('page');
      const first: SlotRef = { slotType: target.slotType, slotIndex: target.lo };
      this.gate.assertUsable([from, first], ctx, bankOpen);

      const src = await this.items.findOne({ characterId, slotType: from.slotType, slotIndex: from.slotIndex }).lean();
      if (!src) throw RpcException.notFound('Không tìm thấy vật phẩm');
      if (src.slotType === target.slotType && src.slotIndex >= target.lo && src.slotIndex < target.lo + BAG_PAGE_SLOTS) return [];
      this.gate.assertAccepts(first, this.gate.factsOf(src, await this.gate.templates([src])));

      const rows = await this.items.find({ characterId, slotType: target.slotType }, { slotIndex: 1 }).lean();
      const free = firstFreeIn(rows.map((r) => r.slotIndex), target.lo);
      if (free < 0) throw RpcException.forbidden(NOTE.PAGE_FULL);
      await setLocation(this.items, characterId, src._id, from, { slotType: target.slotType, slotIndex: free });
      const [moved] = await this.inventory.byIds(characterId, [src._id]);
      return [push('onDelCharactorSlot', src._id, sidOf(from.slotType, from.slotIndex)), push('onAddCharactorSlot', moved)];
    });
  }
}
