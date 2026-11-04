// Feature store (Go character_stat_features): one state document per (character, featureKey) for systems that change stats but
// are not equipment (awakening, war sprite, zodiac, ...). `state` is feature-defined JSON; stat providers read it by model.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'character_features', timestamps: { createdAt: false, updatedAt: 'updatedAt' } })
export class CharacterFeature {
  @Prop({ type: Number, required: true })
  characterId: number;

  @Prop({ type: String, required: true })
  featureKey: string;

  @Prop({ type: Object, default: {} })
  state: Record<string, unknown>;
}

export type CharacterFeatureDocument = HydratedDocument<CharacterFeature>;
export const CharacterFeatureSchema = SchemaFactory.createForClass(CharacterFeature);
CharacterFeatureSchema.index({ characterId: 1, featureKey: 1 }, { unique: true });
