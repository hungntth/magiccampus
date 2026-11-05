// Respawn state of one schedule boss (Go player.schedule_boss_state, without the channel: H5 has one line): alive flag, the epoch ms
// of the next spawn while dead, and the current random spawn point. Written only by ScheduleBossService.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ collection: 'schedule_boss_state', timestamps: true })
export class ScheduleBossState {
  @Prop({ type: Number, required: true, unique: true })
  nid: number;

  @Prop({ type: Boolean, default: true })
  alive: boolean;

  @Prop({ type: Number, default: 0 })
  nextSpawnAt: number;

  @Prop({ type: Number, default: 0 })
  x: number;

  @Prop({ type: Number, default: 0 })
  y: number;
}

export type ScheduleBossStateDocument = HydratedDocument<ScheduleBossState>;
export const ScheduleBossStateSchema = SchemaFactory.createForClass(ScheduleBossState);
