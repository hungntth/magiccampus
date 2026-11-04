// In-memory battle registry (no Mongo documents): battleId -> Battle and characterId -> battleId (one entry per participant), plus the 5 s deadline
// checker. The combat service registers the expiry handler (it owns round resolution), so this class stays dependency-free.

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PK_ROUND_MS } from '@mc/shared';
import type { Battle } from './battle.types';

export const BATTLE_DEADLINE_MS = 30_000;

/** Round timeout: 30 s for PvE, 25 s for PvP. */
export const roundMs = (battle?: Pick<Battle, 'pvp'>): number => (battle?.pvp ? PK_ROUND_MS : BATTLE_DEADLINE_MS);
const CHECK_INTERVAL_MS = 5_000;

export type ExpiryHandler = (battle: Battle) => Promise<void> | void;

@Injectable()
export class BattleManager implements OnModuleDestroy {
  private readonly logger = new Logger(BattleManager.name);
  private readonly byId = new Map<string, Battle>();
  private readonly byCharacter = new Map<number, string>();
  private expiry: ExpiryHandler | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Registers who resolves a timed-out round and starts the checker (once). */
  setExpiryHandler(handler: ExpiryHandler): void {
    this.expiry = handler;
    if (this.timer) return;
    this.timer = setInterval(() => this.checkDeadlines(), CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  add(battle: Battle): void {
    this.byId.set(battle.id, battle);
    for (const cid of battle.members.keys()) this.byCharacter.set(cid, battle.id);
  }

  /** Drops the battle and every participant's lookup. */
  remove(battle: Battle): void {
    this.byId.delete(battle.id);
    for (const cid of battle.members.keys()) this.detach(battle, cid);
  }

  /** One participant is done (battlePlayEnd) or gone; the battle itself goes once nobody is left attached. */
  detach(battle: Battle, characterId: number): void {
    if (this.byCharacter.get(characterId) === battle.id) this.byCharacter.delete(characterId);
    const member = battle.members.get(characterId);
    if (member) member.acked = true;
    if ([...battle.members.values()].every((m) => m.acked)) this.byId.delete(battle.id);
  }

  get(id: string): Battle | undefined {
    return this.byId.get(id);
  }

  ofCharacter(characterId: number): Battle | undefined {
    const id = this.byCharacter.get(characterId);
    return id === undefined ? undefined : this.byId.get(id);
  }

  size(): number {
    return this.byId.size;
  }

  private checkDeadlines(): void {
    const now = Date.now();
    for (const battle of [...this.byId.values()]) {
      if (battle.ended || battle.busy || battle.deadline > now) continue;
      void Promise.resolve(this.expiry?.(battle)).catch((e: unknown) => {
        this.logger.error(`deadline round for battle ${battle.id} failed: ${(e as Error).message}`);
      });
    }
  }
}
