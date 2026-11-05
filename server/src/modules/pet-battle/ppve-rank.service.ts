// PPVE leaderboard (Go player.get_ppve_rank): an aggregate over character_features `pet_pve` rows with ppvefloor > 0, ordered by floor
// descending (ties by character id ascending), top 50 joined with the character name / class / level; `myRank` is the caller's 0-based
// position over the whole set, -1 when it has no cleared floor.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PPVE_RANK_LIMIT, type PPVERank, type PPVERankRow } from '@mc/shared';
import { Character } from '../character/character.schema';
import { CharacterFeature } from '../progression/feature.schema';
import { PPVE_FEATURE } from './ppve-rules';

/** Rank rows in order; pure so the tie rule is tested. */
export function rankRows(
  rows: readonly { characterId: number; floor: number }[], limit = PPVE_RANK_LIMIT,
): { characterId: number; floor: number }[] {
  return rows
    .filter((r) => r.floor > 0)
    .sort((a, b) => b.floor - a.floor || a.characterId - b.characterId)
    .slice(0, limit);
}

/** 0-based position of a character among the rows with the same ordering, -1 when it has no cleared floor. */
export function myRankOf(rows: readonly { characterId: number; floor: number }[], characterId: number): number {
  const mine = rows.find((r) => r.characterId === characterId);
  if (!mine || mine.floor <= 0) return -1;
  return rows.filter((r) => r.floor > mine.floor || (r.floor === mine.floor && r.characterId < characterId)).length;
}

@Injectable()
export class PpveRankService {
  constructor(
    @InjectModel(CharacterFeature.name) private readonly features: Model<CharacterFeature>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  async rank(characterId: number): Promise<PPVERank> {
    const docs = await this.features.find({ featureKey: PPVE_FEATURE, 'state.ppvefloor': { $gt: 0 } }, { characterId: 1, 'state.ppvefloor': 1 }).lean();
    const all = docs.map((d) => ({ characterId: d.characterId, floor: Math.trunc(Number(d.state?.ppvefloor ?? 0)) }));
    const top = rankRows(all);
    const people = await this.chars.find({ _id: { $in: top.map((r) => r.characterId) } }, { name: 1, classId: 1, level: 1 }).lean();
    const byId = new Map(people.map((p) => [p._id, p]));
    const rankList: PPVERankRow[] = top.flatMap((r) => {
      const p = byId.get(r.characterId);
      return p ? [{ cid: String(p._id), name: p.name, classId: String(p.classId), level: p.level, floorNum: r.floor }] : [];
    });
    return { rankList, myRank: myRankOf(all, characterId) };
  }
}
