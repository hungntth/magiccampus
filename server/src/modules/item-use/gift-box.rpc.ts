// RPC of the choose-one gift box: selMultiItemByIdx(itemId, idx) -> -1 refused / 0 done (panel closes) / N picks left. The panel is
// opened by the itemMultitoSel push of useItem (gift-box.service.ts). Pushes (self): onSystemMidMsgOrNote, onDelCharactorSlot /
// onAddCharactorSlot (box unit), onAddItem + onAddCharactorSlot or onAddPet (the pick), onUPP{gold} (paid chests).

import { Injectable } from '@nestjs/common';
import type { SelMultiItemResult } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { sendPushes } from '../inventory/pushes';
import { GiftBoxService } from './gift-box.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class GiftBoxRpc {
  constructor(private readonly box: GiftBoxService) {}

  @Rpc('selMultiItemByIdx', { requireCharacter: true, forbidInBattle: true })
  async select(session: Session, args: unknown[]): Promise<SelMultiItemResult> {
    const itemId = intArg(args[0], 'itemId');
    const idx = intArg(args[1], 'idx');
    const { result, pushes } = await this.box.select(session.characterId!, itemId, idx);
    sendPushes(session, pushes);
    return result;
  }
}
