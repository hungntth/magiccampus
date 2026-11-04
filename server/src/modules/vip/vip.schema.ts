// VIP / PM state, one document per character (collection character_vip): membership period, PM exp, daily login marker, claim
// progress per right, the findback audit, today's transform and the optimistic `rev` counter every update compares and bumps.
// The VIP shop rotation state of a character is in the same module (vip-shop.schema.ts).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { PmProcessFlag } from '@mc/shared';

@Schema({ collection: 'character_vip', timestamps: true })
export class CharacterVip {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  /** package type 1..3 of the last purchase, 0 = never a member */
  @Prop({ type: Number, default: 0 })
  vipType: number;

  @Prop({ type: Number, default: 0 })
  expiresAt: number;

  @Prop({ type: Number, default: 0 })
  startedAt: number;

  @Prop({ type: Number, default: 0 })
  pmExp: number;

  @Prop({ type: String, default: '' })
  dailyExpDay: string;

  @Prop({ type: Object, default: {} })
  process: Record<string, PmProcessFlag>;

  @Prop({ type: Boolean, default: false })
  findback: boolean;

  @Prop({ type: [Number], default: [] })
  missed: number[];

  @Prop({ type: String, default: '' })
  auditDay: string;

  @Prop({ type: [Number], default: [] })
  auditRights: number[];

  /** right 13: today's res code and when it ends (epoch ms), null = none */
  @Prop({ type: Object, default: null })
  transform: { resCode: string; expiresAt: number } | null;

  @Prop({ type: Number, default: 0 })
  rev: number;
}

export const CharacterVipSchema = SchemaFactory.createForClass(CharacterVip);
