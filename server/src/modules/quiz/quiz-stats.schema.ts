// character_quiz_stats: per-character quiz counters (Go feature state 'quiz' {joined, first}, the achievement metrics quiz_joined /
// quiz_first) and the "owed" exp of players offline at settlement (waits for the next login). owedBags is LEGACY (before M11 the bags
// waited here; they are now mailed at settlement) and only drained by QuizSettleService.claimOwed.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'character_quiz_stats', timestamps: true })
export class CharacterQuizStats {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  /** contests joined with points > 0 */
  @Prop({ type: Number, default: 0 })
  joined: number;

  /** contests won (rank 1) */
  @Prop({ type: Number, default: 0 })
  first: number;

  /** exp not granted yet */
  @Prop({ type: Number, default: 0 })
  owedExp: number;

  /** legacy (pre-M11) bags not granted yet; converted to a mail at the next login */
  @Prop({ type: Number, default: 0 })
  owedBags: number;
}

export const CharacterQuizStatsSchema = SchemaFactory.createForClass(CharacterQuizStats);
