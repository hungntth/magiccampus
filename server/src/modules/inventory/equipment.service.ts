// Equip / unequip (legacy Service.EquipItem / UnequipItem). Equipped items live in character_items with slotType 1,
// slotIndex = template position - 1, sid = position. Occupants are moved out first so the unique
// (character, slotType, slotIndex) index never collides; a failed second write puts the occupant back.
// Failures throw RpcException with a Vietnamese message; the RPC layer shows it through onSystemMidMsgOrNote.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, slotOf, type BagItem } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { firstFreeSlot, sidOf } from './bag-rules';
import { CharacterItem } from './character-item.schema';
import { classAllowed, equipPosition } from './equip-stats';
import { InventoryService } from './inventory.service';
import { withCharLock } from './char-lock';
import { push, type Push } from './pushes';

export interface EquipOnResult {
  pushes: Push[];
  equipItems: BagItem[];
}

@Injectable()
export class EquipmentService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly stats: CharacterStatsService,
  ) {}

  equipOn(characterId: number, itemId: number): Promise<EquipOnResult> {
    return withCharLock(characterId, () => this.doEquipOn(characterId, itemId));
  }

  /** `toSid` -1 = first free bag slot, else that (empty) bag slot. */
  equipOff(characterId: number, itemId: number, toSid: number): Promise<{ pushes: Push[] }> {
    return withCharLock(characterId, () => this.doEquipOff(characterId, itemId, toSid));
  }

  private async doEquipOn(characterId: number, itemId: number): Promise<EquipOnResult> {
    const item = await this.items.findOne({ _id: itemId, characterId }).lean();
    if (!item) throw RpcException.notFound('Không tìm thấy vật phẩm');
    if (item.itemType !== ItemKind.EQUIP) throw RpcException.invalidArgs('Vật phẩm này không thể trang bị');
    if (item.slotType !== SlotType.BAG) throw RpcException.invalidArgs('Vật phẩm đã được trang bị');
    const tpl = await this.gameData.template(19, item.templateId);
    const position = equipPosition(tpl);
    if (position === null) throw RpcException.invalidArgs('Vật phẩm này không thể trang bị');
    if (item.durability <= 0 && item.maxDurability > 0) throw RpcException.forbidden('Trang bị đã hỏng');
    const char = await this.chars.findById(characterId, { level: 1, classId: 1 }).lean();
    if (!char) throw RpcException.notFound('character not found');
    if (char.level < Number(tpl?.req_level ?? 0)) throw RpcException.forbidden('Cấp độ bạn chưa đủ!');
    if (!classAllowed(tpl?.req_class, char.classId)) throw RpcException.forbidden('Nghề nghiệp bạn không phù hợp!');

    const slotIndex = position - 1;
    const occupant = await this.items.findOne({ characterId, slotType: SlotType.EQUIP, slotIndex }).lean();
    let freeSlot = -1;
    if (occupant) {
      freeSlot = await this.firstFree(characterId);
      if (freeSlot < 0) throw RpcException.forbidden('Túi đồ đã đầy');
      await this.moveRow(characterId, occupant._id, SlotType.EQUIP, slotIndex, SlotType.BAG, freeSlot);
    }
    try {
      await this.moveRow(characterId, item._id, SlotType.BAG, item.slotIndex, SlotType.EQUIP, slotIndex);
    } catch (e) {
      if (occupant) await this.moveRow(characterId, occupant._id, SlotType.BAG, freeSlot, SlotType.EQUIP, slotIndex).catch(() => undefined);
      throw e;
    }

    const pushes: Push[] = [push('onMoveItem', sidOf(item.slotIndex), position, item._id)];
    if (occupant) pushes.push(push('onMoveItem', position, sidOf(freeSlot), occupant._id));
    for (const update of await this.stats.gearChangeUpdates(characterId)) pushes.push(push('onUPP', update));
    return { pushes, equipItems: await this.inventory.equipped(characterId) };
  }

  private async doEquipOff(characterId: number, itemId: number, toSid: number): Promise<{ pushes: Push[] }> {
    const item = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.EQUIP }).lean();
    if (!item) throw RpcException.notFound('Trang bị không ở trên người');
    let target: number;
    if (toSid === -1) {
      target = await this.firstFree(characterId);
      if (target < 0) throw RpcException.forbidden('Túi đồ đã đầy');
    } else {
      const ref = slotOf(toSid);
      if (!ref || ref.slotType !== SlotType.BAG) throw RpcException.invalidArgs('toSid');
      const cap = await this.inventory.capacity(characterId);
      if (ref.slotIndex >= cap) throw RpcException.forbidden('Trang túi chưa mở.');
      target = ref.slotIndex;
      if (await this.items.exists({ characterId, slotType: SlotType.BAG, slotIndex: target })) {
        throw RpcException.forbidden('Ô túi đồ đã có vật phẩm');
      }
    }
    await this.moveRow(characterId, item._id, SlotType.EQUIP, item.slotIndex, SlotType.BAG, target);
    const pushes: Push[] = [push('onMoveItem', item.slotIndex + 1, sidOf(target), item._id)];
    for (const update of await this.stats.gearChangeUpdates(characterId)) pushes.push(push('onUPP', update));
    return { pushes };
  }

  private async firstFree(characterId: number): Promise<number> {
    const rows = await this.items.find({ characterId, slotType: SlotType.BAG }, { slotIndex: 1 }).lean();
    return firstFreeSlot(rows.map((r) => r.slotIndex), await this.inventory.capacity(characterId));
  }

  /** Conditional single-row move; a miss or a unique-index collision means the world changed, so fail. */
  private async moveRow(
    characterId: number, id: number, fromType: number, fromIndex: number, toType: number, toIndex: number,
  ): Promise<void> {
    try {
      const r = await this.items.updateOne(
        { _id: id, characterId, slotType: fromType, slotIndex: fromIndex },
        { $set: { slotType: toType, slotIndex: toIndex } },
      );
      if (r.modifiedCount === 1) return;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    throw RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');
  }
}
