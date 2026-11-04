// Resolves what equipment and passive skills add to pets: loads the equipped pet items (character_items, slotType 6) and
// their equipment templates, then hands the pure aggregation (pet-bonus.ts) to the view / battle builders.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SlotType } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { petBonuses, type PetBonusLookups } from './pet-bonus';
import type { Pet } from './pet.schema';
import { skillInfoOf, type PetExtras } from './pet-view';

@Injectable()
export class PetBonusService {
  readonly look: PetBonusLookups;

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
  ) {
    this.look = { skill: (id) => gameData.skill(id), buff: (id) => gameData.getBuff(id) };
  }

  /** Extras of the given pets of one character (one item query and one template query for all of them). */
  async extrasFor(characterId: number, rows: readonly Pet[]): Promise<Map<number, PetExtras>> {
    const ids = [...new Set(rows.flatMap((r) => (r.equ ?? []).filter((v) => v > 0)))];
    const itemRows = ids.length === 0 ? [] : await this.items.find({ _id: { $in: ids }, characterId, slotType: SlotType.PET_EQUIP }, { templateId: 1 }).lean();
    const tplOfItem = new Map(itemRows.map((i) => [i._id, i.templateId]));
    const tpls = await this.gameData.templatesByIds(19, [...new Set(itemRows.map((i) => i.templateId))]);
    const out = new Map<number, PetExtras>();
    for (const r of rows) {
      const equipTpls = (r.equ ?? []).flatMap((id) => {
        const t = tpls.get(tplOfItem.get(id) ?? -1);
        return id > 0 && t ? [t] : [];
      });
      const skills = r.skills ?? [];
      out.set(r._id, { bonuses: petBonuses(equipTpls, skills, this.look), skillInfo: skillInfoOf(skills, this.look) });
    }
    return out;
  }

  async extrasOf(characterId: number, row: Pet): Promise<PetExtras> {
    return (await this.extrasFor(characterId, [row])).get(row._id) ?? {};
  }
}
