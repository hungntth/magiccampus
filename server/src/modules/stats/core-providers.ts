// Stat providers migrated out of CharacterStatsService (M7 foundation, no behaviour change): equipped gear, active long buffs
// and guild skill passives (the latter ride the buff pipeline, like before).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MW, SlotType } from '@mc/shared';
import { isActive } from '../buff/buff-mapping';
import { buffBonuses } from '../buff/buff-stats';
import { CharacterBuff } from '../buff/buff.schema';
import type { Bonuses } from '../character/character-stats';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { equipBonusesOf, gemLinesOf, gemTemplateIds } from '../inventory/equip-stats';
import { GuildSkillBonusService } from './guild-skill-bonus.service';
import type { StatBonusProvider } from './stat-provider';

@Injectable()
export class GearBonusProvider implements StatBonusProvider {
  readonly key = 'gear';

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
  ) {}

  async bonuses(characterId: number): Promise<Bonuses> {
    const equipped = await this.items.find({ characterId, slotType: SlotType.EQUIP }).lean();
    const tpls = await this.gameData.templatesByIds(19, [...new Set(equipped.map((e) => e.templateId))]);
    const gems = await this.gameData.templatesByIds(29, [...new Set(equipped.flatMap((e) => gemTemplateIds(e.properties)))]);
    return equipBonusesOf(equipped.flatMap((e) => {
      const tpl = tpls.get(e.templateId);
      // t1..t10 of a magic weapon hold skill ids, never gems.
      const mw = Number(tpl?.kind) === MW.KIND;
      return tpl ? [{ tpl, props: e.properties, star: e.star, gems: mw ? [] : gemLinesOf(e.properties, gems) }] : [];
    }));
  }
}

@Injectable()
export class BuffBonusProvider implements StatBonusProvider {
  readonly key = 'buffs';

  constructor(
    @InjectModel(CharacterBuff.name) private readonly buffs: Model<CharacterBuff>,
    private readonly gameData: GameDataService,
  ) {}

  async bonuses(characterId: number): Promise<Bonuses> {
    const now = Date.now();
    const active = (await this.buffs.find({ characterId }).lean()).filter((b) => isActive(b, now));
    return buffBonuses(active.map((b) => this.gameData.getBuff(b.buffId)).filter((t): t is Row => t !== undefined));
  }
}

@Injectable()
export class GuildSkillBonusProvider implements StatBonusProvider {
  readonly key = 'guildSkills';

  constructor(private readonly guildSkills: GuildSkillBonusService) {}

  async bonuses(characterId: number): Promise<Bonuses> {
    return buffBonuses(await this.guildSkills.buffTemplates(characterId));
  }
}
