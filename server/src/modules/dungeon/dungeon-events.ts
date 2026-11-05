// In-module phụ bản events for the per-dungeon hooks (Mê Huyễn curse / nodes, Quỷ Hút Máu reveals, Kho Báu vases): a credited
// victory per character (after RecordVictory) and a floor quest turn-in credited to the run party. Listener failures are logged.

import { Injectable, Logger } from '@nestjs/common';
import type { DungeonDef } from '@mc/shared';
import type { Battle } from '../combat/battle.types';
import type { DungeonMorph } from './dungeon.schema';

export interface VictoryEvent {
  d: DungeonDef;
  npcId: number;
  battle: Battle;
  /** characters the win was credited to (their run marked the NPC beaten) */
  credited: number[];
  /** every player-side character of the win */
  fighters: number[];
}

export interface CreditEvent {
  d: DungeonDef;
  questId: number;
  leader: number;
  members: number[];
  final: boolean;
}

/** A run closed by the sweeper (left / expired / no run): the Mê Huyễn curse is lifted. */
export interface ClosedEvent {
  d: DungeonDef;
  characterId: number;
  morph: DungeonMorph | null;
}

type Fn<E> = (e: E) => Promise<void> | void;

@Injectable()
export class DungeonEvents {
  private readonly logger = new Logger(DungeonEvents.name);
  private readonly victories: Fn<VictoryEvent>[] = [];
  private readonly credits: Fn<CreditEvent>[] = [];
  private readonly closes: Fn<ClosedEvent>[] = [];

  onVictory(fn: Fn<VictoryEvent>): void {
    this.victories.push(fn);
  }

  onCredit(fn: Fn<CreditEvent>): void {
    this.credits.push(fn);
  }

  onClosed(fn: Fn<ClosedEvent>): void {
    this.closes.push(fn);
  }

  async emitClosed(e: ClosedEvent): Promise<void> {
    for (const fn of this.closes) await this.safe(() => fn(e), `close ${e.d.key}`);
  }

  async emitVictory(e: VictoryEvent): Promise<void> {
    for (const fn of this.victories) await this.safe(() => fn(e), `victory ${e.npcId}`);
  }

  async emitCredit(e: CreditEvent): Promise<void> {
    for (const fn of this.credits) await this.safe(() => fn(e), `credit ${e.questId}`);
  }

  private async safe(fn: () => Promise<void> | void, what: string): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.logger.error(`dungeon ${what} listener failed: ${(e as Error).message}`);
    }
  }
}
