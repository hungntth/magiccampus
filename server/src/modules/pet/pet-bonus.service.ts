// Resolves what equipment, passive skills and registered feature providers add to pets: loads the equipped pet items
// (character_items, slotType 6) and their equipment templates, then hands the pure aggregation (pet-bonus.ts) to the view /
// battle builders. Feature sources (talent, ...) come from PetStatRegistry per stat context (panel by default).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PetState, SlotType } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { petBonuses, type PetBonusLookups } from './pet-bonus';
import { petGearBonuses, type PetGearEntry } from './pet-gear-stats';
import type { PetStatContext } from './pet-stat-provider';
import { PetStatRegistry } from './pet-stat-registry.service';
import { Pet } from './pet.schema';
import { push, type Push } from '../inventory/pushes';
import type { PetTemplate } from '../gamedata/pet-data';
import { propertyOfPet, skillInfoOf, type PetExtras } from './pet-view';

@Injectable()
export class PetBonusService {
  readonly look: PetBonusLookups;

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Pet.name) private readonly pets: Model<Pet>,
    private readonly gameData: GameDataService,
    private readonly registry: PetStatRegistry,
  ) {
    this.look = { skill: (id) => gameData.skill(id), buff: (id) => gameData.getBuff(id) };
  }

  /** Extras of the given pets of one character (one item query and one template query for all of them). */
  async extrasFor(characterId: number, rows: readonly Pet[], ctx: PetStatContext = 'panel'): Promise<Map<number, PetExtras>> {
    const ids = [...new Set(rows.flatMap((r) => (r.equ ?? []).filter((v) => v > 0)))];
    const itemRows = ids.length === 0 ? [] : await this.items.find(
      { _id: { $in: ids }, characterId, slotType: SlotType.PET_EQUIP }, { templateId: 1, isBound: 1, colorCode: 1, star: 1, properties: 1 },
    ).lean();
    const rowOfItem = new Map(itemRows.map((i) => [i._id, i]));
    const tpls = await this.gameData.templatesByIds(19, [...new Set(itemRows.map((i) => i.templateId))]);
    const feature = await this.registry.collect(characterId, rows, ctx);
    const out = new Map<number, PetExtras>();
    for (const r of rows) {
      const gear = (r.equ ?? []).flatMap((id): PetGearEntry[] => {
        const item = rowOfItem.get(id);
        const tpl = item ? tpls.get(item.templateId) : undefined;
        return id > 0 && item && tpl
          ? [{ tpl, bound: item.isBound === true, colorCode: item.colorCode ?? 0, star: item.star ?? 0, props: item.properties ?? {} }]
          : [];
      });
      const skills = r.skills ?? [];
      const f = feature.get(r._id);
      out.set(r._id, {
        bonuses: { ...petBonuses([], skills, this.look), gear: petGearBonuses(gear, (level) => this.gameData.sublimeRow(true, level)), ...(f ? { feature: f } : {}) },
        skillInfo: skillInfoOf(skills, this.look),
      });
    }
    return out;
  }

  async extrasOf(characterId: number, row: Pet, ctx: PetStatContext = 'panel'): Promise<PetExtras> {
    return (await this.extrasFor(characterId, [row], ctx)).get(row._id) ?? {};
  }

  /** The onRefreshPetProp push for `row` with its current gear / passive / provider bonuses. */
  async refreshPush(characterId: number, row: Pet, tpl: PetTemplate, ctx: PetStatContext = 'panel'): Promise<Push> {
    return push('onRefreshPetProp', row._id, propertyOfPet(row, tpl, (await this.extrasOf(characterId, row, ctx)).bonuses));
  }

  /** onRefreshPetProp for the character's battle pet(s) (state 1), optionally only evolved ones: a character-wide feature changed. */
  async battlePetPushes(characterId: number, evolvedOnly = false): Promise<Push[]> {
    const rows = await this.pets.find({ characterId, state: PetState.BATTLE }).lean();
    const out: Push[] = [];
    for (const row of rows) {
      const tpl = this.gameData.petTemplate(row.tid);
      if (tpl && (!evolvedOnly || row.envoInfo?.envo)) out.push(await this.refreshPush(characterId, row, tpl));
    }
    return out;
  }
}
