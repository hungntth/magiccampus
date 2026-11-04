// Bag RPCs: moveItem(fromSid, toSid), moveItemNum(fromSid, toSid, n), moveItemToPage(srcSid, pageType, tab),
// dropItem(itemId[, md5]), bagSort(), closeBank(). Pushes (self): onMoveItem, onSwapItem, onStackItemInto,
// onAddCharactorSlot, onMoveItemNum, onDelCharactorSlot, onItemSort. Failures show onSystemMidMsgOrNote and reject. The drop password arg is ignored (no secondary password).

import { Injectable } from '@nestjs/common';
import type { OkReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { BagOpsService } from './bag-ops.service';
import { PageOpsService } from './page-ops.service';
import { midNoteOnFail, sendPushes, type Push } from './pushes';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class BagOpsRpc {
  constructor(
    private readonly ops: BagOpsService,
    private readonly pages: PageOpsService,
  ) {}

  @Rpc('moveItem', { requireCharacter: true, forbidInBattle: true })
  moveItem(session: Session, args: unknown[]): Promise<OkReply> {
    const from = intArg(args[0], 'fromSid');
    const to = intArg(args[1], 'toSid');
    return this.run(session, () => this.ops.moveItem(session.characterId!, from, to, session.bankOpen));
  }

  @Rpc('moveItemNum', { requireCharacter: true, forbidInBattle: true })
  moveItemNum(session: Session, args: unknown[]): Promise<OkReply> {
    const from = intArg(args[0], 'fromSid');
    const to = intArg(args[1], 'toSid');
    const n = intArg(args[2], 'count');
    return this.run(session, () => this.ops.moveItemNum(session.characterId!, from, to, n, session.bankOpen));
  }

  /** Drop onto a page tab: first free slot of that page (pageType 1 bag tab 1..9, 2 bank tab 1..5). */
  @Rpc('moveItemToPage', { requireCharacter: true, forbidInBattle: true })
  moveItemToPage(session: Session, args: unknown[]): Promise<OkReply> {
    const sid = intArg(args[0], 'srcSid');
    const pageType = intArg(args[1], 'pageType');
    const tab = intArg(args[2], 'tab');
    return this.run(session, () => this.pages.moveToPage(session.characterId!, sid, pageType, tab, session.bankOpen));
  }

  @Rpc('dropItem', { requireCharacter: true, forbidInBattle: true })
  dropItem(session: Session, args: unknown[]): Promise<OkReply> {
    const itemId = intArg(args[0], 'itemId');
    return this.run(session, () => this.ops.dropItem(session.characterId!, itemId));
  }

  /** The client closed the bank panel: moves to and from bank sids are refused until the next npcFuncClick. */
  @Rpc('closeBank', { requireCharacter: true })
  closeBank(session: Session): null {
    session.bankOpen = false;
    return null;
  }

  @Rpc('bagSort', { requireCharacter: true, forbidInBattle: true })
  bagSort(session: Session): Promise<OkReply> {
    return this.run(session, () => this.ops.bagSort(session.characterId!));
  }

  private run(session: Session, op: () => Promise<Push[]>): Promise<OkReply> {
    return midNoteOnFail(session, async () => {
      sendPushes(session, await op());
      return { success: true };
    });
  }
}
