// Builds the whitelisted `showChaInfo` view of an online character: identity, level, equipped items, final stats.
// Money, gold, position and everything else the legacy DTO leaked stay out.

import { Injectable } from '@nestjs/common';
import type { ChaInfo } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { InventoryService } from '../inventory/inventory.service';
import { GuildViewService } from '../guild/guild-view.service';
import { CharacterStatsService } from '../stats/character-stats.service';

@Injectable()
export class ChaInfoService {
  constructor(
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly stats: CharacterStatsService,
    private readonly guilds: GuildViewService,
  ) {}

  async build(characterId: number): Promise<ChaInfo> {
    const doc = await this.characters.getById(characterId);
    const [equiptList, st] = await Promise.all([this.inventory.equipped(characterId), this.stats.compute(characterId)]);
    return {
      id: doc._id,
      name: doc.name,
      classId: doc.classId,
      gender: doc.gender,
      level: doc.level,
      iconCode: this.characters.iconCode(doc.classId, doc.gender),
      equiptList,
      property: st.property,
      guild: await this.guilds.guildNameOf(characterId),
    };
  }
}
