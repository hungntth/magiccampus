// Repair RPCs: repair(itemId, mode 1 bag tool | 2 shop tool) and repairAll(mode). The mode is ignored (Go ignores it too).
// Pushes (self): onAddCharactorSlot per repaired item, then onUPP{money}. Failures show onSystemMidMsgOrNote and reject.

import { Injectable } from '@nestjs/common';
import type { RepairReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes } from './pushes';
import { RepairService, type RepairResult } from './repair.service';

@Injectable()
export class RepairRpc {
  constructor(private readonly repairs: RepairService) {}

  @Rpc('repair', { requireCharacter: true, forbidInBattle: true })
  repair(session: Session, args: unknown[]): Promise<RepairReply> {
    const itemId = Number(args[0]);
    if (!Number.isInteger(itemId)) throw RpcException.invalidArgs('itemId');
    return this.run(session, () => this.repairs.repair(session.characterId!, itemId));
  }

  @Rpc('repairAll', { requireCharacter: true, forbidInBattle: true })
  repairAll(session: Session): Promise<RepairReply> {
    return this.run(session, () => this.repairs.repairAll(session.characterId!));
  }

  private run(session: Session, op: () => Promise<RepairResult>): Promise<RepairReply> {
    return midNoteOnFail(session, async () => {
      const r = await op();
      sendPushes(session, r.pushes);
      return r.reply;
    });
  }
}
