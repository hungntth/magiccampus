// Credit point shop limit counters (collection character_credit_limits): units a character exchanged of one credit row in one
// period bucket (creditPeriodKey). The unique key makes `$inc` with a `count + n <= limit` filter the reservation of a limit.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'character_credit_limits', timestamps: true })
export class CreditPurchase {
  @Prop({ type: Number, required: true })
  characterId: number;

  @Prop({ type: Number, required: true })
  creditId: number;

  /** creditPeriodKey(limitType, now): '2026-11-05', '2026-11-02' (Monday), '2026-11' or 'total'. */
  @Prop({ type: String, required: true })
  period: string;

  @Prop({ type: Number, default: 0 })
  count: number;
}

export const CreditPurchaseSchema = SchemaFactory.createForClass(CreditPurchase);
CreditPurchaseSchema.index({ characterId: 1, creditId: 1, period: 1 }, { unique: true });
