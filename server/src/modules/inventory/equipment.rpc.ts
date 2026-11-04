// Equipment RPCs: equipOn(itemId) and equipOff(itemId, toSid). Pushes (self): onMoveItem, onUPP; failures show
// onSystemMidMsgOrNote and reject. The logic (slots, gates, push order) lives in EquipmentService.

import { Injectable } from '@nestjs/common';
import type { EquipOnReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { EquipmentService } from './equipment.service';
import { midNoteOnFail, sendPushes } from './pushes';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class EquipmentRpc {
  constructor(private readonly equipment: EquipmentService) {}

  /** One arg: the target slot is decided by the template position. Reply `{success, equipItems}`. */
  @Rpc('equipOn', { requireCharacter: true, forbidInBattle: true })
  async equipOn(session: Session, args: unknown[]): Promise<EquipOnReply> {
    const itemId = intArg(args[0], 'itemId');
    return midNoteOnFail(session, async () => {
      const r = await this.equipment.equipOn(session.characterId!, itemId);
      sendPushes(session, r.pushes);
      return { success: true, equipItems: r.equipItems };
    });
  }

  /** toSid -1 = first free bag slot. Reply null. */
  @Rpc('equipOff', { requireCharacter: true, forbidInBattle: true })
  async equipOff(session: Session, args: unknown[]): Promise<null> {
    const itemId = intArg(args[0], 'itemId');
    const toSid = args[1] === undefined || args[1] === null ? -1 : intArg(args[1], 'toSid');
    return midNoteOnFail(session, async () => {
      sendPushes(session, (await this.equipment.equipOff(session.characterId!, itemId, toSid)).pushes);
      return null;
    });
  }
}
