// Persistence of the pet arena (M12 phase G): the season's entries, the weekly copy of last week's registrations, the daily reset, and the
// per-group positional ladder (Go application/petarena season.go + ladder.go). The ladder is a read-modify-write over a whole group, so
// every writer holds LADDER_KEY (withKeyLock; lock order is always character lock, then ladder lock). Entries are patched field by field.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { arenaGroupOf } from '@mc/shared';
import { Character } from '../character/character.schema';
import { withKeyLock } from '../inventory/char-lock';
import { ARENA_BASE_RATING, ARENA_DAILY_FIGHTS, ARENA_LADDER_LIMIT, ARENA_LIST_LIMIT } from '../pet/pet-depth-constants';
import { applyChallengeWin, orderOf, positionOf, rankChanges, type LadderRow } from './arena-ladder';
import { PetArenaEntry } from './arena-entry.schema';
import { carriedLastRank, previousWeekSeason, resetDaily, weekSeason } from './arena-rules';

const LADDER_KEY = 'petarena:ladder';
const CARRY_LIMIT = 5000;

export interface Member {
  entry: PetArenaEntry;
  name: string;
  level: number;
}

/** One group's ordered ladder: ids best first and the live member rows. */
export interface Ladder {
  group: number;
  order: number[];
  members: Map<number, Member>;
}

export interface LadderMove {
  oldRank: number;
  newRank: number;
  defenderRank: number;
}

const rowOf = (m: Member, group: number): LadderRow => ({
  characterId: m.entry.characterId, rank: m.entry.group === group ? m.entry.ladderRank : 0, createdAt: m.entry.registeredAt, rating: m.entry.rating,
});

@Injectable()
export class ArenaStateService {
  /** Clock, swappable for tests / tools. */
  now: () => number = Date.now;
  private carried = 0;
  private carrying: Promise<void> | null = null;

