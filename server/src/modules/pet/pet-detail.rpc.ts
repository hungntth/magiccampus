// Pet detail RPCs (M9 phase F, Go handlers/pet/refresh.go): getFinalPraDefPet / finalPraMagDefPet(key, value, cid) read the
// active (battle) pet, never push onRefreshPetProp (Go's loop), and fail when no pet fights. getPetDetailData() is an H5 helper:
// the 26 rates of that pet for the detail panel (Flash never opened the pet variant, so it had no data source).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PetState, type CharDetailData, type FinalRateKey, type FinalRateReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { detailData } from '../character/character-stats';
import { finalRateReply, petRates, rateOf } from '../character/final-rate';
import { PetBonusService } from './pet-bonus.service';
import { Pet } from './pet.schema';

export const NO_ACTIVE_PET = 'Chưa có pet xuất chiến';

@Injectable()
export class PetDetailRpc {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly bonuses: PetBonusService,
  ) {}

  @Rpc('getPetDetailData', { requireCharacter: true })
  async getPetDetailData(session: Session): Promise<CharDetailData> {
    return detailData(await this.activeRates(session.characterId!));
  }

  @Rpc('getFinalPraDefPet', { requireCharacter: true })
  getFinalPraDefPet(session: Session, args: unknown[]): Promise<FinalRateReply | number> {
    return this.finalRate(session, args, 'finalPraDef');
  }

  @Rpc('finalPraMagDefPet', { requireCharacter: true })
  finalPraMagDefPet(session: Session, args: unknown[]): Promise<FinalRateReply | number> {
    return this.finalRate(session, args, 'finalPraMagDef');
  }

  private async finalRate(session: Session, args: unknown[], key: FinalRateKey): Promise<FinalRateReply | number> {
    return finalRateReply(args[0], rateOf(await this.activeRates(session.characterId!), key));
  }

  private async activeRates(characterId: number): Promise<Record<string, number>> {
    const row = await this.pets.findOne({ characterId, state: PetState.BATTLE }).lean();
    if (!row) throw RpcException.forbidden(NO_ACTIVE_PET);
    const extras = await this.bonuses.extrasOf(characterId, row);
    return petRates(extras.bonuses ?? {});
  }
}
