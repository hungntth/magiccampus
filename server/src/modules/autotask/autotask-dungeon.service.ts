// Auto-task <-> phụ bản link (Go application/autotask dungeon.go + application/dungeon quick_complete.go): the gate facts of a
// task's dungeon (level, clear at that difficulty, an open run today, carried tickets), the quick run record (ticket spent, today's
// run written closed 'auto' with the daily lock stamp) and the completion reward of the award. Only enabled dungeons are wired.

import { Injectable } from '@nestjs/common';
import type { DungeonDef } from '@mc/shared';
import type { Grant } from '../rewards/grant.service';
import { difficultyOf, dungeonByKey, runOf } from '../dungeon/dungeon-rules';
import { DungeonChestService } from '../dungeon/dungeon-chest.service';
import { DungeonStateService, newRun } from '../dungeon/dungeon-state.service';
import { DungeonSupport } from '../dungeon/dungeon-support.service';
import { clearedAtLevel, everCleared, taskOf, type DungeonGate } from './autotask-rules';

@Injectable()
export class AutoTaskDungeonService {
  constructor(
    private readonly state: DungeonStateService,
    private readonly support: DungeonSupport,
    private readonly chest: DungeonChestService,
  ) {}

  /** The task's dungeon when it is ported (enabled), else undefined. */
  dungeonOf(tid: number): DungeonDef | undefined {
    const t = taskOf(tid);
    return t ? dungeonByKey(t.dungeon) : undefined;
  }

  async gate(characterId: number, tid: number): Promise<DungeonGate | null> {
    const t = taskOf(tid);
    const d = this.dungeonOf(tid);
    if (!t || !d) return null;
    const doc = await this.state.load(characterId);
    const run = runOf(doc.runs, d.key, this.state.today());
    return {
      name: d.name,
      level: d.level,
      ticketName: d.ticketName,
      everCleared: everCleared(doc.cleared[d.key], doc.done[d.key]),
      clearedAtDifficulty: clearedAtLevel(doc.levels[d.key], d.rules.difficulties.length, t.difficulty),
      openRunToday: !!run && run.closed === '',
      tickets: await this.support.tickets(characterId, d),
    };
  }

  /** Go OpenQuickRun after the ticket spend (slot sync): today's run closed 'auto' (the entrance refuses, the sweeper ejects) + the daily lock stamp. */
  async open(characterId: number, tid: number): Promise<boolean> {
    const t = taskOf(tid);
    const d = this.dungeonOf(tid);
    if (!t || !d) return false;
    if (!(await this.support.spendTicket(characterId, d))) return false;
    const difficulty = difficultyOf(d.rules, t.difficulty).level;
    return this.state.mutate(characterId, (st) => {
      const now = this.state.now();
      st.runs[d.key] = { ...newRun(this.state.today(), difficulty, now, characterId, []), chest: true, entered: true, closed: 'auto' };
      st.done[d.key] = now;
      return true;
    });
  }

  /** Chest exp of the award: level x the difficulty's exp per level. */
  chestExp(tid: number, level: number): number {
    const t = taskOf(tid);
    const d = this.dungeonOf(tid);
    return t && d ? level * difficultyOf(d.rules, t.difficulty).expPerLevel : 0;
  }

  /** Items + currencies of the shared completion reward and the Bí Kíp row (no exp); `full` keeps the award claimable. */
  async reward(characterId: number, tid: number): Promise<{ grants: Grant[]; full: boolean; partial: boolean }> {
    const t = taskOf(tid);
    const d = this.dungeonOf(tid);
    if (!t || !d) return { grants: [], full: false, partial: false };
    return this.chest.rollQuickReward(characterId, d, t.difficulty);
  }
}
