// Pet document (`pets` collection). `_id` is the client-visible pet id from the `counters` collection (key `pets`).
// Level is derived from the cumulative exp; pet HP/MP are never persisted (a pet always starts a battle full).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class PetAptEx {
  @Prop({ default: 0 }) strength: number;
  @Prop({ default: 0 }) agility: number;
  @Prop({ default: 0 }) stamina: number;
  @Prop({ default: 0 }) intelligence: number;
  @Prop({ default: 0 }) energy: number;
}
export const PetAptExSchema = SchemaFactory.createForClass(PetAptEx);

@Schema({ collection: 'pets', timestamps: true })
export class Pet {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  characterId: number;

  @Prop({ required: true })
  tid: number;

  @Prop({ required: true })
  petName: string;

  @Prop({ default: 1 })
  level: number;

  @Prop({ default: 1 })
  exp: number;

  @Prop({ default: 0.8 })
  growRate: number;

  @Prop({ default: 0 })
  growRateAdd: number;

  @Prop({ type: PetAptExSchema, default: () => ({}) })
  aptEx: PetAptEx;

  @Prop({ default: 0 })
  attrPoints: number;

  @Prop({ default: 10000 })
  life: number;

  @Prop({ default: 3 })
  state: number;

  @Prop({ default: 0 })
  binded: number;

  @Prop({ default: false })
  following: boolean;

  @Prop({ type: [Number], default: [] })
  skills: number[];

  @Prop({ type: [Number], default: [] })
  equ: number[];

  @Prop({ default: 0 })
  upgradeNum: number;

  @Prop({ default: 0 })
  element: number;

  // Auto-battle bucket (M9, uif / skillSetBattle with isPet): pet keys only (bs/bt even slots, bs10, p6..p9).
  @Prop({ type: Object, default: {} })
  battleSetting: Record<string, number>;

  /** Escrow owner while the pet is parked by a mail / auction row (characterId 0): 'mail:<id>' or 'auction:<id>'. */
  @Prop({ type: String, index: true, sparse: true })
  escrowRef?: string;
}

export type PetDocument = HydratedDocument<Pet>;
export const PetSchema = SchemaFactory.createForClass(Pet);
