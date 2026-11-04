// Daily boss counters per character (Go character BossDaily JSON): the UTC+7 day, attempts used, per-boss `n` / `t` and the bosses
// fought today (`done`, Flash dfd). Written only by DailyBossService under the character lock.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { BossDailyEntry } from '@mc/shared';

@Schema({ collection: 'character_boss_daily', timestamps: true })
export class CharacterBossDaily {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: String, default: '' })
  day: string;

  @Prop({ type: Number, default: 0 })
  used: number;

  @Prop({ type: Object, default: {} })
  perBoss: Record<string, BossDailyEntry>;

  @Prop({ type: Object, default: {} })
  done: Record<string, number>;
}

export type CharacterBossDailyDocument = HydratedDocument<CharacterBossDaily>;
export const CharacterBossDailySchema = SchemaFactory.createForClass(CharacterBossDaily);
