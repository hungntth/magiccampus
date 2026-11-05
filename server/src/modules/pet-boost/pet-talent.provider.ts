// Pet stat provider for the character-wide Thien Phu talent bonuses (all contexts); every pet of the owner gets the same bonuses.

import { Injectable } from '@nestjs/common';
import type { Bonuses } from '../character/character-stats';
import { PET_STAT_CONTEXTS, type PetStatContext, type PetStatProvider } from '../pet/pet-stat-provider';
import type { Pet } from '../pet/pet.schema';
import { PetTalentService } from './pet-talent.service';

@Injectable()
export class PetTalentStatProvider implements PetStatProvider {
  readonly key = 'talent';
  readonly contexts: readonly PetStatContext[] = PET_STAT_CONTEXTS;

  constructor(private readonly talent: PetTalentService) {}

  async bonuses(ownerId: number, pets: readonly Pet[]): Promise<Map<number, Bonuses>> {
    const talent = await this.talent.bonuses(ownerId);
    return new Map(pets.map((p) => [p._id, talent]));
  }
}
