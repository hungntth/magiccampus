// Pets from battle (phase D): the free pet slots a catch command checks, and the pet creation for the creatures a character caught
// (Go ContractPet: creature grow_base, unbound, state 3), run at battle settle. Creation takes the character lock itself;
// the returned pushes (onAddPet, or the red "no room" note) go out at that member's battlePlayEnd.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { NO_PET_ROOM, PetService } from './pet.service';
import { Pet } from './pet.schema';

@Injectable()
export class PetCatchService {
  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly petService: PetService,
    private readonly achievements: AchievementEvents,
  ) {}

  /** Free pet slots right now (petMaxNum - owned); the caller subtracts the pets it already caught in the same battle. */
  async room(characterId: number): Promise<number> {
    const [max, count] = await Promise.all([this.petService.petMaxNum(characterId), this.pets.countDocuments({ characterId })]);
    return max - count;
  }

  /** Creates one pet per caught creature id, in order; a full pet bag turns the pet into a red note (the creature is gone). */
  contract(characterId: number, creatureIds: readonly number[]): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const pushes: Push[] = [];
      for (const id of creatureIds) {
        const wrapper = await this.petService.award(characterId, id);
        pushes.push(wrapper ? push('onAddPet', wrapper) : push('onRedMsg', NO_PET_ROOM));
        if (wrapper) this.achievements.record(characterId, 'petCaught');
      }
      return pushes;
    });
  }
}
