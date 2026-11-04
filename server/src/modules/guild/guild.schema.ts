// Guild persistence (M6 phases A+B): guilds, members, applications, the parked (90 %) contribution of players who left, the bank
// slots, the built estate and the skills (guild-developed levels on the guild, learned levels on the member row).
// Member and application rows share one id counter ('guild_rows'); an approved application keeps its id as the member id.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { GuildRankRow } from '@mc/shared';

@Schema({ _id: false })
export class GuildBankEntry {
  @Prop({ required: true })
  tid: number;

  @Prop({ default: 0 })
  count: number;
}
const GuildBankEntrySchema = SchemaFactory.createForClass(GuildBankEntry);

/** A skill level: guild-developed (chain -> level) or learned by a member (sid = template id of the learned level). */
@Schema({ _id: false })
export class SkillLevel {
  @Prop({ required: true })
  chain: string;

  @Prop({ default: 0 })
  sid: number;

  @Prop({ default: 0 })
  level: number;
}
const SkillLevelSchema = SchemaFactory.createForClass(SkillLevel);

@Schema({ collection: 'guilds', timestamps: true })
export class Guild {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  leaderCid: number;

  @Prop({ default: 1 })
  level: number;

  @Prop({ default: 0 })
  exp: number;

  /** Guild money in silver units (donated silver + gold * 2000). */
  @Prop({ default: 0 })
  money: number;

  @Prop({ default: 50 })
  memLimit: number;

  @Prop({ default: 1 })
  bagPages: number;

  @Prop({ default: '' })
  guildInfo: string;

  @Prop({ type: [Object], default: [] })
  rankSettings: GuildRankRow[];

  /** Phase A stock of donated materials; phase B moves it into guild_bank_slots on first access (then stays empty). */
  @Prop({ type: [GuildBankEntrySchema], default: [] })
  bankItems: GuildBankEntry[];

  /** Skills the leader developed (highest level per chain). */
  @Prop({ type: [SkillLevelSchema], default: [] })
  skills: SkillLevel[];
}
export type GuildDocument = HydratedDocument<Guild>;
export const GuildSchema = SchemaFactory.createForClass(Guild);

@Schema({ collection: 'guild_members', timestamps: true })
export class GuildMemberRow {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  guildId: number;

  @Prop({ required: true, unique: true })
  cid: number;

  @Prop({ required: true })
  rank: number;

  @Prop({ default: 0 })
  normalContrib: number;

  @Prop({ default: 0 })
  donateContrib: number;

  /** Guild skills this member learned. */
  @Prop({ type: [SkillLevelSchema], default: [] })
  skills: SkillLevel[];
}
export type GuildMemberDocument = HydratedDocument<GuildMemberRow>;
export const GuildMemberSchema = SchemaFactory.createForClass(GuildMemberRow);

@Schema({ collection: 'guild_applications', timestamps: true })
export class GuildApplication {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  guildId: number;

  @Prop({ required: true, unique: true })
  cid: number;
}
export type GuildApplicationDocument = HydratedDocument<GuildApplication>;
export const GuildApplicationSchema = SchemaFactory.createForClass(GuildApplication);

/** Contribution parked when a character leaves a guild (restored on the next join). `_id` is the character id. */
@Schema({ collection: 'guild_restores' })
export class GuildRestore {
  @Prop({ type: Number })
  _id: number;

  @Prop({ default: 0 })
  normalContrib: number;

  @Prop({ default: 0 })
  donateContrib: number;

  @Prop({ type: [SkillLevelSchema], default: [] })
  skills: SkillLevel[];
}
export type GuildRestoreDocument = HydratedDocument<GuildRestore>;
export const GuildRestoreSchema = SchemaFactory.createForClass(GuildRestore);

/** Guild bank stack (one row per used slot; unique per guild + slot index). _id is the wire slot id (counter guild_slots). */
@Schema({ collection: 'guild_bank_slots' })
export class GuildBankSlot {
  @Prop({ type: Number })
  _id: number;

  @Prop({ required: true, index: true })
  guildId: number;

  @Prop({ required: true })
  slotIndex: number;

  @Prop({ required: true })
  tid: number;

  @Prop({ default: 0 })
  count: number;
}
export type GuildBankSlotDocument = HydratedDocument<GuildBankSlot>;
export const GuildBankSlotSchema = SchemaFactory.createForClass(GuildBankSlot);
GuildBankSlotSchema.index({ guildId: 1, slotIndex: 1 }, { unique: true });

/** A building on a guild lot: tid 10 = being created (buildState = target tid); buildState > 0 on another tid = being upgraded. */
@Schema({ collection: 'guild_buildings' })
export class GuildBuilding {
  @Prop({ required: true, index: true })
  guildId: number;

  @Prop({ required: true })
  extendId: number;

  @Prop({ required: true })
  tid: number;

  @Prop({ default: 0 })
  buildState: number;
}
export type GuildBuildingDocument = HydratedDocument<GuildBuilding>;
export const GuildBuildingSchema = SchemaFactory.createForClass(GuildBuilding);
GuildBuildingSchema.index({ guildId: 1, extendId: 1 }, { unique: true });
