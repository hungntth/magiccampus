// Bag RPCs: moveItem(fromSid, toSid), moveItemNum(fromSid, toSid, n), moveItemToPage(srcSid, pageType, tab),
// dropItem(itemId[, md5]), bagSort(), closeBank(), bankSort(), bagToBank(sid, dir), delBagItems(ids[, md5]). Pushes (self): onMoveItem,
// onSwapItem, onStackItemInto, onAddCharactorSlot, onMoveItemNum, onDelCharactorSlot, onItemSort, onBankSort. Failures show onSystemMidMsgOrNote and reject. The drop password arg is ignored (no secondary password).

import { Injectable } from '@nestjs/common';
import { BAG_DELETE_MAX, type OkReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { BagOpsService } from './bag-ops.service';
import { BankService } from './bank.service';
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
    private readonly bank: BankService,
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

  /** Bank panel Sắp xếp: needs the bank open. */
  @Rpc('bankSort', { requireCharacter: true, forbidInBattle: true })
  bankSort(session: Session): Promise<OkReply> {
    return this.run(session, () => this.bank.bankSort(session.characterId!, session.bankOpen));
  }

  /** Double-click quick move: dir 1 bag -> bank, 2 bank -> bag (bank must be open). */
  @Rpc('bagToBank', { requireCharacter: true, forbidInBattle: true })
  bagToBank(session: Session, args: unknown[]): Promise<OkReply> {
    const sid = intArg(args[0], 'sid');
    const dir = intArg(args[1], 'dir');
    return this.run(session, () => this.bank.bagToBank(session.characterId!, sid, dir, session.bankOpen));
  }

  /** Vứt bỏ multi-select: ids of bag / quest-page / pet-page items; the password argument is ignored (no secondary password). */
  @Rpc('delBagItems', { requireCharacter: true, forbidInBattle: true })
  delBagItems(session: Session, args: unknown[]): Promise<{ success: true; num: number }> {
    const raw = Array.isArray(args[0]) ? args[0] : [];
    if (raw.length === 0 || raw.length > BAG_DELETE_MAX) throw RpcException.invalidArgs('ids');
    const ids = raw.map((v) => intArg(v, 'ids'));
    if (ids.some((id) => id <= 0)) throw RpcException.invalidArgs('ids');
    return midNoteOnFail(session, async () => {
      const done = await this.ops.delBagItems(session.characterId!, ids);
      sendPushes(session, done.pushes);
      const note = done.skipped > 0
        ? `Đã xóa ${done.removed} vật phẩm (${done.skipped} vật phẩm không còn trong túi đồ nên được bỏ qua).`
        : `Đã xóa ${done.removed} vật phẩm.`;
      session.callback('onSystemMidMsgOrNote', note);
      return { success: true, num: done.removed };
    });
  }

  private run(session: Session, op: () => Promise<Push[]>): Promise<OkReply> {
    return midNoteOnFail(session, async () => {
      sendPushes(session, await op());
      return { success: true };
    });
  }
}
