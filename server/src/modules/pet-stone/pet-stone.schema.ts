// Persistent M12 pet-stone bag. Slots contain {g: template id, n: stack count, s: refined skill id}.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'character_pet_stones', timestamps: true })
export class CharacterPetStone {
  @Prop({ required: true, unique: true, index: true })
  characterId: number;

  @Prop({ type: Object, default: {} })
  bag: Record<string, { g: number; n: number; s: number }>;
}

export type CharacterPetStoneDocument = HydratedDocument<CharacterPetStone>;
export const CharacterPetStoneSchema = SchemaFactory.createForClass(CharacterPetStone);
