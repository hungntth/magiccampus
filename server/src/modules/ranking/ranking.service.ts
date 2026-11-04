// Ranking service (M6 phase D): top lists computed on request over non-deleted characters, cached 5 minutes per category.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { RANK_CACHE_MS, type RankCategory, type RankGetReply } from '@mc/shared';
import { AchievementState } from '../achievement/achievement.schema';
import { Character } from '../character/character.schema';
import { Guild, GuildMemberRow } from '../guild/guild.schema';
import { RankCache, emptyReply, isLive, toRows, topChars, type RankChar } from './rank-rules';

@Injectable()
export class RankingService {
  private readonly cache = new RankCache(RANK_CACHE_MS);

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(Guild.name) private readonly guilds: Model<Guild>,
    @InjectModel(GuildMemberRow.name) private readonly members: Model<GuildMemberRow>,
    @InjectModel(AchievementState.name) private readonly achievements: Model<AchievementState>,
  ) {}

  rankGet(category: RankCategory): Promise<RankGetReply> {
    if (!isLive(category)) return Promise.resolve(emptyReply(category));
    return this.cache.get(category, () => this.compute(category));
  }

  private async compute(category: RankCategory): Promise<RankGetReply> {
    const docs = await this.chars
      .find({ deleted: { $ne: true } }, { name: 1, level: 1, exp: 1, money: 1, moneyBind: 1 })
      .lean();
    const points = new Map(
      (await this.achievements.find({ achPoint: { $gt: 0 } }, { achPoint: 1 }).lean()).map((a) => [a._id, a.achPoint]),
    );
    const all: RankChar[] = docs.map((d) => ({
      id: d._id, name: d.name, level: d.level ?? 1, exp: d.exp ?? 0, money: d.money ?? 0, moneyBind: d.moneyBind ?? 0,
      achPoint: points.get(d._id) ?? 0,
    }));
    const picked = topChars(category, all);
    const memberRows = await this.members.find({ cid: { $in: picked.map((c) => c.id) } }, { cid: 1, guildId: 1 }).lean();
    const guildIds = [...new Set(memberRows.map((m) => m.guildId))];
    const guildRows = await this.guilds.find({ _id: { $in: guildIds } }, { name: 1 }).lean();
    const nameOfGuild = new Map(guildRows.map((g) => [g._id, g.name]));
    const guildOf = new Map<number, string>();
    for (const m of memberRows) {
      const name = nameOfGuild.get(m.guildId);
      if (name) guildOf.set(m.cid, name);
    }
    return { name: category, data: toRows(category, picked, guildOf) };
  }
}
