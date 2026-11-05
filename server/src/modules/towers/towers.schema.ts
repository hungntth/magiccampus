// Boss-tower state, one document per character (collection character_towers; plan decision 3): the nine-boss, corridor and trials
// sub-objects share one `rev`-guarded document. Each owner module extends its sub-state interface in its own files.

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Kiếp Nạn Vô Ưu (modules/nineboss), Go feature state 'nine_boss'. Cycles are numeric YYYYMMDD (UTC+7) as the Flash panel compares them. */
export interface NineBossState {
  maxFloor?: number;
  /** First-kill bit mask (bit = floor number). */
  firstKills?: number;
  /** Cycle the todayFloors digits belong to. */
  cycle?: number;
  /** Sorted unique digits of the floors cleared in that cycle (e.g. "123"). */
  todayFloors?: string;
  /** Cycle of the last claimed daily award. */
  claimedCycle?: number;
}

/** Hành Lang Vô Tận (modules/corridor). */
export interface CorridorState {
  maxCleared?: number;
  firstKills?: number[];
  curFloor?: number;
  claimedCycle?: string;
}

/** Active trials run (Go "run" blob): floor, start / deadline ms, lives left, in battle flag, stage (floor 3: 0 guard wave, 1 boss). */
export interface TrialsRun {
  f: number;
  st: number;
  dl: number;
  lv: number;
  ib?: number;
  sg?: number;
}

/** Where the trainer sends the character back to. */
export interface TrialsReturn {
  m: number;
  x: number;
  y: number;
}

/**
 * Vùng Đất Rèn Luyện (modules/trials). `n` entries used on day `t` (YYYYMMDD, UTC+7), `kt` clears {floor: Monday stamp},
 * `a` first-kill claims {floor: 1}, `at` Monday stamp of the weekly claim, `sc` best scores; `ut` / `nf` are unused.
 */
export interface TrialsState {
  run?: TrialsRun;
  ret?: TrialsReturn;
  n?: number;
  t?: string;
  ut?: number;
  kt?: Record<string, string>;
  a?: Record<string, number>;
  at?: string;
  sc?: Record<string, number>;
  nf?: number;
}

@Schema({ collection: 'character_towers', timestamps: true, minimize: false })
export class CharacterTowers {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: Object, default: {} })
  nineboss: NineBossState;

  @Prop({ type: Object, default: {} })
  corridor: CorridorState;

  @Prop({ type: Object, default: {} })
  trials: TrialsState;

  @Prop({ type: Number, default: 0 })
  rev: number;
}

export const CharacterTowersSchema = SchemaFactory.createForClass(CharacterTowers);
