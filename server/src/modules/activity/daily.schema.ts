// One document per character and UTC+7 day (collection character_daily): diary task counts, activity points, the one chest
// claim of the day, online milliseconds and online gifts taken. Created lazily by upsert; old days are simply left behind.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'character_daily', minimize: false })
export class CharacterDaily {
  @Prop({ type: Number, required: true })
  characterId: number;

  /** `YYYY-MM-DD` in UTC+7 (shared dayKey). */
  @Prop({ type: String, required: true })
  day: string;

  /** Diary task id -> completions today (dotted $inc on `tasks.<id>`). */
  @Prop({ type: Object, default: {} })
  tasks: Record<string, number>;

  /** Activity points ("điểm năng nổ") earned today. */
  @Prop({ type: Number, default: 0 })
  vitality: number;

  /** The day's single chest was claimed (any tier). */
  @Prop({ type: Boolean, default: false })
  claimed: boolean;

  @Prop({ type: Number, default: -1 })
  claimedTier: number;

  /** Real time spent in-game today, in ms (flushed by the online ticker and on disconnect). */
  @Prop({ type: Number, default: 0 })
  onlineMs: number;

  /** Online gifts taken today (getDailyOnlineAct). */
  @Prop({ type: Number, default: 0 })
  giftsClaimed: number;
}

export const CharacterDailySchema = SchemaFactory.createForClass(CharacterDaily);
CharacterDailySchema.index({ characterId: 1, day: 1 }, { unique: true });
