// Stat providers migrated out of CharacterStatsService (M7 foundation, no behaviour change): equipped gear, active long buffs
// and guild skill passives (the latter ride the buff pipeline, like before).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MW, SlotType, WING_KIND, parseQilingLines, parseWing, qilingEligibleSlot } from '@mc/shared';
import { isActive } from '../buff/buff-mapping';
import { buffBonuses } from '../buff/buff-stats';
import { CharacterBuff } from '../buff/buff.schema';
import { mergeBonuses, type Bonuses } from '../character/character-stats';
import { wornSublimeLines } from '../forge/equip-sublime-rules';
import { qilingBonusOf } from '../forge/qiling-rules';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { equipBonusesOf, gemLinesOf, gemTemplateIds } from '../inventory/equip-stats';
import { wingBonusOf } from '../inventory/wing-stats';
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
    const isWing = (e: { templateId: number }): boolean => Number(tpls.get(e.templateId)?.kind) === WING_KIND;
    const feathers = await this.gameData.templatesByIds(29, [...new Set(equipped.filter(isWing).flatMap((e) => parseWing(e.properties?.wing).holes.filter((t) => t > 0)))]);
    const total = equipBonusesOf(equipped.flatMap((e) => {
      const tpl = tpls.get(e.templateId);
      // t1..t10 of a magic weapon hold skill ids, never gems; wing feathers live in properties.wing.
      const mw = Number(tpl?.kind) === MW.KIND;
      const sublime = tpl ? wornSublimeLines(e.properties, Number(tpl.position), (lv) => this.gameData.sublimeRow(false, lv)) : [];
      return tpl ? [{ tpl, props: e.properties, star: e.star, gems: mw ? [] : gemLinesOf(e.properties, gems), sublime }] : [];
    }));
    // Wing level bonus and character feathers (odd holes) on top of the normal lines.
    for (const e of equipped.filter(isWing)) {
      const tpl = tpls.get(e.templateId);
      if (tpl) mergeBonuses(total, wingBonusOf({ tpl, props: e.properties, star: e.star, wing: e.properties?.wing }, feathers));
    }
    // Ky Linh lines of every worn piece above level 150 (kind 1-4), scaled by the set bonus of the full lines (QILING_PANEL[15-20]).
    const qiling = equipped.flatMap((e) => {
      const tpl = tpls.get(e.templateId);
      if (!tpl || qilingEligibleSlot(Number(tpl.kind), Number(tpl.type), Number(tpl.req_level)) < 0) return [];
      const lines = parseQilingLines(e.properties?.qiling);
      return lines.length > 0 ? [lines] : [];
    });
    mergeBonuses(total, qilingBonusOf(qiling));
    return total;
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
