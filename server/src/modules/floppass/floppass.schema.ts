// Flop pass persistence: `character_flop` (one run state per character, `rev` CAS; Go feature state 'flop_pass') and `flop_rank`
// (weekly ranking rows {cycle, cid, name, score}; score = passes * 1e7 + earliness, @mc/shared flopScore).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'character_flop', timestamps: true, minimize: false })
export class CharacterFlop {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: Number, default: 0 })
  cycle: number;

  @Prop({ type: String, default: '' })
  day: string;

  @Prop({ type: Number, default: 0 })
  restarts: number;

  @Prop({ type: Number, default: 0 })
  p: number;

  @Prop({ type: Number, default: 1 })
  i: number;

  @Prop({ type: Boolean, default: true })
  s: boolean;

  @Prop({ type: [Number], default: [] })
  bosses: number[];

  @Prop({ type: [Number], default: [] })
  killed: number[];

  @Prop({ type: Object, default: {} })
  ii: Record<string, number>;

  @Prop({ type: Boolean, default: false })
  award: boolean;

  @Prop({ type: Number, default: 0 })
  rev: number;
}

export const CharacterFlopSchema = SchemaFactory.createForClass(CharacterFlop);

@Schema({ collection: 'flop_rank', timestamps: true })
export class FlopRank {
  @Prop({ type: Number, required: true })
  cycle: number;

  @Prop({ type: Number, required: true })
  cid: number;

  @Prop({ type: String, default: '' })
  name: string;

  @Prop({ type: Number, default: 0 })
  score: number;
}

export const FlopRankSchema = SchemaFactory.createForClass(FlopRank);
FlopRankSchema.index({ cycle: 1, cid: 1 }, { unique: true });
FlopRankSchema.index({ cycle: 1, score: -1 });
