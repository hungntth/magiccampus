// Pet equipment (petEquipOn / petEquipOff, release return). Equipped pet items stay in character_items with
// slotType 6 and slotIndex = petId * 8 + (pos - 50) (shared petEquipSlotIndex), so the unique (character, slotType,
// slotIndex) index allows one item per pet slot. pet.equ[] mirrors the item ids. Moves are conditional single-row
// updates with rollback; the pet document is written last. Methods lock per character except returnAll (caller holds it).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, PET_EQUIP_POS_BASE, PET_EQUIP_SLOTS, SlotType, petEquipSlotIndex } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { firstFreeSlot } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { PetBonusService } from './pet-bonus.service';
import { creatureClassIds, loadOwnedPet } from './pet-owned';
import { petEquipBlocker, petEquipIndex } from './pet-gear-rules';
import { emptyEquipment } from './pet-rules';
import { propertyOfPet } from './pet-view';
import { Pet } from './pet.schema';

interface Move {
  id: number;
  from: [number, number]; // [slotType, slotIndex]
  to: [number, number];
}

const busy = (): RpcException => RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');

@Injectable()
export class PetEquipService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly bonus: PetBonusService,
  ) {}

  equipOn(characterId: number, petId: number, itemId: number): Promise<Push[]> {
    return withCharLock(characterId, () => this.doEquipOn(characterId, petId, itemId));
  }

  equipOff(characterId: number, petId: number, itemId: number): Promise<Push[]> {
    return withCharLock(characterId, () => this.doEquipOff(characterId, petId, itemId));
  }

  /**
   * Moves every item worn by the pet back to the bag (release / quest turn-in), refusing when the bag cannot take them all.
   * The caller holds the character lock and deletes the pet afterwards.
   */
  async returnAll(characterId: number, petId: number): Promise<Push[]> {
    const lo = petEquipSlotIndex(petId, PET_EQUIP_POS_BASE);
    const worn = await this.items.find({ characterId, slotType: SlotType.PET_EQUIP, slotIndex: { $gte: lo, $lt: lo + PET_EQUIP_SLOTS } }).lean();
    if (worn.length === 0) return [];
    const used = new Set((await this.items.find({ characterId, slotType: SlotType.BAG }, { slotIndex: 1 }).lean()).map((r) => r.slotIndex));
    const capacity = await this.inventory.capacity(characterId);
    const moves: Move[] = [];
    for (const w of worn) {
      const free = firstFreeSlot(used, capacity);
      if (free < 0) throw RpcException.forbidden('Túi đồ không đủ chỗ để nhận trang bị của pet');
      used.add(free);
      moves.push({ id: w._id, from: [SlotType.PET_EQUIP, w.slotIndex], to: [SlotType.BAG, free] });
    }
    await this.applyMoves(characterId, moves);
    return (await this.inventory.byIds(characterId, moves.map((m) => m.id))).map((i) => push('onAddCharactorSlot', i));
  }

  private async doEquipOn(characterId: number, petId: number, itemId: number): Promise<Push[]> {
    const { row, tpl } = await loadOwnedPet(this.pets, this.gameData, characterId, petId);
    // Gear may come from the bag or the pet-item page; the displaced piece takes the slot the new one frees.
    const item = await this.items.findOne({ _id: itemId, characterId, slotType: { $in: [SlotType.BAG, SlotType.PET_BAG] } }).lean();
    if (!item || item.itemType !== ItemKind.EQUIP) throw RpcException.notFound('Không tìm thấy trang bị');
    const etpl = await this.gameData.template(19, item.templateId);
    const idx = petEquipIndex(etpl);
    if (!etpl || idx === null) throw RpcException.invalidArgs('Vật phẩm này không thể trang bị cho pet');
    const why = petEquipBlocker(etpl, { petLevel: row.level, petTid: row.tid, creatureClassIds: creatureClassIds(tpl) });
    if (why) throw RpcException.forbidden(why);

    const target = petEquipSlotIndex(petId, PET_EQUIP_POS_BASE + idx);
    const occupant = await this.items.findOne({ characterId, slotType: SlotType.PET_EQUIP, slotIndex: target }, { _id: 1 }).lean();
    const moves: Move[] = [];
    if (occupant) {
      // The displaced item takes the bag slot the new one frees; the new one waits in a temporary (negative) index.
      const tmp: [number, number] = [SlotType.PET_EQUIP, -item._id];
      moves.push(
        { id: item._id, from: [item.slotType, item.slotIndex], to: tmp },
        { id: occupant._id, from: [SlotType.PET_EQUIP, target], to: [item.slotType, item.slotIndex] },
        { id: item._id, from: tmp, to: [SlotType.PET_EQUIP, target] },
      );
    } else {
      moves.push({ id: item._id, from: [item.slotType, item.slotIndex], to: [SlotType.PET_EQUIP, target] });
    }
    const oldId = occupant?._id ?? 0;
    const equ = this.equOf(row);
    equ[idx] = item._id;
    const rows = await this.commit(characterId, petId, moves, equ);
    const extras = await this.bonus.extrasOf(characterId, rows);
    const slots = await this.inventory.byIds(characterId, occupant ? [item._id, occupant._id] : [item._id]);
    return [
      ...slots.map((i) => push('onAddCharactorSlot', i)),
      push('onUpdatePet', petId, `equ${idx + 1}`, item._id),
      push('onRefreshPetProp', petId, propertyOfPet(rows, tpl, extras.bonuses)),
      push('onPetEquipOn', petId, idx + 1, oldId, item._id),
    ];
  }

  private async doEquipOff(characterId: number, petId: number, itemId: number): Promise<Push[]> {
    const { row, tpl } = await loadOwnedPet(this.pets, this.gameData, characterId, petId);
    const idx = this.equOf(row).indexOf(itemId);
    const slot = idx < 0 ? -1 : petEquipSlotIndex(petId, PET_EQUIP_POS_BASE + idx);
    const item = idx < 0 ? null : await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.PET_EQUIP, slotIndex: slot }, { _id: 1 }).lean();
    if (!item) throw RpcException.notFound('Trang bị không ở trên pet');
    const used = (await this.items.find({ characterId, slotType: SlotType.BAG }, { slotIndex: 1 }).lean()).map((r) => r.slotIndex);
    const free = firstFreeSlot(used, await this.inventory.capacity(characterId));
    if (free < 0) throw RpcException.forbidden('Túi đồ đã đầy');
    const equ = this.equOf(row);
    equ[idx] = 0;
    const rows = await this.commit(characterId, petId, [{ id: itemId, from: [SlotType.PET_EQUIP, slot], to: [SlotType.BAG, free] }], equ);
    const extras = await this.bonus.extrasOf(characterId, rows);
    return [
      ...(await this.inventory.byIds(characterId, [itemId])).map((i) => push('onAddCharactorSlot', i)),
      push('onUpdatePet', petId, `equ${idx + 1}`, 0),
      push('onRefreshPetProp', petId, propertyOfPet(rows, tpl, extras.bonuses)),
      push('onPetEquipOff', petId, idx + 1, itemId),
    ];
  }

  private equOf(row: Pet): number[] {
    const equ = emptyEquipment();
    (row.equ ?? []).slice(0, PET_EQUIP_SLOTS).forEach((v, i) => (equ[i] = v));
    return equ;
  }

  /** Applies the item moves, then writes pet.equ; a failure puts every move back. Returns the updated pet. */
  private async commit(characterId: number, petId: number, moves: Move[], equ: number[]): Promise<Pet> {
    const done = await this.applyMoves(characterId, moves);
    try {
      const row = await this.pets.findOneAndUpdate({ _id: petId, characterId }, { $set: { equ } }, { new: true }).lean();
      if (!row) throw RpcException.notFound('Không tìm thấy pet');
      return row;
    } catch (e) {
      await this.undo(characterId, done);
      throw e;
    }
  }

  private async applyMoves(characterId: number, moves: readonly Move[]): Promise<Move[]> {
    const done: Move[] = [];
    try {
      for (const m of moves) {
        await this.moveRow(characterId, m);
        done.push(m);
      }
    } catch (e) {
      await this.undo(characterId, done);
      throw e;
    }
    return done;
  }

  private async undo(characterId: number, done: readonly Move[]): Promise<void> {
    for (const m of [...done].reverse()) {
      await this.moveRow(characterId, { id: m.id, from: m.to, to: m.from }).catch(() => undefined);
    }
  }

  /** Conditional single-row move; a miss or a unique-index collision means the world changed, so fail. */
  private async moveRow(characterId: number, m: Move): Promise<void> {
    try {
      const r = await this.items.updateOne(
        { _id: m.id, characterId, slotType: m.from[0], slotIndex: m.from[1] },
        { $set: { slotType: m.to[0], slotIndex: m.to[1] } },
      );
      if (r.modifiedCount === 1) return;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
    }
    throw busy();
  }
}
