// GM inbox (collection gm_messages, M14 phase G): the lines players send with chatGM(message, playerId, gmName). The sender is always
// the session character; the row is kept even when no GM is online.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'gm_messages', timestamps: true })
export class GmMessage {
  @Prop({ type: Number, required: true })
  fromId: number;

  @Prop({ type: String, required: true })
  fromName: string;

  @Prop({ type: String, required: true })
  message: string;

  /** Online GM accounts that got the line (0 = stored only). */
  @Prop({ type: Number, default: 0 })
  delivered: number;
}

export const GmMessageSchema = SchemaFactory.createForClass(GmMessage);
GmMessageSchema.index({ createdAt: -1 });
