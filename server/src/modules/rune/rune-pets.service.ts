// Pet side of the Hồn Khí runes (Go pet_deco_rune.go): the pet page (even holes) is one owner-wide total applied to EVERY pet of the character
// (PetStatProvider 'rune', registered by RuneModule on the PetStatRegistry). `refresh` pushes onRefreshPetProp for each pet after a pet rune changed.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SceneManager } from '../../gateway/scene.manager';
import type { Bonuses } from '../character/character-stats';
import { DECO_FEATURE_KEY, parseDeco } from '../deco/deco-state';
import { GameDataService } from '../gamedata/gamedata.service';
import { PetBonusService } from '../pet/pet-bonus.service';
import { PET_STAT_CONTEXTS, type PetStatContext, type PetStatProvider } from '../pet/pet-stat-provider';
import { Pet } from '../pet/pet.schema';
import { FeatureStoreService } from '../progression/feature-store.service';
import { PET_RUNE_PROPS, runeBonuses, runeTotals } from './rune-stats';

@Injectable()
export class RunePetService implements PetStatProvider {
  readonly key = 'rune';
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
    const state = parseDeco(await this.store.get(ownerId, DECO_FEATURE_KEY, {}));
    const totals = runeTotals(state, 'pet', (id) => this.gameData.decoHole(id), (id) => this.gameData.decoRune(id));
    if (totals.size === 0) return out;
    const b = runeBonuses(totals, PET_RUNE_PROPS);
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
