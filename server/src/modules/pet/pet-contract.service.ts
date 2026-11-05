// M12 Khe Uoc (Go application/petcontract): contractPet / contractPetTen / ensureBuyContractPet. The state lives on
// Character.contractPet {hp, hpExp, speed, ...}. Order: validate and plan with the pure loop, then spend gold, then stones
// (a failed stone take refunds the gold), then save the new level / exp. A level up refreshes the evolved battle pet.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PET_CONTRACT_MAX_LEVEL, PET_CONTRACT_STONE_ITEM, type PetContractReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PetBonusService } from './pet-bonus.service';
import { contractTrack, runContract } from './pet-contract-rules';
import { CONTRACT_TEN_ATTEMPTS } from './pet-depth-constants';
import { PetMaterialService } from './pet-materials.service';

/** `one` = contractPet (confirms gold first), `ten` = contractPetTen, `ensure` = ensureBuyContractPet (the client confirmed). */
export type ContractMode = 'one' | 'ten' | 'ensure';
export type ContractOutcome =
  | { kind: 'confirm'; money: number }
  | { kind: 'done'; reply: PetContractReply; pushes: Push[] };

const REFUSALS = { stones: 'Không đủ Đá Khế Ước', gold: 'Vàng không đủ', missingRow: 'Thiếu dữ liệu cấp khế ước' } as const;

@Injectable()
export class PetContractService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly data: GameDataService,
    private readonly mats: PetMaterialService,
    private readonly bonuses: PetBonusService,
  ) {}

  run(characterId: number, type: number, autoBuy: boolean, mode: ContractMode): Promise<ContractOutcome> {
    return withCharLock(characterId, async () => {
      const char = await this.chars.findById(characterId, { contractPet: 1, gold: 1 }).lean();
      if (!char) throw RpcException.notFound('character not found');
      const track = contractTrack(char.contractPet ?? {}, type);
      if (!track) throw RpcException.invalidArgs('type');
      if (track.level >= PET_CONTRACT_MAX_LEVEL) throw RpcException.forbidden('Đã đạt cấp cao nhất, không thể tăng tiếp');
      const plan = runContract({
        level: track.level, exp: track.exp, stones: await this.mats.countTemplate(characterId, PET_CONTRACT_STONE_ITEM), gold: char.gold ?? 0,
        autoBuy: mode === 'ensure' || autoBuy, confirmGold: mode === 'one', attempts: mode === 'ten' ? CONTRACT_TEN_ATTEMPTS : 1,
        rowOf: (lv) => this.data.petContract(lv), roll: () => Math.floor(Math.random() * 100),
      });
      if (plan.needGold > 0) return { kind: 'confirm', money: plan.needGold };
      if (plan.refusal) throw RpcException.forbidden(REFUSALS[plan.refusal]);

      const pushes: Push[] = [];
      if (plan.goldSpent > 0) {
        const paid = await this.chars.findOneAndUpdate(
          { _id: characterId, gold: { $gte: plan.goldSpent } }, { $inc: { gold: -plan.goldSpent } }, { new: true, projection: { gold: 1 } },
        ).lean();
        if (!paid) throw RpcException.forbidden(REFUSALS.gold);
        pushes.push(push('onUPP', { gold: paid.gold ?? 0 }));
      }
      if (plan.stonesUsed > 0) {
        try {
          pushes.unshift(...await this.mats.consumeTemplate(characterId, PET_CONTRACT_STONE_ITEM, plan.stonesUsed));
        } catch (e) {
          if (plan.goldSpent > 0) await this.chars.updateOne({ _id: characterId }, { $inc: { gold: plan.goldSpent } });
          throw e;
        }
      }
      await this.chars.updateOne({ _id: characterId }, { $set: { [`contractPet.${track.key}`]: plan.level, [`contractPet.${track.key}Exp`]: plan.exp } });
      if (plan.leveled) pushes.push(...await this.bonuses.battlePetPushes(characterId, true));
      return { kind: 'done', reply: { type, newLvl: plan.level, newExp: plan.exp }, pushes };
    });
  }
}
