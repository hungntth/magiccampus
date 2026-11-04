// Learned skills: one row per (character, skill). `position` is the hotbar slot (0 = none); the learn rules live in SkillService.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'character_skills' })
export class CharacterSkill {
  @Prop({ required: true })
  characterId: number;

  @Prop({ required: true })
  skillId: number;

  @Prop({ default: 1 })
  level: number;

  @Prop({ default: 0 })
  position: number;
}

export type CharacterSkillDocument = HydratedDocument<CharacterSkill>;
export const CharacterSkillSchema = SchemaFactory.createForClass(CharacterSkill);
CharacterSkillSchema.index({ characterId: 1, skillId: 1 }, { unique: true });
