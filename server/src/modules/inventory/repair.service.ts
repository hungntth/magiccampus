// repair(itemId, mode) / repairAll(mode): restores durability to the maximum for (maxDurability - durability) * 10
// unbound silver (Go ignores `mode`; the money type preference is not used either). Spend before credit: the silver is
// charged with a conditional decrement first and refunded if the durability write fails. repairAll covers equipped rows.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, type RepairReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { planRepair } from './repair-rules';
import { CharacterItem } from './character-item.schema';
import { withCharLock } from './char-lock';
import { InventoryService } from './inventory.service';
import { push, type Push } from './pushes';

export interface RepairResult {
  reply: RepairReply;
  pushes: Push[];
}

const NOTHING = 'Không có trang bị cần sửa chữa.';

@Injectable()
export class RepairService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly inventory: InventoryService,
  ) {}

  /** One owned item (bag, bank, quest page or worn); pet gear is not repairable (Go never registered those RPCs). */
  repair(characterId: number, itemId: number): Promise<RepairResult> {
    return withCharLock(characterId, async () => {
      const row = await this.items.findOne({ _id: itemId, characterId, slotType: { $ne: SlotType.PET_EQUIP } }).lean();
      if (!row) throw RpcException.notFound('Không tìm thấy vật phẩm');
      return this.apply(characterId, [row]);
    });
  }

  /** Pet gear (bag, pet-item page or worn by a pet): same price and rules as repair; parity only, pet gear never wears down. */
  repairPetGear(characterId: number, itemIds: readonly number[]): Promise<RepairResult> {
    return withCharLock(characterId, async () => {
      const slotType = { $in: [SlotType.BAG, SlotType.PET_BAG, SlotType.PET_EQUIP] };
      const rows = await this.items.find({ _id: { $in: [...itemIds] }, characterId, itemType: ItemKind.EQUIP, slotType }).lean();
      if (rows.length === 0) throw RpcException.notFound('Không tìm thấy vật phẩm');
      return this.apply(characterId, rows);
    });
  }

  repairAll(characterId: number): Promise<RepairResult> {
    return withCharLock(characterId, async () => {
      const rows = await this.items.find({ characterId, slotType: SlotType.EQUIP }).lean();
      return this.apply(characterId, rows);
    });
  }

  private async apply(characterId: number, rows: CharacterItem[]): Promise<RepairResult> {
    const plan = planRepair(rows.map((r) => ({ id: r._id, durability: r.durability, maxDurability: r.maxDurability })));
    if (plan.items.length === 0) throw RpcException.forbidden(NOTHING);
    const spent = await this.chars.findOneAndUpdate(
      { _id: characterId, money: { $gte: plan.total } },
      { $inc: { money: -plan.total } },
      { new: true, projection: { money: 1 } },
    ).lean();
    if (!spent) throw RpcException.forbidden('Không đủ bạc để sửa chữa!');
    let fixed = 0;
    try {
      for (const it of plan.items) {
        const row = rows.find((r) => r._id === it.id)!;
        const r = await this.items.updateOne(
          { _id: it.id, characterId, durability: row.durability },
          { $set: { durability: row.maxDurability } },
        );
        if (r.modifiedCount !== 1) throw RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');
        fixed += it.cost;
      }
    } catch (e) {
      // Keep what was really repaired: refund only the unrepaired part.
      await this.chars.updateOne({ _id: characterId }, { $inc: { money: plan.total - fixed } });
      throw e;
    }
    const slots = await this.inventory.byIds(characterId, plan.items.map((i) => i.id));
    return {
      reply: { success: true, cost: plan.total, money: spent.money },
      pushes: [...slots.map((s) => push('onAddCharactorSlot', s)), push('onUPP', { money: spent.money })],
    };
  }
}
