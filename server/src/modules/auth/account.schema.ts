import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'accounts', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Account {
  @Prop({ required: true, unique: true, index: true, trim: true })
  username: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ default: 'e10adc3949ba59abbe56e057f20f883e' })
  secondaryPassword: string;

  @Prop({ default: '' })
  email: string;

  @Prop({ default: 0 })
  vipLevel: number;

  @Prop({ default: 0 })
  gold: number;

  @Prop({ default: false })
  isBanned: boolean;

  @Prop({ default: '' })
  banReason: string;

  @Prop({ type: Date, default: null })
  banExpiry: Date | null;

  @Prop({ type: Date, default: () => new Date() })
  lastLogin: Date;
}

export type AccountDocument = HydratedDocument<Account>;
export const AccountSchema = SchemaFactory.createForClass(Account);
