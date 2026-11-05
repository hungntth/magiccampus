// Mê Trận state, one document per character (collection character_maze; Go feature state 'maze'): the daily lobby counters (chest
// level, refresh / entry use, reset by day key) and the run in progress (board, visited cells, counters, pending event, sub-panel
// state). The run survives disconnects: enterMaze resumes it without another entry. Every write bumps `rev` (MazeStateService).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { MazeRun } from './maze-board';

@Schema({ collection: 'character_maze', timestamps: true, minimize: false })
export class CharacterMaze {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  /** UTC+7 day key the counters belong to. */
  @Prop({ type: String, default: '' })
  day: string;

  @Prop({ type: Number, default: 1 })
  level: number;

  @Prop({ type: Number, default: 0 })
  enterUsed: number;

  @Prop({ type: Number, default: 0 })
  refreshUsed: number;

  @Prop({ type: Object, default: null })
  run: MazeRun | null;

  @Prop({ type: Number, default: 0 })
  rev: number;
}

export const CharacterMazeSchema = SchemaFactory.createForClass(CharacterMaze);
