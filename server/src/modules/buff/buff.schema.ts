// Persisted long buff (legacy player.character_buffs). `_id` comes from the `buffs` counter; one row per
// (character, buffId), re-granting refreshes the row. `expiresAt` null = permanent / per-battle.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'character_buffs' })
export class CharacterBuff {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  characterId: number;

  @Prop({ required: true })
  buffId: number; // data_tbl_buff.id

  @Prop({ required: true })
  buffType: number; // BuffType: 1 battle, 2 timed, 3 permanent, 10 unique per code_name

  @Prop({ default: 0 })
  durationTotal: number; // seconds

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop({ default: 0 })
  battlesLeft: number;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;
}

export type CharacterBuffDocument = HydratedDocument<CharacterBuff>;
export const CharacterBuffSchema = SchemaFactory.createForClass(CharacterBuff);
CharacterBuffSchema.index({ characterId: 1, buffId: 1 }, { unique: true });
