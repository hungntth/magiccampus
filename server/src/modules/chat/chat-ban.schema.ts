// Chat bans (collection chat_bans, M14 phase G): one row per muted character, bought by another player for 100 gold. The unique
// characterId is the atomic reservation: a ban is inserted, or an expired row replaced, and nothing else can overwrite a live one.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'chat_bans', timestamps: true })
export class ChatBan {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: Number, required: true })
  bannedBy: number;

  @Prop({ type: String, required: true })
  bannedByName: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;
}

export const ChatBanSchema = SchemaFactory.createForClass(ChatBan);
