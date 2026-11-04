// Guild skill passives for the stat aggregator: reads the member row and the guild through models only (no feature services, so
// StatsModule stays cycle-free) and returns the data_tbl_buff templates of the effective skills, merged like active buffs.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { Guild, GuildMemberRow } from '../guild/guild.schema';
import { guildSkillBuffIds } from './guild-skill-buffs';

@Injectable()
export class GuildSkillBonusService {
  constructor(
    @InjectModel(GuildMemberRow.name) private readonly members: Model<GuildMemberRow>,
    @InjectModel(Guild.name) private readonly guilds: Model<Guild>,
    private readonly gameData: GameDataService,
  ) {}

  async buffTemplates(characterId: number): Promise<Row[]> {
    const m = await this.members.findOne({ cid: characterId }, { guildId: 1, skills: 1 }).lean();
    if (!m || !m.skills || m.skills.length === 0) return [];
    const g = await this.guilds.findById(m.guildId, { skills: 1 }).lean();
    if (!g) return [];
    const dev = Object.fromEntries((g.skills ?? []).map((s) => [s.chain, s.level]));
    return guildSkillBuffIds(m.skills, dev, this.gameData.guildSkillChains())
      .map((id) => this.gameData.getBuff(id))
      .filter((t): t is Row => t !== undefined);
  }
}
