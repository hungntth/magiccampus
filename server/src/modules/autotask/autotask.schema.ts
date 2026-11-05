// Auto-task state, one document per character (collection character_autotask; Go feature state 'auto_task'): the day's free-run
// counter, the running task, the queue, the finished battles waiting for the award and the tasks started through the phụ bản gate.
// Every write compares and bumps `rev` (AutoTaskStateService.mutate).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { AutoRun } from './autotask-rules';

@Schema({ collection: 'character_autotask', timestamps: true, minimize: false })
export class CharacterAutoTask {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: String, default: '' })
  day: string;

  @Prop({ type: Number, default: 0 })
  use: number;

  @Prop({ type: Object, default: null })
  run: AutoRun | null;

  @Prop({ type: [Number], default: [] })
  queue: number[];

  @Prop({ type: Object, default: {} })
  finish: Record<string, number>;

  @Prop({ type: [Number], default: [] })
  dg: number[];

  @Prop({ type: Number, default: 0 })
  rev: number;
}

export const CharacterAutoTaskSchema = SchemaFactory.createForClass(CharacterAutoTask);
