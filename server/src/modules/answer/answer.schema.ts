// Daily answer state, one document per character (collection character_answer; Go feature state 'daily_answer'): the UTC+7 day, the
// questions drawn today (the open one counts), the open question with its send time, and the ids already asked (no repeat in a day).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'character_answer', timestamps: true })
export class CharacterAnswer {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: String, default: '' })
  day: string;

  @Prop({ type: Number, default: 0 })
  n: number;

  /** open question (data_tbl_answer id), 0 = none */
  @Prop({ type: Number, default: 0 })
  qid: number;

  @Prop({ type: Number, default: 0 })
  sentAt: number;

  @Prop({ type: [Number], default: [] })
  asked: number[];
}

export const CharacterAnswerSchema = SchemaFactory.createForClass(CharacterAnswer);
