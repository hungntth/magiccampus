// petOpenSlot: +1 pet bag slot (petMaxNum, cap 180) for the gold price of item 326 (20), goldBind first.
// Gold is charged before the slot is credited. Push: onUPP {goldBind|gold, petMaxNum} + the "Mất N ..." message.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PET_SLOT_GOLD, PET_SLOT_ITEM, PetLimits } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import type { Push } from '../inventory/pushes';
import { PetGoldService } from './pet-gold.service';

@Injectable()
export class PetSlotService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly gold: PetGoldService,
  ) {}

  openSlot(characterId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const doc = await this.chars.findById(characterId, { petMaxNum: 1 }).lean();
      if (!doc) throw RpcException.notFound('character not found');
      const cur = doc.petMaxNum ?? PetLimits.defaultSlots;
      if (cur >= PetLimits.maxSlots) throw RpcException.forbidden('Số ô pet đã đạt tối đa');
      const tpl = await this.gameData.template(29, PET_SLOT_ITEM);
      const cost = Number(tpl?.gold ?? 0) > 0 ? Number(tpl?.gold) : PET_SLOT_GOLD;
      const paid = await this.gold.spend(characterId, cost);
      if (!paid) throw RpcException.forbidden('Không đủ vàng để mở thêm ô pet');
      const r = await this.chars.updateOne({ _id: characterId }, { $set: { petMaxNum: cur + 1 } });
      if (r.matchedCount !== 1) {
        await this.gold.refund(characterId, paid);
        throw RpcException.notFound('character not found');
      }
      return this.gold.pushes(paid, { petMaxNum: cur + 1 });
    });
  }
}
