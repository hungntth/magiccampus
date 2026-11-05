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

/** M12 Mệnh Hồn ring; `data` is keyed by its one-based socket index. */
export interface PetSoulState {
  openNum: number;
  openNum2: number;
  data: Record<string, { sid: number; exp: number; lock?: boolean } | null>;
}

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

  /** M12 training: stars and their separately reversible growth contribution. */
  @Prop({ default: 0 })
  starNum: number;

  @Prop({ default: 0 })
  starGrowAdd: number;

  /** M12 refined / illusion aptitude values supplement distributed aptEx points. */
  @Prop({ type: PetAptExSchema, default: () => ({}) })
  aptRefined: PetAptEx;

  @Prop({ type: PetAptExSchema, default: () => ({}) })
  aptIllusion: PetAptEx;

  @Prop({ type: Object, default: null })
  illusionPending: { key: string; value: number } | null;

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

  /** M12 Phase B: evolved pets retain their feather realm / stage. */
  @Prop({ type: Object, default: null })
  envoInfo: { envo: boolean; round: number; stage: number } | null;

  @Prop({ type: Object, default: () => ({ openNum: 0, openNum2: 0, data: {} }) })
  soul: PetSoulState;

  // Auto-battle bucket (M9, uif / skillSetBattle with isPet): pet keys only (bs/bt even slots, bs10, p6..p9).
  @Prop({ type: Object, default: {} })
  battleSetting: Record<string, number>;

  /** Escrow owner while the pet is parked by a mail / auction row (characterId 0): 'mail:<id>' or 'auction:<id>'. */
  @Prop({ type: String, index: true, sparse: true })
  escrowRef?: string;
}

export type PetDocument = HydratedDocument<Pet>;
export const PetSchema = SchemaFactory.createForClass(Pet);
