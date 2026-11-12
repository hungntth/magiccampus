// Pet side of the medals (Go AggregatePetBonuses + handlers/medal/pet_refresh.go): the five worn pet medals (1001..1005) and their engrave line are one
// owner-wide total applied to EVERY pet of the character (PetStatProvider 'medal', registered by MedalModule). `refresh` pushes onRefreshPetProp for each
// pet after a pet slot changed. Pet medals use the pet rune dictionary; combo / Miễn giảm / kháng lines with no pet key add nothing (Go rounded most to 0).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SceneManager } from '../../gateway/scene.manager';
import type { Bonuses } from '../character/character-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import { PetBonusService } from '../pet/pet-bonus.service';
import { PET_STAT_CONTEXTS, type PetStatContext, type PetStatProvider } from '../pet/pet-stat-provider';
import { Pet } from '../pet/pet.schema';
import { FeatureStoreService } from '../progression/feature-store.service';
import { PET_RUNE_PROPS } from '../rune/rune-stats';
import { MEDAL_FEATURE_KEY, parseMedal } from './medal-state';
import { medalBonuses, wornRows } from './medal-stats';

@Injectable()
export class MedalPetService implements PetStatProvider {
  readonly key = 'medal';
  readonly contexts: readonly PetStatContext[] = PET_STAT_CONTEXTS;

  constructor(
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly bonus: PetBonusService,
    private readonly scenes: SceneManager,
  ) {}

  async bonuses(ownerId: number, pets: readonly Pet[]): Promise<Map<number, Bonuses>> {
    const out = new Map<number, Bonuses>();
    if (pets.length === 0) return out;
    const state = parseMedal(await this.store.get(ownerId, MEDAL_FEATURE_KEY, {}));
    const rows = wornRows(state, 'pet', (id) => this.gameData.medal(id), this.gameData.medalLines());
    if (rows.length === 0) return out;
    const b = medalBonuses(rows, PET_RUNE_PROPS);
    for (const p of pets) out.set(p._id, b);
    return out;
  }

  /** onRefreshPetProp for every pet of the character (to its session, when online). */
  async refresh(characterId: number): Promise<void> {
    const session = this.scenes.findByCharacter(characterId);
    if (!session) return;
    for (const row of await this.pets.find({ characterId }).lean()) {
      const tpl = this.gameData.petTemplate(row.tid);
      if (!tpl) continue;
      const p = await this.bonus.refreshPush(characterId, row, tpl);
      session.callback(p.m, ...p.a);
    }
  }
}
