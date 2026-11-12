// Marriage board collections (M14 D): `marriage_seeking` (one ad per character, overwritten by a new post) and `marriage_requests`
// (proposals, id from the `marriage_requests` counter, a 30-day TTL index on `addDate` removes old rows).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'marriage_seeking' })
export class MarriageSeeking {
  @Prop({ type: Number, required: true })
  characterId: number;

  @Prop({ type: String, default: '' })
  content: string;

  @Prop({ type: Number, default: 0 })
  flag: number;

  /** Epoch ms (the wire value). */
  @Prop({ type: Number, required: true })
  addDate: number;
}

@Schema({ collection: 'marriage_requests' })
export class MarriageRequest {
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: Number, required: true })
  fromId: number;

  @Prop({ type: Number, required: true })
  toId: number;

  @Prop({ type: String, default: '' })
  content: string;

  /** 0 open, 1 accepted, 2 refused. */
  @Prop({ type: Number, default: 0 })
  flag: number;

  /** Insert time as a Date: the TTL index needs a Date; `addDateMs` is the wire value. */
  @Prop({ type: Date, required: true })
  addDate: Date;

  @Prop({ type: Number, required: true })
  addDateMs: number;

  @Prop({ type: Number, default: 0 })
  replyDate: number;
}

export type MarriageSeekingDocument = HydratedDocument<MarriageSeeking>;
export type MarriageRequestDocument = HydratedDocument<MarriageRequest>;
export const MarriageSeekingSchema = SchemaFactory.createForClass(MarriageSeeking);
export const MarriageRequestSchema = SchemaFactory.createForClass(MarriageRequest);
MarriageSeekingSchema.index({ characterId: 1 }, { unique: true });
MarriageSeekingSchema.index({ flag: -1, addDate: -1 });
MarriageRequestSchema.index({ addDate: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });
MarriageRequestSchema.index({ fromId: 1 });
MarriageRequestSchema.index({ toId: 1 });
