// Persisted relationship row (friend / black / enemy / couple / tutor / brother; one direction: characterId -> targetId).
// `_id` comes from the single `relationships` counter (Go used two colliding sequences). Unique (characterId, targetId): one
// row per pair and direction.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'relationships' })
export class Relationship {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  characterId: number;

  @Prop({ required: true })
  targetId: number;

  @Prop({ required: true })
  type: number; // RelationType: 1 friend, 2 black, 3 enemy, 4 couple, 5 tutor, 6 brother

  /** Intimacy of this direction (old rows have none: read as 0). */
  @Prop({ type: Number, default: 0 })
  intimacy: number;

  @Prop({ type: Date, default: () => new Date() })
  createdAt: Date;
}

export type RelationshipDocument = HydratedDocument<Relationship>;
export const RelationshipSchema = SchemaFactory.createForClass(Relationship);
RelationshipSchema.index({ characterId: 1, targetId: 1 }, { unique: true });
