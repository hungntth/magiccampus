// In-memory pet arena feed (Go application/petarena feed.go, lost on restart): the last 20 fight-log lines per character, the latest war
// report ("Chien bao") per level group, the recent battle results behind petFightResult, and which sessions built the arena panel. The
// client panel throws (#1009) on onPetArenaFight before it was opened, so defender pushes only reach a session that opened it.

import { Injectable } from '@nestjs/common';
import type { PetArenaFightPush, PetArenaSysMsg, PetFightResultReply } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { ARENA_LOG_KEEP } from '../pet/pet-depth-constants';
import { streakMilestone } from './arena-rules';

/** Battle results kept for petFightResult (newest 500). */
const BATTLE_KEEP = 500;

interface PanelFlags {
  characterId: number | null;
  opened: boolean;
  logSent: boolean;
}

@Injectable()
export class ArenaFeedService {
  private readonly logs = new Map<number, PetArenaFightPush[]>();
  private readonly sys = new Map<number, PetArenaSysMsg>();
  private readonly battles = new Map<string, PetFightResultReply>();
  private readonly panels = new WeakMap<Session, PanelFlags>();
  private sysSeq = 0;

  pushLog(characterId: number, line: PetArenaFightPush): void {
    const list = [...(this.logs.get(characterId) ?? []), line].slice(-ARENA_LOG_KEEP);
    this.logs.set(characterId, list);
  }

  logsOf(characterId: number): PetArenaFightPush[] {
    return [...(this.logs.get(characterId) ?? [])];
  }

  /** A weekly 5-win streak or a one-day climb of the attacker (a climb wins over a streak). Null when the fight is no news. */
  recordSys(group: number, win: boolean, attacker: { id: number; name: string }, combo: number, climbBefore: number, climbAfter: number): PetArenaSysMsg | null {
    if (!win) return null;
    const data = climbAfter > climbBefore ? [2, attacker.id, attacker.name, climbAfter] as const
      : streakMilestone(combo) ? [1, attacker.id, attacker.name, combo] as const : null;
    if (!data) return null;
    const msg: PetArenaSysMsg = { id: ++this.sysSeq, data: [...data] };
    this.sys.set(group, msg);
    return msg;
  }

  /** The latest report of a group, `{}` when none (the client treats an empty object as "nothing to show"). */
  sysOf(group: number): PetArenaSysMsg | Record<string, never> {
    return this.sys.get(group) ?? {};
  }

  recordBattle(result: PetFightResultReply): void {
    this.battles.set(result.bid, result);
    while (this.battles.size > BATTLE_KEEP) this.battles.delete(this.battles.keys().next().value!);
  }

  battle(bid: string): PetFightResultReply | undefined {
    return this.battles.get(bid);
  }

  // --- panel flags ----------------------------------------------------------------------------------------------------------
  private flags(session: Session): PanelFlags {
    let f = this.panels.get(session);
    if (!f || f.characterId !== session.characterId) {
      f = { characterId: session.characterId, opened: false, logSent: false }; // a session that picks another character starts over
      this.panels.set(session, f);
    }
    return f;
  }

  markOpen(session: Session): void {
    this.flags(session).opened = true;
  }

  isOpen(session: Session): boolean {
    return this.flags(session).opened;
  }

  /** True the first time per session (the client appends the log lines, so they are sent once per connection). */
  takeLogOnce(session: Session): boolean {
    const f = this.flags(session);
    if (f.logSent) return false;
    f.logSent = true;
    return true;
  }
}
