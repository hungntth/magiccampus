// RPC useMultiItem(targetType, petId, slotId, n): batch use of one bag stack. Reply { consumed, remaining }. Pushes (self) are the ones of the
// single use (onAddCharactorSlot / onDelCharactorSlot folded to the final stack row, onSystemMidMsgOrNote, grants, onUPP ...).

import { Injectable } from '@nestjs/common';
import type { UseMultiItemReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes } from '../inventory/pushes';
import { MultiUseService } from './multi-use.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class MultiUseRpc {
  constructor(private readonly multi: MultiUseService) {}

  /** targetType 1 = character (petId ignored), 2 = pet. */
  @Rpc('useMultiItem', { requireCharacter: true, forbidInBattle: true })
  async use(session: Session, args: unknown[]): Promise<UseMultiItemReply> {
    const targetType = intArg(args[0], 'targetType');
    if (targetType !== 1 && targetType !== 2) throw RpcException.invalidArgs('targetType');
    const petId = targetType === 2 ? intArg(args[1], 'petId') : 0;
    const slotId = intArg(args[2], 'slotId');
    const count = intArg(args[3], 'n');
    return midNoteOnFail(session, async () => {
      const { reply, pushes } = await this.multi.useMulti(session.characterId!, targetType, petId, slotId, count);
      sendPushes(session, pushes);
      return reply;
    });
  }
}
