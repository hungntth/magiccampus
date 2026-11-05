// Pet arena collections (M12 phase G): `pet_arena_entries` (one row per season = ISO week and character: line-up, rating, ladder rank,
// daily turns, cooldown) and `pet_arena_rewards` (the once-per-season rank award claim). Legacy: Go player.pet_arena_entries / _rewards.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { PetArenaConf } from '@mc/shared';
import type { ArenaDaily, ArenaScore } from './arena-rules';

@Schema({ collection: 'pet_arena_entries', timestamps: { createdAt: false, updatedAt: 'updatedAt' } })
export class PetArenaEntry implements ArenaDaily, ArenaScore {
  @Prop({ type: Number, required: true })
  season: number;

  @Prop({ type: Number, required: true })
  characterId: number;

  /** Level group the stored `ladderRank` belongs to (a level-up into another group makes the rank stale). */
  @Prop({ type: Number, default: 0 })
  group: number;

  /** 1-based position in the group ladder, 0 = not placed yet. */
  @Prop({ type: Number, default: 0 })
  ladderRank: number;

  @Prop({ type: Number, default: 1000 })
  rating: number;

  @Prop({ type: Number, default: 0 })
  wins: number;

  @Prop({ type: Number, default: 0 })
  losses: number;

  /** Current win streak and the weekly best ("Thang lien tuc cao nhat tuan nay"). */
  @Prop({ type: Number, default: 0 })
  combo: number;

  @Prop({ type: Number, default: 0 })
  maxCombo: number;

  /** Team name; "nl" / "" = not set (the owner's name is shown). */
  @Prop({ type: String, default: '' })
  teamName: string;

  @Prop({ type: Object, default: {} })
  conf1: PetArenaConf;

  @Prop({ type: Number, default: 0 })
  usedFights: number;

  @Prop({ type: Number, default: 20 })
  maxFights: number;

  @Prop({ type: Number, default: 0 })
  cooldownEndsAt: number;

  @Prop({ type: String, default: '' })
  fightDay: string;

  @Prop({ type: Number, default: 0 })
  dayStartRank: number;

  @Prop({ type: Number, default: 0 })
  climbNotified: number;

  /** Last week's 0-based rank (-1 = unranked or past 200): the base of getPetRankAward. */
  @Prop({ type: Number, default: -1 })
  lastRank: number;

  /** Registration time (ms); orders unplaced rows and breaks rating ties. */
  @Prop({ type: Number, default: 0 })
  registeredAt: number;
}

export type PetArenaEntryDocument = HydratedDocument<PetArenaEntry>;
export const PetArenaEntrySchema = SchemaFactory.createForClass(PetArenaEntry);
PetArenaEntrySchema.index({ season: 1, characterId: 1 }, { unique: true });

@Schema({ collection: 'pet_arena_rewards', timestamps: { createdAt: 'claimedAt', updatedAt: false } })
export class PetArenaReward {
  /** The season whose final rank was paid (the week before the claim). */
  @Prop({ type: Number, required: true })
  season: number;

  @Prop({ type: Number, required: true })
  characterId: number;

  /** 1-based rank paid and the points credited. */
  @Prop({ type: Number, default: 0 })
  rank: number;

  @Prop({ type: Number, default: 0 })
  points: number;
}

export type PetArenaRewardDocument = HydratedDocument<PetArenaReward>;
export const PetArenaRewardSchema = SchemaFactory.createForClass(PetArenaReward);
PetArenaRewardSchema.index({ season: 1, characterId: 1 }, { unique: true });