  constructor(
    @InjectModel(PetArenaEntry.name) private readonly entries: Model<PetArenaEntry>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  season(): number {
    return weekSeason(this.now());
  }

  /** Runs `fn` as the only ladder reader / writer (not reentrant). */
  withLadder<T>(fn: () => Promise<T>): Promise<T> {
    return withKeyLock(LADDER_KEY, fn);
  }

  // --- season ---------------------------------------------------------------------------------------------------------------
  /** The first read of a week copies last week's registrations (name, line-up, last rank); it runs once per process per season. */
  ensureSeason(): Promise<void> {
    const season = this.season();
    if (this.carried === season) return Promise.resolve();
    this.carrying ??= this.carryOver(season).finally(() => {
      this.carrying = null;
    });
    return this.carrying;
  }

  /** Previous entries in last week's ladder order become the new registration order (rating ties all start equal, so it is the tie-break). */
  private async carryOver(season: number): Promise<void> {
    const prev = await this.entries.find({ season: previousWeekSeason(this.now()) }).limit(CARRY_LIMIT).lean();
    prev.sort((a, b) => a.group - b.group || (a.ladderRank || Infinity) - (b.ladderRank || Infinity) || a.registeredAt - b.registeredAt);
    const base = this.now();
    if (prev.length > 0) {
      await this.entries.bulkWrite(prev.map((old, i) => ({
        updateOne: {
          filter: { season, characterId: old.characterId },
          update: {
            $setOnInsert: {
              group: 0, ladderRank: 0, rating: ARENA_BASE_RATING, wins: 0, losses: 0, combo: 0, maxCombo: 0, teamName: old.teamName, conf1: old.conf1 ?? {},
              usedFights: 0, maxFights: ARENA_DAILY_FIGHTS, cooldownEndsAt: 0, fightDay: '', dayStartRank: 0, climbNotified: 0,
              lastRank: old.ladderRank > 0 ? carriedLastRank(old.ladderRank) : -1, registeredAt: base + i,
            },
          },
          upsert: true,
        },
      })));
    }
    this.carried = season;
  }

  // --- entries --------------------------------------------------------------------------------------------------------------
  /** The character's entry of this season with today's reset applied (and saved); null when it has not registered. */
  async entryOf(characterId: number): Promise<PetArenaEntry | null> {
    await this.ensureSeason();
    const entry = await this.entries.findOne({ season: this.season(), characterId }).lean();
    if (!entry) return null;
    if (resetDaily(entry, this.now())) {
      await this.patch(characterId, {
        fightDay: entry.fightDay, usedFights: entry.usedFights, maxFights: entry.maxFights, dayStartRank: entry.dayStartRank, climbNotified: entry.climbNotified,
      });
    }
    return entry;
  }

  /** Sets exactly these fields on the character's entry of this season. */
  async patch(characterId: number, fields: Partial<PetArenaEntry>): Promise<void> {
    await this.entries.updateOne({ season: this.season(), characterId }, { $set: fields });
  }

  async register(characterId: number, fields: Pick<PetArenaEntry, 'teamName' | 'conf1'>): Promise<void> {
    await this.entries.updateOne(
      { season: this.season(), characterId },
      {
        $set: fields,
        $setOnInsert: {
          group: 0, ladderRank: 0, rating: ARENA_BASE_RATING, wins: 0, losses: 0, combo: 0, maxCombo: 0, usedFights: 0, maxFights: ARENA_DAILY_FIGHTS,
          cooldownEndsAt: 0, fightDay: '', dayStartRank: 0, climbNotified: 0, lastRank: -1, registeredAt: this.now(),
        },
      },
      { upsert: true },
    );
  }

  // --- characters -----------------------------------------------------------------------------------------------------------
  async character(characterId: number): Promise<{ name: string; level: number } | null> {
    const c = await this.chars.findOne({ _id: characterId, deleted: false }, { name: 1, level: 1 }).lean();
    return c ? { name: c.name, level: c.level } : null;
  }

  async nameOf(characterId: number): Promise<string> {
    return (await this.character(characterId))?.name ?? String(characterId);
  }

  async groupOf(characterId: number): Promise<number> {
    return arenaGroupOf((await this.character(characterId))?.level ?? 1);
  }

  // --- ladder ---------------------------------------------------------------------------------------------------------------
  /** Reads one group's ladder (seeds / compacts the stored ranks when needed). */
  ladder(group: number): Promise<Ladder> {
    return this.withLadder(() => this.loadLadder(group));
  }

  /** Same without the lock: the caller holds `withLadder`. */
  async loadLadder(group: number): Promise<Ladder> {
    await this.ensureSeason();
    const season = this.season();
    const all = await this.entries.find({ season }).limit(ARENA_LADDER_LIMIT).lean();
    const chars = await this.chars.find({ _id: { $in: all.map((e) => e.characterId) }, deleted: false }, { name: 1, level: 1 }).lean();
    const info = new Map(chars.map((c) => [c._id, c]));
    const members = new Map<number, Member>();
    for (const entry of all) {
      const c = info.get(entry.characterId);
      if (c && arenaGroupOf(c.level) === group) members.set(entry.characterId, { entry, name: c.name, level: c.level });
    }
    const rows = [...members.values()].map((m) => rowOf(m, group));
    const order = orderOf(rows);
    await this.placeRanks(group, order, members);
    return { group, order, members };
  }

  /** Writes the ranks that differ from the positions of `order` (and the group they belong to). */
  private async placeRanks(group: number, order: readonly number[], members: Map<number, Member>): Promise<void> {
    const stored = new Map([...members.values()].map((m) => [m.entry.characterId, m.entry.group === group ? m.entry.ladderRank : 0]));
    const changes = rankChanges(order, stored);
    if (changes.size === 0) return;
    for (const [id, rank] of changes) {
      const entry = members.get(id)!.entry;
      entry.group = group;
      entry.ladderRank = rank;
    }
    await this.entries.bulkWrite([...changes].map(([characterId, rank]) => ({
      updateOne: { filter: { season: this.season(), characterId }, update: { $set: { group, ladderRank: rank } } },
    })));
  }

  /** A won challenge: the attacker takes the defender's place when it was below it. The caller holds the ladder lock and loaded `ladder`. */
  async applyWin(ladder: Ladder, attackerId: number, defenderId: number): Promise<LadderMove> {
    const oldRank = positionOf(ladder.order, attackerId);
    const next = applyChallengeWin(ladder.order, attackerId, defenderId);
    if (next.moved) {
      ladder.order = next.order;
      await this.placeRanks(ladder.group, ladder.order, ladder.members);
    }
    return { oldRank, newRank: positionOf(ladder.order, attackerId), defenderRank: positionOf(ladder.order, defenderId) };
  }

  /** Current places of the two fighters without moving anyone (a lost challenge). */
  standing(ladder: Ladder, attackerId: number, defenderId: number): LadderMove {
    const oldRank = positionOf(ladder.order, attackerId);
    return { oldRank, newRank: oldRank, defenderRank: positionOf(ladder.order, defenderId) };
  }

  /** Last week's final ladders by group "0".."5" (stored ranks, top 50 each) with the character names / levels. */
  async previousLadders(): Promise<Map<number, { entry: PetArenaEntry; name: string; level: number }[]>> {
    const prev = await this.entries.find({ season: previousWeekSeason(this.now()), ladderRank: { $gt: 0 } }).lean();
    const chars = await this.chars.find({ _id: { $in: prev.map((e) => e.characterId) }, deleted: false }, { name: 1, level: 1 }).lean();
    const info = new Map(chars.map((c) => [c._id, c]));
    const out = new Map<number, { entry: PetArenaEntry; name: string; level: number }[]>();
    for (const entry of prev.sort((a, b) => a.ladderRank - b.ladderRank)) {
      const c = info.get(entry.characterId);
      const list = out.get(entry.group) ?? [];
      if (c && list.length < ARENA_LIST_LIMIT) out.set(entry.group, [...list, { entry, name: c.name, level: c.level }]);
    }
    return out;
  }
}
