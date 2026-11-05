// Pet stat provider for the Menh Hon ring (all contexts): each pet's ring gems add their current-row prop_val (soul-bonus.ts).

import { Injectable } from '@nestjs/common';
import type { Bonuses } from '../character/character-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import { PET_STAT_CONTEXTS, type PetStatContext, type PetStatProvider } from '../pet/pet-stat-provider';
import type { Pet } from '../pet/pet.schema';
import { soulBonuses } from './soul-bonus';

@Injectable()
export class PetSoulStatProvider implements PetStatProvider {
  readonly key = 'soul';
  readonly contexts: readonly PetStatContext[] = PET_STAT_CONTEXTS;

  constructor(private readonly data: GameDataService) {}

  async bonuses(_ownerId: number, pets: readonly Pet[]): Promise<Map<number, Bonuses>> {
    const out = new Map<number, Bonuses>();
    for (const pet of pets) {
      const gems = Object.values(pet.soul?.data ?? {}).filter((slot) => slot && slot.sid > 0);
      if (gems.length > 0) out.set(pet._id, soulBonuses(gems, (sid) => this.data.petSoul(sid)));
    }
    return out;
  }
}
