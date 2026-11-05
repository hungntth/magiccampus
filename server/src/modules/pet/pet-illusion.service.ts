// M12 Ao Hoa (Go application/pet/illusion.go): petEat(main, sub, luckStone, luckNum, aptType) rolls an illusion value into the
// main pet's pending slot (sub pet and luck stones are consumed whether it succeeds or not); ensurePetEat applies it to
// aptIllusion[type]. Validation first, then stones, then the sub pet, then the pending credit. Refusals charge nothing.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PET_EAT_LUCK_PROP_TYPE, petEatBaseRate, petEatRate, type PetGrowthReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { PetBonusService } from './pet-bonus.service';
import { APT_ATTR, APT_KEYS, aptName } from './pet-growth-rules';
import { EAT_MSG, eatBlocker, eatFailMsg, eatIllusionValue, eatPetOf, eatSuccessMsg, luckColorBlocker } from './pet-illusion-rules';
import { PetMaterialService } from './pet-materials.service';
import { loadOwnedPet } from './pet-owned';
import { sheetAptitudes } from './pet-view';
import { Pet } from './pet.schema';

export interface IllusionResult { reply: PetGrowthReply; pushes: Push[]; }

@Injectable()
export class PetIllusionService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly data: GameDataService,
    private readonly inventory: InventoryService,
    private readonly bonuses: PetBonusService,
    private readonly mats: PetMaterialService,
  ) {}

  /** Injectable for tests; the pure rolls take it as an argument. */
  rng: () => number = Math.random;

  eat(characterId: number, mainId: number, subId: number, luckItemId: number | null, luckNum: number, aptType: number): Promise<IllusionResult> {
    const key = APT_KEYS[aptType - 1];
    if (!key) throw RpcException.forbidden(EAT_MSG.aptType);
    if (mainId === subId) throw RpcException.forbidden(EAT_MSG.default);
    return withCharLock(characterId, async () => {
      const { row: main, tpl: mainTpl } = await loadOwnedPet(this.pets, this.data, characterId, mainId);
      const { row: sub, tpl: subTpl } = await loadOwnedPet(this.pets, this.data, characterId, subId);
      const why = eatBlocker(main, sub, await this.mats.busyPetIds(characterId));
      if (why) throw RpcException.forbidden(why);

      let luckWanted = 0;
      let luckStoneId = 0;
      if (luckItemId && luckNum > 0) {
        const stone = await this.mats.material(characterId, luckItemId, PET_EAT_LUCK_PROP_TYPE).catch(() => { throw RpcException.forbidden(EAT_MSG.luck); });
        const colorWhy = luckColorBlocker(sub, Number(stone.tpl.color ?? 0));
        if (colorWhy) throw RpcException.forbidden(colorWhy);
        luckWanted = Math.min(Math.trunc(luckNum), stone.count);
        luckStoneId = luckItemId;
      }
      const { rate, luck } = petEatRate(petEatBaseRate(eatPetOf(main, mainTpl), eatPetOf(sub, subTpl)), luckWanted);
      const success = this.rng() * 100 < rate;

      // Spend: the stones, then the sub pet; the previous pending result is dropped either way.
      const pushes: Push[] = [push('onDelPet', subId)];
      if (luck > 0 && luckStoneId > 0) {
        const took = await this.inventory.consumeStack(characterId, luckStoneId, luck);
        if (!took) throw RpcException.forbidden(EAT_MSG.luck);
        pushes.push(...await this.mats.stackPushes(characterId, luckStoneId, took));
      }
      await this.pets.deleteOne({ _id: subId, characterId });
      let pending: { key: string; value: number } | null = null;
      if (success) {
        const apt = sheetAptitudes(sub, subTpl);
        pending = { key, value: eatIllusionValue(apt.base[APT_ATTR[key]] + apt.evolution[APT_ATTR[key]], sub.growRate, this.rng) };
      }
      await this.pets.updateOne({ _id: mainId, characterId }, { $set: { illusionPending: pending } });

      const reply: PetGrowthReply = { msg: success ? eatSuccessMsg(rate) : eatFailMsg(rate), costPet: true, costItem: luck };
      if (pending) Object.assign(reply, { isHint: true, petId: mainId, aptType, value: (main.aptEx?.[key] ?? 0) + pending.value });
      return { reply, pushes };
    });
  }

  /** ensurePetEat: applies the pending illusion (replacing the old value of that type) and refreshes the sheet. */
  ensureEat(characterId: number, petId: number): Promise<IllusionResult> {
    return withCharLock(characterId, async () => {
      const { row, tpl } = await loadOwnedPet(this.pets, this.data, characterId, petId);
      const pending = row.illusionPending;
      const key = APT_KEYS.find((k) => k === pending?.key);
      if (!pending || !key) throw RpcException.forbidden(EAT_MSG.noPending);
      const next = { ...row, aptIllusion: { ...row.aptIllusion, [key]: pending.value }, illusionPending: null };
      await this.pets.updateOne({ _id: petId, characterId }, { $set: { [`aptIllusion.${key}`]: pending.value, illusionPending: null } });
      const value = (row.aptEx?.[key] ?? 0) + pending.value;
      const prop = `${aptName(key)}Ex`;
      return {
        reply: { succ: true, propName: prop, value, msg: EAT_MSG.applied },
        pushes: [push('onUpdatePet', petId, prop, value), await this.bonuses.refreshPush(characterId, next, tpl)],
      };
    });
  }
}
