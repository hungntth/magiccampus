// Owned titles (legacy player.character_titles): one row per (character, title); `expiresAt` set for timed grants.
// The ACTIVE title ids live on the Character document (titleId / actTitleId) so scene payloads stay synchronous.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'character_titles' })
export class CharacterTitle {
  @Prop({ type: Number, required: true, index: true })
  characterId: number;

  @Prop({ type: Number, required: true })
  titleId: number; // data_tbl_title.id

  @Prop({ type: Date, default: () => new Date() })
  obtainedAt: Date;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

export type CharacterTitleDocument = HydratedDocument<CharacterTitle>;
export const CharacterTitleSchema = SchemaFactory.createForClass(CharacterTitle);
CharacterTitleSchema.index({ characterId: 1, titleId: 1 }, { unique: true });
