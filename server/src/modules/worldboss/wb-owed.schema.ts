// Fallback for world boss gift bags whose system mail failed (M11: unclaimed bags are mailed, Go exit.go) and legacy M10 rows; the
// login hook (WbPayoutService.claimOwed) converts what is here into mails.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { WbAwardItem } from '@mc/shared';

@Schema({ collection: 'character_wb_owed', timestamps: true })
export class CharacterWbOwed {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  /** gift bag template ids with counts */
  @Prop({ type: [Object], default: [] })
  items: WbAwardItem[];
}

export type CharacterWbOwedDocument = HydratedDocument<CharacterWbOwed>;
export const CharacterWbOwedSchema = SchemaFactory.createForClass(CharacterWbOwed);
