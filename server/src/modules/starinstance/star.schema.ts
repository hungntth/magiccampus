// Star instance state, one document per character (collection character_star_instance; Go feature state 'star_instance'): the best
// score per palace level, today's attempts and the running task sweep. Every write compares and bumps `rev` (StarStateService).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { SweepRun } from '@mc/shared';

@Schema({ collection: 'character_star_instance', timestamps: true, minimize: false })
export class CharacterStarInstance {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: Object, default: {} })
  scores: Record<string, Record<string, number>>;

  @Prop({ type: Number, default: 5 })
  dailyMax: number;

  @Prop({ type: Number, default: 0 })
  dailyUsed: number;

  @Prop({ type: String, default: '' })
  day: string;

  @Prop({ type: Object, default: null })
  sweep: SweepRun | null;

  @Prop({ type: Number, default: 0 })
  rev: number;
}

export const CharacterStarInstanceSchema = SchemaFactory.createForClass(CharacterStarInstance);
