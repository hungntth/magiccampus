// Per-character event progress (collection event_progress, M14 phase H): `total` + the claimed payout tiers of one event in one period.
// 3v3 uses event "threepvp" (period = run key: points, tier 1 = medals paid), "threepvp_medal" (period "all": lifetime medals) and
// "threepvp_title" (period YYYY-MM: tier 1 = the month's title claimed). The unique triple makes claims and upserts atomic.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'event_progress', timestamps: true })
export class EventProgress {
  @Prop({ type: Number, required: true })
  characterId: number;

  @Prop({ type: String, required: true })
  event: string;

  @Prop({ type: String, required: true })
  periodKey: string;

  @Prop({ type: Number, default: 0 })
  total: number;

  @Prop({ type: [Number], default: [] })
  claimedTiers: number[];
}

export const EventProgressSchema = SchemaFactory.createForClass(EventProgress);
EventProgressSchema.index({ characterId: 1, event: 1, periodKey: 1 }, { unique: true });
EventProgressSchema.index({ event: 1, periodKey: 1, total: -1, updatedAt: 1 });
