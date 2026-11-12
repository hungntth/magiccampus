// Ky Linh / Trung Chu RPCs (QiLingPanel, activity 68): getQiLingProp(equipId) / getChongZhuProp(equipId) reply the lines {"0":{t,v,max},...}
// or false (never null: the Flash buttons stay disabled until the responder runs); updateQiLingProp(equipId, "auto"|"") and
// updateChongZhu(equipId, "lock"|"" x3, "auto"|"") answer true and push the result as onQiLingRes(lines) / onChongZhuRes({use, cz}) after the
// stack changes, onUPP and the refreshed item. A refusal shows a note and still answers true (the responder only re-enables the button).

import { Injectable } from '@nestjs/common';
import type { QilingLinesWire } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { optionalId, sendOut } from './forge-guard';
import type { QilingLocks } from './qiling-rules';
import { QilingService } from './qiling.service';

/** A "lock" / "auto" string argument (the Flash client sends the word, or "" when the box is unticked). */
const flagged = (v: unknown, word: string): boolean => typeof v === 'string' && v.trim().toLowerCase() === word;

@Injectable()
export class QilingRpc {
  constructor(private readonly qiling: QilingService) {}

  @Rpc('getQiLingProp', { requireCharacter: true })
  getQiLingProp(session: Session, args: unknown[]): Promise<QilingLinesWire | false> {
    return this.read(session, args);
  }

  @Rpc('getChongZhuProp', { requireCharacter: true })
  getChongZhuProp(session: Session, args: unknown[]): Promise<QilingLinesWire | false> {
    return this.read(session, args);
  }

  /** (equipId, auto). */
  @Rpc('updateQiLingProp', { requireCharacter: true, forbidInBattle: true })
  async updateQiLingProp(session: Session, args: unknown[]): Promise<boolean> {
    const equipId = optionalId(args[0]);
    if (equipId === 0) return false;
    return sendOut<boolean>(session, true, () => this.qiling.roll(session.characterId!, equipId, false, [false, false, false], flagged(args[1], 'auto')));
  }

  /** (equipId, lock0, lock1, lock2, auto). */
  @Rpc('updateChongZhu', { requireCharacter: true, forbidInBattle: true })
  async updateChongZhu(session: Session, args: unknown[]): Promise<boolean> {
    const equipId = optionalId(args[0]);
    if (equipId === 0) return false;
    const locks: QilingLocks = [flagged(args[1], 'lock'), flagged(args[2], 'lock'), flagged(args[3], 'lock')];
    return sendOut<boolean>(session, true, () => this.qiling.roll(session.characterId!, equipId, true, locks, flagged(args[4], 'auto')));
  }

  private async read(session: Session, args: unknown[]): Promise<QilingLinesWire | false> {
    const equipId = optionalId(args[0]);
    return equipId === 0 ? false : this.qiling.lines(session.characterId!, equipId);
  }
}
