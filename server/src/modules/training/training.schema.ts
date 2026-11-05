// One training document per character (collection character_training): the HMTXL room session, the Ảo Ma Tháp progress and the
// TXKC season. Every write compares and bumps `rev` (TrainingStateService.mutate).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HmtxlDoc, TowerDoc, TxkcDoc } from './training-doc';

@Schema({ collection: 'character_training', timestamps: true, minimize: false })
export class CharacterTraining {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: Object, default: { st: 0, u: 0 } })
  hmtxl: HmtxlDoc;

  @Prop({ type: Object, default: { b: 0, f: 0, w: '' } })
  tower: TowerDoc;

  @Prop({ type: Object, default: null })
  txkc: TxkcDoc | null;

  @Prop({ type: Number, default: 0 })
  rev: number;
}

export const CharacterTrainingSchema = SchemaFactory.createForClass(CharacterTraining);
