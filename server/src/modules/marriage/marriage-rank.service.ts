// `getCoupleRank(page)` (Flash ActivePanel responder): active marriages by couple intimacy desc then married-at asc, 48 per page,
// `{data: [{maleName, femaleName, type, luxtime, time}], num, start}`. Intimacy = the husband's couple row toward his wife.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RelationType, formatCoupleTime, type CoupleRankReply } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { Relationship } from '../social/relationship.schema';
import { pageRank, sortRank, type RankInput } from './marriage-rules';
import { MarriageStore } from './marriage.store';

@Injectable()
export class MarriageRankService {
  constructor(
    @InjectModel(Relationship.name) private readonly rels: Model<Relationship>,
    private readonly store: MarriageStore,
    private readonly characters: CharacterService,
  ) {}

  async page(page: number): Promise<CoupleRankReply> {
    const list = await this.store.activeList();
    const ids = [...new Set(list.flatMap((m) => [m.maleId, m.femaleId]))];
    const names = new Map((await this.characters.findByIds(ids)).map((c) => [c._id, c.name]));
    const rows = await this.rels.find({ type: RelationType.COUPLE, characterId: { $in: list.map((m) => m.maleId) } }, { characterId: 1, targetId: 1, intimacy: 1 }).lean();
    const intimacy = new Map(rows.map((r) => [`${r.characterId}:${r.targetId}`, r.intimacy ?? 0]));
    const inputs: RankInput[] = list.flatMap((m) => {
      const male = names.get(m.maleId);
      const female = names.get(m.femaleId);
      if (male === undefined || female === undefined) return [];
      return [{
        maleName: male, femaleName: female, type: m.type, intimacy: intimacy.get(`${m.maleId}:${m.femaleId}`) ?? 0,
        marriedAt: m.marriedAt.getTime(), time: formatCoupleTime(m.marriedAt.getTime()),
      }];
    });
    return pageRank(sortRank(inputs), page);
  }
}
