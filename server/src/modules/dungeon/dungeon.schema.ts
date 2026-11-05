// Phụ bản state, one document per character (collection character_dungeons; Go feature states 'dungeon' + 'dungeon_rules'
// merged): today's run per dungeon key, the daily-lock stamps, first clears (with the cleared difficulties) and the
// abandon lock per quest. Every write compares and bumps `rev` (DungeonStateService.mutate).

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** The Mê Huyễn curse look: the transform it replaced (restored on cure) and when it ends. */
export interface DungeonMorph {
  res: string;
  until: number;
  prev: { resCode: string; expiresAt: number } | null;
}

export interface DungeonRun {
  day: string; // dayKey (UTC+7) the run was opened
  beaten: number[]; // NPCs beaten / steps marked in this run
  chest: boolean;
  difficulty: number;
  openedAt: number; // epoch ms
  leader: number; // run leader character id (fixed at entry)
  party: number[]; // leader's run only: the members that entered with it
  credited: number[]; // floor quests credited by the leader's turn-in
  marks: number[]; // per-run marks (Mê Huyễn flower nodes, …)
  entered: boolean; // seen on a floor by the sweeper
  closed: '' | 'left' | 'expired' | 'auto';
  warned: number; // lowest warning threshold already sent (minutes)
  morph: DungeonMorph | null;
  extra?: Record<string, number>; // per-dungeon counters (Liệt Diễm: crystals dug), absent on older runs
}

@Schema({ collection: 'character_dungeons', timestamps: true, minimize: false })
export class CharacterDungeon {
  @Prop({ type: Number, required: true, unique: true })
  characterId: number;

  @Prop({ type: Object, default: {} })
  runs: Record<string, DungeonRun>;

  /** daily lock start (epoch ms) per dungeon key: refused until the next 00:00 */
  @Prop({ type: Object, default: {} })
  done: Record<string, number>;

  /** first clear (epoch ms) per dungeon key */
  @Prop({ type: Object, default: {} })
  cleared: Record<string, number>;

  /** difficulties cleared per dungeon key (quick complete gate) */
  @Prop({ type: Object, default: {} })
  levels: Record<string, number[]>;

  /** abandoned dungeon quest id -> dayKey (no re-take that day) */
  @Prop({ type: Object, default: {} })
  abandoned: Record<string, string>;

  @Prop({ type: Number, default: 0 })
  rev: number;
}

export const CharacterDungeonSchema = SchemaFactory.createForClass(CharacterDungeon);
