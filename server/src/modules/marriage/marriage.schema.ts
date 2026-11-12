// Persisted marriage state (M14 D / E): `marriages` (one row per marriage, divorced rows are kept with `active` false and `endedAt`;
// partial unique indexes allow one active marriage per partner column) and `wedding_bookings` (phase E: one booking per marriage,
// created by the hall booking RPC, dropped on divorce). Couple intimacy lives in the couple relationship rows (social module).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'marriages' })
export class Marriage {
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: Number, required: true })
  maleId: number;

  @Prop({ type: Number, required: true })
  femaleId: number;

  /** Ring / hall tier on the wire (1 at creation; the ring exchange of phase E raises it). */
  @Prop({ type: Number, default: 1 })
  type: number;

  @Prop({ type: Date, default: () => new Date() })
  marriedAt: Date;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: Date, default: null })
  endedAt: Date | null;

  /** Relationship type the pair held before the marriage (1 friend, 3 enemy, 0 none): a divorce restores it, 0 deletes the couple rows. */
  @Prop({ type: Number, default: 0 })
  priorType: number;
}

/** Phase E booking (Go WeddingBooking). Defined now so a divorce can drop it; the hall services add their own writes. */
@Schema({ collection: 'wedding_bookings' })
export class WeddingBooking {
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: Number, required: true })
  marriageId: number;

  @Prop({ type: Number, required: true })
  maleId: number;

  @Prop({ type: Number, required: true })
  femaleId: number;

  /** The partner who booked (row `cid`; the other is `pid`). */
  @Prop({ type: Number, required: true })
  bookerId: number;

  @Prop({ type: Number, default: 1 })
  line: number;

  /** Start time. */
  @Prop({ type: Date, required: true })
  startAt: Date;

  /** 0 open hall, 1 invitation only. */
  @Prop({ type: Number, default: 0 })
  flag: number;

  @Prop({ type: Number, required: true })
  tier: number;

  @Prop({ type: Number, default: 0 })
  costBind: number;

  @Prop({ type: Number, default: 0 })
  costMoney: number;

  @Prop({ type: Boolean, default: false })
  started: boolean;

  @Prop({ type: Boolean, default: false })
  maleAgreed: boolean;

  @Prop({ type: Boolean, default: false })
  femaleAgreed: boolean;

  @Prop({ type: Date, default: null })
  finishedAt: Date | null;

  @Prop({ type: [Number], default: [] })
  invited: number[];

  @Prop({ type: Number, default: 0 })
  redBags: number;
}

export type MarriageDocument = HydratedDocument<Marriage>;
export type WeddingBookingDocument = HydratedDocument<WeddingBooking>;
export const MarriageSchema = SchemaFactory.createForClass(Marriage);
export const WeddingBookingSchema = SchemaFactory.createForClass(WeddingBooking);
MarriageSchema.index({ maleId: 1 }, { unique: true, partialFilterExpression: { active: true } });
MarriageSchema.index({ femaleId: 1 }, { unique: true, partialFilterExpression: { active: true } });
MarriageSchema.index({ active: 1, marriedAt: 1 });
WeddingBookingSchema.index({ marriageId: 1 }, { unique: true });
WeddingBookingSchema.index({ startAt: 1 });
