// Pet side of the wing feathers (legacy PetWingBonuses): the feathers of the EVEN holes of the worn wing feed every pet of the wearer
// (PetStatProvider 'wing', registered by WingModule on the PetStatRegistry), and `refresh` pushes onRefreshPetProp for each pet after a wing
// was equipped / removed or its feathers changed.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, parseWing } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Bonuses } from '../character/character-stats';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { petFeatherBonuses } from '../inventory/wing-stats';
import { PetBonusService } from '../pet/pet-bonus.service';
import type { PetStatContext, PetStatProvider } from '../pet/pet-stat-provider';
import { Pet } from '../pet/pet.schema';

@Injectable()
export class WingPetService implements PetStatProvider {
  readonly key = 'wing';
  readonly contexts: readonly PetStatContext[] = ['panel', 'battle', 'arena', 'ppve'];

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly gameData: GameDataService,
    private readonly bonus: PetBonusService,
    private readonly scenes: SceneManager,
  ) {}

  async bonuses(ownerId: number, pets: readonly Pet[]): Promise<Map<number, Bonuses>> {
    const out = new Map<number, Bonuses>();
    if (pets.length === 0) return out;
    const wing = await this.items.findOne({ characterId: ownerId, slotType: SlotType.EQUIP, slotIndex: 21, itemType: ItemKind.EQUIP }, { properties: 1 }).lean();
    const holes = parseWing(wing?.properties?.wing).holes.filter((tid, i) => i % 2 === 1 && tid > 0);
    if (!wing || holes.length === 0) return out;
    const feathers = await this.gameData.templatesByIds(29, [...new Set(holes)]);
    const b = petFeatherBonuses(wing.properties?.wing, feathers);
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
