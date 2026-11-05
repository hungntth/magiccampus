// Pet stat provider of the Khac Van carve runes: contexts arena and ppve only (PET_PVE_PANEL[45]: the bonus never shows on the pet panel
// or in normal battles). Every pet of the owner gets the same bonus, read from the `pet_pve` feature state.

import { Injectable } from '@nestjs/common';
import type { Bonuses } from '../character/character-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import type { PetStatContext, PetStatProvider } from '../pet/pet-stat-provider';
import type { Pet } from '../pet/pet.schema';
import { FeatureStoreService } from '../progression/feature-store.service';
import { carveBonuses, hasCarveBonus } from './ppve-carve';
import { normalizePpve, PPVE_FEATURE } from './ppve-rules';

@Injectable()
export class PpveCarveStatProvider implements PetStatProvider {
  readonly key = 'carve';
  readonly contexts: readonly PetStatContext[] = ['arena', 'ppve'];

  constructor(
    private readonly features: FeatureStoreService,
    private readonly data: GameDataService,
  ) {}

  async bonuses(ownerId: number, pets: readonly Pet[]): Promise<Map<number, Bonuses>> {
    const state = normalizePpve(await this.features.get(ownerId, PPVE_FEATURE, {}));
    const b = carveBonuses(state, (id) => this.data.carve(id), (mlv) => this.data.carveMaster(mlv));
    return hasCarveBonus(b) ? new Map(pets.map((p) => [p._id, b])) : new Map();
  }
}
