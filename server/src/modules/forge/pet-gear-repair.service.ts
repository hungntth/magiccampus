// repairPetEqu(petId, itemId, type) / repairPetEquAll(petId, type): pet gear repair through the existing RepairService (10 silver per
// durability point, unbound silver). Parity only: pet gear never wears down in Go. Every repaired piece is re-pushed like Go
// pushPetEquInstance (onChangeEquiptInst + onAddCharactorSlot, then onRefreshPetProp of the wearer), onUPP last.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PET_EQUIP_POS_BASE, PET_EQUIP_SLOTS, petEquipOwner, petEquipSlotIndex, SlotType, type BagItem, type RepairReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterItem } from '../inventory/character-item.schema';
import { push, type Push } from '../inventory/pushes';
import { RepairService } from '../inventory/repair.service';
import { PetService } from '../pet/pet.service';
import type { Out } from './refine.service';

const NOTHING = 'Không có trang bị cần sửa chữa.';

@Injectable()
export class PetGearRepairService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly repairs: RepairService,
    private readonly pets: PetService,
  ) {}

  repairOne(characterId: number, itemId: number): Promise<Out<RepairReply>> {
    return this.run(characterId, [itemId]);
  }

  /** Every piece worn by the pet (their slotIndex encodes the pet id, so a foreign pet id finds nothing). */
  async repairAll(characterId: number, petId: number): Promise<Out<RepairReply>> {
    const lo = petEquipSlotIndex(petId, PET_EQUIP_POS_BASE);
    const worn = await this.items.find({ characterId, slotType: SlotType.PET_EQUIP, slotIndex: { $gte: lo, $lt: lo + PET_EQUIP_SLOTS } }, { _id: 1 }).lean();
    if (worn.length === 0) throw RpcException.forbidden(NOTHING);
    return this.run(characterId, worn.map((w) => w._id));
  }

  private async run(characterId: number, ids: readonly number[]): Promise<Out<RepairReply>> {
    const result = await this.repairs.repairPetGear(characterId, ids);
    const pushes: Push[] = [];
    const wearers = new Set<number>();
    for (const p of result.pushes) {
      if (p.m !== 'onAddCharactorSlot') continue;
      const item = p.a[0] as BagItem;
      pushes.push(push('onChangeEquiptInst', item), p);
      if (item.slotType === SlotType.PET_EQUIP) wearers.add(petEquipOwner(item.slotIndex).petId);
    }
    pushes.push(...await this.pets.refreshPets(characterId, [...wearers]));
    pushes.push(...result.pushes.filter((p) => p.m !== 'onAddCharactorSlot'));
    return { reply: result.reply, pushes };
  }
}
