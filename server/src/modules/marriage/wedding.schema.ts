// Wedding hall guest origin (M14 phase E): where a character stood before `enterWeddingHall` teleported it into a hall map, so the
// close sweep (and a login inside a closed hall) can send it back. One row per character (`_id` = character id), persisted so a
// server restart does not lose it. The booking itself is the `WeddingBooking` class in marriage.schema.ts.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'wedding_origins' })
export class WeddingOrigin {
  /** Character id. */
  @Prop({ type: Number })
  _id: number;

  @Prop({ type: Number, required: true })
  mapId: number;

  @Prop({ type: Number, default: 0 })
  x: number;

  @Prop({ type: Number, default: 0 })
  y: number;
}

export type WeddingOriginDocument = HydratedDocument<WeddingOrigin>;
export const WeddingOriginSchema = SchemaFactory.createForClass(WeddingOrigin);
