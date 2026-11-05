// Shared plumbing of the pet gear upgrade services: loading an owned pet gear piece (bag, pet-item page or worn), the push block
// every change sends (onDelCharactorSlot when the tier changed, onChangeEquiptInst, onAddCharactorSlot, onRefreshPetProp of the
// wearer), plain-gold charging and the dust / shard bookkeeping. Pet gear never wears down in Go; repair is parity only.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  isPetEquipPosition, isSpecialPetEquipPosition, ItemKind, petEquipColor, petEquipOwner, sidOf, SlotType, type BagItem, type PlayerUpdate,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterService } from '../character/character.service';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { PetService } from '../pet/pet.service';
import { PET_EQU_TEXT } from './pet-gear-up-rules';

const GEAR_SLOTS = [SlotType.BAG, SlotType.PET_BAG, SlotType.PET_EQUIP];
const BAG_TABS: readonly number[] = [SlotType.BAG, SlotType.PET_BAG];
export const PET_GEAR_KIND = 9;

/** An owned pet gear piece with its template. */
export interface PetGear {
  row: CharacterItem;
  tpl: Row;
  position: number;
  special: boolean;
  /** Display colour 0..4. */
  color: number;
}

export interface GoldCharge {
  amount: number;
  /** Balance after the charge. */
  total: number;
}

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class PetGearOpsService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly characters: CharacterService,
    private readonly pets: PetService,
  ) {}

  /** A kind-9 piece at position 50..57 of the character; any other row is refused with the generic note. */
  async load(characterId: number, itemId: number, refusal: string = PET_EQU_TEXT.invalid): Promise<PetGear> {
    const row = await this.items.findOne({ _id: itemId, characterId, itemType: ItemKind.EQUIP, slotType: { $in: GEAR_SLOTS } }).lean();
    const tpl = row ? await this.gameData.template(19, row.templateId) : undefined;
    const position = int(tpl?.position);
    if (!row || !tpl || int(tpl.kind) !== PET_GEAR_KIND || !isPetEquipPosition(position)) throw RpcException.forbidden(refusal);
    return { row, tpl, position, special: isSpecialPetEquipPosition(position), color: petEquipColor(row.colorCode) };
  }

  /** The pet wearing the piece, or null when it sits in a bag. */
  wearerOf(row: Pick<CharacterItem, 'slotType' | 'slotIndex'>): number | null {
    return row.slotType === SlotType.PET_EQUIP ? petEquipOwner(row.slotIndex).petId : null;
  }

  /**
   * The pushes after a piece changed: onDelCharactorSlot when the template changed under a bag tab (the client keeps a
   * per-template index), onChangeEquiptInst, onAddCharactorSlot and onRefreshPetProp of the wearer. `cachedColor` overrides the
   * colour of the onChangeEquiptInst payload (the recolour reply handler needs the pre-roll colour there).
   */
  async instancePushes(characterId: number, before: Pick<CharacterItem, '_id' | 'templateId' | 'slotType' | 'slotIndex'>, cachedColor?: number): Promise<Push[]> {
    const [view] = await this.inventory.byIds(characterId, [before._id]);
    if (!view) return [];
    const out: Push[] = [];
    if (view.tid !== before.templateId && BAG_TABS.includes(before.slotType)) {
      out.push(push('onDelCharactorSlot', before._id, sidOf(before.slotType, before.slotIndex)));
    }
    const cached: BagItem = cachedColor === undefined ? view : { ...view, color: cachedColor };
    out.push(push('onChangeEquiptInst', cached), push('onAddCharactorSlot', view));
    const wearer = this.wearerOf(before);
    if (wearer !== null) out.push(...await this.pets.refreshPets(characterId, wearer));
    return out;
  }

  /** The current wire view of one piece. */
  async view(characterId: number, itemId: number): Promise<BagItem> {
    const [view] = await this.inventory.byIds(characterId, [itemId]);
    if (!view) throw RpcException.notFound('Không tìm thấy trang bị.');
    return view;
  }

  /** Plain gold only (never Kim phieu); null when the balance is short. A zero amount charges nothing. */
  async spendGold(characterId: number, amount: number): Promise<GoldCharge | null> {
    if (amount <= 0) return { amount: 0, total: -1 };
    const total = await this.characters.spendMoney(characterId, 'gold', amount);
    return total === null ? null : { amount, total };
  }

  async refundGold(characterId: number, charge: GoldCharge | null): Promise<void> {
    if (charge && charge.amount > 0) await this.characters.addMoney(characterId, 'gold', charge.amount);
  }

  goldPushes(charge: GoldCharge | null): Push[] {
    const update: PlayerUpdate = { gold: charge?.total };
    return charge && charge.amount > 0 ? [push('onUPP', update)] : [];
  }

  /** Units left in the stack `itemId` when it is a stack of `templateId` of the character (0 otherwise). */
  async stackLeft(characterId: number, itemId: number, templateId: number): Promise<number> {
    if (!Number.isInteger(itemId) || itemId <= 0) return 0;
    const row = await this.items.findOne({ _id: itemId, characterId, templateId }, { stackCount: 1 }).lean();
    return row?.stackCount ?? 0;
  }
}
