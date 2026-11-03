// Player item instance (legacy player.character_items). `_id` comes from the `items` counter.
// Only bag slots (slotType 0) are used for now; unique per (character, slotType, slotIndex).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'character_items', timestamps: true })
export class CharacterItem {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  characterId: number;

  @Prop({ required: true })
  templateId: number;

  @Prop({ required: true, default: 1 })
  itemType: number; // ItemKind: 1 item, 2 equipment

  @Prop({ required: true, default: 0 })
  slotType: number;

  @Prop({ required: true })
  slotIndex: number;

  @Prop({ default: 1 })
  stackCount: number;

  @Prop({ default: false })
  isBound: boolean;

  @Prop({ default: 0 })
  colorCode: number;

  @Prop({ default: 0 })
  durability: number;

  @Prop({ default: 0 })
  maxDurability: number;
}

export type CharacterItemDocument = HydratedDocument<CharacterItem>;
export const CharacterItemSchema = SchemaFactory.createForClass(CharacterItem);
CharacterItemSchema.index({ characterId: 1, slotType: 1, slotIndex: 1 }, { unique: true });
