// Player character document. `_id` is a numeric id from the `counters` collection so the client
// keeps working with integer character ids like the original game.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'characters', timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Character {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  accountId: string;

  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ required: true })
  classId: number;

  @Prop({ default: 0 })
  gender: number;

  @Prop({ default: 1 })
  level: number;

  @Prop({ default: 0 })
  exp: number;

  @Prop({ default: 10 })
  strength: number;

  @Prop({ default: 10 })
  agility: number;

  @Prop({ default: 10 })
  stamina: number;

  @Prop({ default: 10 })
  intelligence: number;

  @Prop({ default: 10 })
  energy: number;

  // Distributed attribute points (changeProperty); strength..energy above stay the base att* values.
  @Prop({ default: 0 })
  aptStrength: number;

  @Prop({ default: 0 })
  aptAgility: number;

  @Prop({ default: 0 })
  aptStamina: number;

  @Prop({ default: 0 })
  aptIntelligence: number;

  @Prop({ default: 0 })
  aptEnergy: number;

  @Prop({ default: 0 })
  attrPoints: number;

  // Pet bag capacity (Go pet_slots, default 6, cap 180); read through PetService.
  @Prop({ default: 6 })
  petMaxNum: number;

  // maxHp / maxMp are a cache rewritten whenever stats are recomputed; the formula is the source of truth.
  @Prop({ default: 100 })
  maxHp: number;

  @Prop({ default: 100 })
  currentHp: number;

  @Prop({ default: 50 })
  maxMp: number;

  @Prop({ default: 50 })
  currentMp: number;

  @Prop({ default: 1 })
  mapId: number;

  @Prop({ default: 170 })
  posX: number;

  @Prop({ default: 1230 })
  posY: number;

  @Prop({ default: 0 })
  dir: number;

  // PK opt-in (uif apvp, M6 phase C): other players may only PK this character on normal maps while it is on.
  @Prop({ default: false })
  apvp: boolean;

  @Prop({ default: 0 })
  money: number;

  @Prop({ default: 0 })
  moneyBind: number;

  @Prop({ default: 0 })
  gold: number;

  @Prop({ default: 0 })
  goldBind: number;

  // Payment preference (legacy ChangeMoneyType): 1 moneyBind / 2 money, 3 goldBind / 4 gold. No UI yet.
  @Prop({ default: 1 })
  selectedMoneyType: number;

  @Prop({ default: 3 })
  selectedGoldType: number;

  // Opened general bag pages (1..7, +1 per item 325) and bank pages (1..5, +1 per item 324); defaults applied on read.
  @Prop({ default: 1 })
  bagSlotNum: number;

  @Prop({ default: 1 })
  bankSlotNum: number;

  // Special currencies (M7): key -> balance (shared CURRENCY_IDS keys). Spent with a conditional $inc, never read-modify-write.
  @Prop({ type: Object, default: {} })
  currencies: Record<string, number>;

  // Active titles (M7): data_tbl_title ids, 0 = none. Ownership lives in character_titles.
  @Prop({ default: 0 })
  titleId: number;

  @Prop({ default: 0 })
  actTitleId: number;

  @Prop({ default: false })
  deleted: boolean;

  @Prop({ type: Date, default: null })
  deleteTime: Date | null;

  @Prop({ type: Date, default: () => new Date() })
  lastActive: Date;
}

export type CharacterDocument = HydratedDocument<Character>;
export const CharacterSchema = SchemaFactory.createForClass(Character);
