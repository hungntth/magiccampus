// Persisted sworn-brotherhood state (M14 C): `brotherhoods` (id from the `brotherhoods` counter, group title) and
// `brotherhood_members` (one row per character, unique `characterId`: a character is in at most one group).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'brotherhoods' })
export class Brotherhood {
  @Prop({ type: Number })
  _id: number;

  /** Group title suffix ("" until a member sets one). */
  @Prop({ type: String, default: '' })
  title: string;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;
}

@Schema({ collection: 'brotherhood_members' })
export class BrotherhoodMember {
  @Prop({ type: Number, required: true })
  characterId: number;

  @Prop({ type: Number, required: true, index: true })
  brotherhoodId: number;

  @Prop({ type: Date, default: () => new Date() })
  joinedAt: Date;
}

export type BrotherhoodDocument = HydratedDocument<Brotherhood>;
export type BrotherhoodMemberDocument = HydratedDocument<BrotherhoodMember>;
export const BrotherhoodSchema = SchemaFactory.createForClass(Brotherhood);
export const BrotherhoodMemberSchema = SchemaFactory.createForClass(BrotherhoodMember);
BrotherhoodMemberSchema.index({ characterId: 1 }, { unique: true });
