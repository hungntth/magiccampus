// Achievement progress of one character (M7 phase B), one document per character (`_id` = character id). The maps are keyed by
// string ids and updated with dotted $set paths: achieveLog[aid] = completion ms, achieveReqLog[reqId] = {done, progress},
// takeLog[aid] = 1 once the reward was claimed. `achPoint` is the sum of `award` over completed achievements.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { AchieveReqProgress } from '@mc/shared';

@Schema({ collection: 'character_achievements', minimize: false })
export class AchievementState {
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: Object, default: {} })
  achieveLog: Record<string, number>;

  @Prop({ type: Object, default: {} })
  achieveReqLog: Record<string, AchieveReqProgress>;

  @Prop({ type: Object, default: {} })
  takeLog: Record<string, number>;

  @Prop({ type: Number, default: 0, index: true })
  achPoint: number;

  /** Local calendar day (YYYY-MM-DD) of the last login that counted for the login-day achievements. */
  @Prop({ type: String, default: '' })
  lastLoginDay: string;
}

export const AchievementStateSchema = SchemaFactory.createForClass(AchievementState);
