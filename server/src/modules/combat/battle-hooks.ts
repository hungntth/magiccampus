// M10 battle hooks (decision 9): feature modules tag a battle with a BattleContext (`source` = their key) and register an end
// hook (called once after the settle, with the decided result and the members) and optionally a battlePlayEnd reply (the star
// instance report). Hooks run only for battles whose ctx.source matches; failures are logged and never undo the settle.

import { Injectable, Logger } from '@nestjs/common';
import type { Battle, BattleMember } from './battle.types';

export interface BattleEndEvent {
  battle: Battle;
  result: number; // BattleResult
  members: BattleMember[]; // every member (left ones included; check `left`)
}

export type BattleEndHook = (e: BattleEndEvent) => Promise<void> | void;
/** battlePlayEnd reply for one member; undefined = the default null. */
export type BattleReplyHook = (battle: Battle, characterId: number) => unknown;

@Injectable()
export class BattleHooks {
  private readonly logger = new Logger(BattleHooks.name);
  private readonly ends = new Map<string, BattleEndHook[]>();
  private readonly replies = new Map<string, BattleReplyHook>();
  private readonly anyEnds: BattleEndHook[] = [];

  onEnd(source: string, fn: BattleEndHook): void {
    this.ends.set(source, [...(this.ends.get(source) ?? []), fn]);
  }

  /** Every settled PvE battle, tagged or not (Lang Huyệt kill relay on its floor maps). */
  onAnyEnd(fn: BattleEndHook): void {
    this.anyEnds.push(fn);
  }

  onReply(source: string, fn: BattleReplyHook): void {
    this.replies.set(source, fn);
  }

  async runEnd(battle: Battle): Promise<void> {
    const source = battle.ctx?.source ?? '';
    for (const fn of [...(source ? this.ends.get(source) ?? [] : []), ...this.anyEnds]) {
      try {
        await fn({ battle, result: battle.result, members: [...battle.members.values()] });
      } catch (e) {
        this.logger.error(`battle end hook ${source} (battle ${battle.id}) failed: ${(e as Error).message}`);
      }
    }
  }

  reply(battle: Battle, characterId: number): unknown {
    const fn = battle.ctx ? this.replies.get(battle.ctx.source) : undefined;
    if (!fn) return null;
    try {
      return fn(battle, characterId) ?? null;
    } catch (e) {
      this.logger.error(`battle reply hook ${battle.ctx!.source} failed: ${(e as Error).message}`);
      return null;
    }
  }
}
