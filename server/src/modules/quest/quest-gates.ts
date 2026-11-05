// M10 quest gates: feature modules block quest takes (dungeon abandon lock, leader-only floor quests; blocked quests are also
// hidden from NPC lists) and listen to finishes / abandons (dungeon floor credit, chest reveal). Finish / abandon listeners run
// after the RPC pushes, outside the character lock, with the caller's session.

import { Injectable, Logger } from '@nestjs/common';
import type { Session } from '../../gateway/session';
import type { QuestTemplate } from '../gamedata/quest-data';

/** null = allowed; a string = the Vietnamese refusal. */
export type TakeGate = (characterId: number, tpl: QuestTemplate) => Promise<string | null> | string | null;
export type QuestListener = (session: Session, tpl: QuestTemplate) => Promise<void> | void;

@Injectable()
export class QuestGates {
  private readonly logger = new Logger(QuestGates.name);
  private readonly takeGates: { name: string; fn: TakeGate }[] = [];
  private readonly finished: { name: string; fn: QuestListener }[] = [];
  private readonly abandoned: { name: string; fn: QuestListener }[] = [];

  addTakeGate(name: string, fn: TakeGate): void {
    this.takeGates.push({ name, fn });
  }

  onFinished(name: string, fn: QuestListener): void {
    this.finished.push({ name, fn });
  }

  onAbandon(name: string, fn: QuestListener): void {
    this.abandoned.push({ name, fn });
  }

  get hasTakeGates(): boolean {
    return this.takeGates.length > 0;
  }

  async takeBlocked(characterId: number, tpl: QuestTemplate): Promise<string | null> {
    for (const g of this.takeGates) {
      const why = await g.fn(characterId, tpl);
      if (why) return why;
    }
    return null;
  }

  emitFinished(session: Session, tpl: QuestTemplate): Promise<void> {
    return this.emit(this.finished, session, tpl, 'finish');
  }

  emitAbandon(session: Session, tpl: QuestTemplate): Promise<void> {
    return this.emit(this.abandoned, session, tpl, 'abandon');
  }

  private async emit(list: readonly { name: string; fn: QuestListener }[], session: Session, tpl: QuestTemplate, what: string): Promise<void> {
    for (const l of list) {
      try {
        await l.fn(session, tpl);
      } catch (e) {
        this.logger.error(`quest ${what} listener ${l.name} (quest ${tpl.id}) failed: ${(e as Error).message}`);
      }
    }
  }
}
