// Holder of the registered pet stat providers (see pet-stat-provider.ts). Exported by PetModule; feature modules inject it
// and call register() from onModuleInit, which keeps the dependency pointing at PetModule and never back.

import { Inject, Injectable } from '@nestjs/common';
import type { Bonuses } from '../character/character-stats';
import { collectPetBonuses, PET_STAT_BONUS_PROVIDERS, type PetStatContext, type PetStatProvider } from './pet-stat-provider';
import type { Pet } from './pet.schema';

@Injectable()
export class PetStatRegistry {
  constructor(@Inject(PET_STAT_BONUS_PROVIDERS) private readonly providers: PetStatProvider[]) {}

  /** Adds a provider once (a second registration under the same key is ignored). */
  register(provider: PetStatProvider): void {
    if (!this.providers.some((p) => p.key === provider.key)) this.providers.push(provider);
  }

  keys(): string[] {
    return this.providers.map((p) => p.key);
  }

  collect(ownerId: number, pets: readonly Pet[], ctx: PetStatContext): Promise<Map<number, Bonuses>> {
    return collectPetBonuses(this.providers, ownerId, pets, ctx);
  }
}
