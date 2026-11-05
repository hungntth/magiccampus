// Player character document. `_id` is a numeric id from the `counters` collection so the client
// keeps working with integer character ids like the original game.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/** One placed Túi Tiện Dụng item: template id, slot count, expiry in ms (0 = forever). */
export interface StoredHolder {
  tid: number;
  num: number;
  exp: number;
}

export interface StoredTempSection {
  opened?: number;
  holders?: Record<string, StoredHolder>;
}

export interface TempBagState {
  n?: StoredTempSection;
  mx?: StoredTempSection;
  dire?: boolean;
}

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

  /** Điểm thưởng (legacy Charactor.ExPoint): spent by mall point rows, credited by the Vcoin exchange (not ported). */
  @Prop({ default: 0 })
  exPoint: number;

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

  // Class rank 0..5 (M9 phase B): raised by the promotion chains' final quests, gates req_c_l skills and the 3-1 turn-ins.
  @Prop({ default: 0 })
  cl: number;

  // Blood bag pools (M9 phase D): char HP, char MP, pet HP, pet MP (login / onUPP `ep`). Capped at BLOOD_BAG_MAX each.
  @Prop({ type: [Number], default: () => [0, 0, 0, 0] })
  bloodBag: number[];

  // When the character last fell to 0 HP at battle settle (mode-3 relive price); cleared on revive.
  @Prop({ type: Date, default: null })
  deathAt: Date | null;

  // Interface settings (M9, uif / skillSetBattle): character auto-battle keys (bs/bt odd slots, p2..p5, bs9).
  @Prop({ type: Object, default: {} })
  interfaceData: Record<string, number | boolean>;

  // Túi Tiện Dụng state (M11 phase C): per sub-bag (n normal, mx Ma Tâm) the opened holder slots and the placed holders keyed
  // "1".."5" ({tid, num, exp ms}), plus the put-directly flag. Written only under the character lock (modules/tempbag).
  @Prop({ type: Object, default: {} })
  tempBag: TempBagState;

  @Prop({ default: false })
  deleted: boolean;

  @Prop({ type: Date, default: null })
  deleteTime: Date | null;

  @Prop({ type: Date, default: () => new Date() })
  lastActive: Date;
}

export type CharacterDocument = HydratedDocument<Character>;
export const CharacterSchema = SchemaFactory.createForClass(Character);
