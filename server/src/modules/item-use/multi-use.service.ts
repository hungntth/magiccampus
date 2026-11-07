// useMultiItem(targetType, petId, slotId, n) (Go use_multi.go): uses a stack unit by unit through the single-use path (character or pet
// target), stops at the first refusal and caps n by the stack. Each unit takes the character lock on its own, exactly like a double-click,
// so every rule (level gate, rooms, caps) applies per unit and a refusal keeps the rest of the stack.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, capUseCount, type UseMultiItemReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterItem } from '../inventory/character-item.schema';
import type { Push } from '../inventory/pushes';
import { UseItemService } from '../inventory/use-item.service';
import { foldSlotPushes, runBatch } from './multi-use';

@Injectable()
export class MultiUseService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly useItem: UseItemService,
  ) {}

  private async stackOf(characterId: number, itemId: number): Promise<number> {
    const row = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.BAG }, { stackCount: 1 }).lean();
    return row?.stackCount ?? 0;
  }

  async useMulti(
    characterId: number, targetType: 1 | 2, petId: number, itemId: number, requested: number,
  ): Promise<{ reply: UseMultiItemReply; pushes: Push[] }> {
    const row = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.BAG }, { itemType: 1, stackCount: 1 }).lean();
    if (!row) throw RpcException.notFound('Không tìm thấy vật phẩm');
    if (row.itemType !== ItemKind.ITEM) throw RpcException.forbidden('Vật phẩm này không dùng hàng loạt được');
    const count = capUseCount(requested, row.stackCount);
    if (count <= 0) throw RpcException.invalidArgs('n');
    const batch = await runBatch(count, async () => {
      const before = await this.stackOf(characterId, itemId);
      const pushes = targetType === 2 ? await this.useItem.usePet(characterId, petId, itemId) : await this.useItem.useItem(characterId, itemId);
      return { used: (await this.stackOf(characterId, itemId)) < before, pushes };
    });
    return {
      reply: { consumed: batch.consumed, remaining: await this.stackOf(characterId, itemId) },
      pushes: foldSlotPushes(batch.pushes, itemId),
    };
  }
}
