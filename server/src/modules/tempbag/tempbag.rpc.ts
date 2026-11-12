// Túi Tiện Dụng + Túi tạm thời RPCs (Flash names verbatim). Temp bag: getTBag, addtItemFromBag / addmxFromBag, moveItemBtwTemp /
// movemxBtwTemp, tempToBag / mxtempToBag, addItemFromTemp / addMXFromTemp, delTempSlot / delmxTempSlot, setTempBag / setmxTempBag,
// setTbagDire, openTempSlot / openmxTempSlot, tempBagSort / mxBagSort, oneKeyOpenAllMXTemp. Túi tạm thời: addSingleItemToBag, addAllToBag.
// Pushes (self): updateTempBags, onMoveToTBag / onMoveMXToTBag, onMoveTempBtw / onMoveMXBtw, onAddItemDelTemp / onAddItemDelmx,
// onAddCharactorSlot, onDelCharactorSlot, onUPP, updateTemporaryBag, closeWarnTemporaryBag. Refusals show onSystemMidMsgOrNote and reject.

import { Injectable } from '@nestjs/common';
import { TEMP_BAG_TEXT, type TBag } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail, sendPushes, type Push } from '../inventory/pushes';
import { TradeManager } from '../trade/trade.manager';
import { TempBagHoldersService, type OpenSlotReply } from './tempbag-holders.service';
import { TempBagMovesService } from './tempbag-moves.service';
import { MxOpenRegistry } from './mx-open.registry';
import { TempBagStateService } from './tempbag-state.service';
import { TemporaryBagService } from './temporary-bag.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class TempBagRpc {
  constructor(
    private readonly state: TempBagStateService,
    private readonly moves: TempBagMovesService,
    private readonly holders: TempBagHoldersService,
    private readonly temporary: TemporaryBagService,
    private readonly trades: TradeManager,
    private readonly mxOpen: MxOpenRegistry,
  ) {}

  @Rpc('getTBag', { requireCharacter: true })
  getTBag(session: Session): Promise<TBag> {
    return this.state.payload(session.characterId!);
  }

  @Rpc('addtItemFromBag', { requireCharacter: true, forbidInBattle: true })
  addtItemFromBag(session: Session, args: unknown[]): Promise<null> {
    return this.put(session, args, false);
  }

  @Rpc('addmxFromBag', { requireCharacter: true, forbidInBattle: true })
  addmxFromBag(session: Session, args: unknown[]): Promise<null> {
    return this.put(session, args, true);
  }

  @Rpc('moveItemBtwTemp', { requireCharacter: true, forbidInBattle: true })
  moveItemBtwTemp(session: Session, args: unknown[]): Promise<null> {
    return this.between(session, args, false);
  }

  @Rpc('movemxBtwTemp', { requireCharacter: true, forbidInBattle: true })
  movemxBtwTemp(session: Session, args: unknown[]): Promise<null> {
    return this.between(session, args, true);
  }

  @Rpc('tempToBag', { requireCharacter: true, forbidInBattle: true })
  tempToBag(session: Session, args: unknown[]): Promise<null> {
    return this.run(session, () => this.moves.take(session.characterId!, false, intArg(args[0], 'posId'), null, null));
  }

  @Rpc('mxtempToBag', { requireCharacter: true, forbidInBattle: true })
  mxtempToBag(session: Session, args: unknown[]): Promise<null> {
    return this.run(session, () => this.moves.take(session.characterId!, true, intArg(args[0], 'posId'), null, null));
  }

  @Rpc('addItemFromTemp', { requireCharacter: true, forbidInBattle: true })
  addItemFromTemp(session: Session, args: unknown[]): Promise<null> {
    return this.takeTo(session, args, false);
  }

  @Rpc('addMXFromTemp', { requireCharacter: true, forbidInBattle: true })
  addMXFromTemp(session: Session, args: unknown[]): Promise<null> {
    return this.takeTo(session, args, true);
  }

  @Rpc('delTempSlot', { requireCharacter: true, forbidInBattle: true })
  delTempSlot(session: Session, args: unknown[]): Promise<null> {
    return this.run(session, () => this.moves.remove(session.characterId!, false, intArg(args[0], 'posId')));
  }

  @Rpc('delmxTempSlot', { requireCharacter: true, forbidInBattle: true })
  delmxTempSlot(session: Session, args: unknown[]): Promise<null> {
    return this.run(session, () => this.moves.remove(session.characterId!, true, intArg(args[0], 'posId')));
  }

  @Rpc('setTempBag', { requireCharacter: true, forbidInBattle: true })
  setTempBag(session: Session, args: unknown[]): Promise<null> {
    return this.setHolder(session, args, false);
  }

  @Rpc('setmxTempBag', { requireCharacter: true, forbidInBattle: true })
  setmxTempBag(session: Session, args: unknown[]): Promise<null> {
    return this.setHolder(session, args, true);
  }

  @Rpc('setTbagDire', { requireCharacter: true })
  async setTbagDire(session: Session, args: unknown[]): Promise<null> {
    const v = args[0];
    await this.holders.setDire(session.characterId!, v === true || v === 1 || v === '1' || v === 'true');
    return null;
  }

  @Rpc('openTempSlot', { requireCharacter: true, forbidInBattle: true })
  openTempSlot(session: Session): Promise<OpenSlotReply> {
    return this.open(session, false);
  }

  @Rpc('openmxTempSlot', { requireCharacter: true, forbidInBattle: true })
  openmxTempSlot(session: Session): Promise<OpenSlotReply> {
    return this.open(session, true);
  }

  /** Reply = the whole tBag (the client stores it as player.tBag and re-renders); also pushed as updateTempBags. */
  @Rpc('tempBagSort', { requireCharacter: true, forbidInBattle: true })
  tempBagSort(session: Session): Promise<TBag> {
    return this.sort(session, false);
  }

  @Rpc('mxBagSort', { requireCharacter: true, forbidInBattle: true })
  mxBagSort(session: Session): Promise<TBag> {
    return this.sort(session, true);
  }

  /** Opens every Ma Tâm item of the Ma Tâm temp bag (opener registered by MonsterHeartModule); the reply is the new tBag, also pushed as updateTempBags. */
  @Rpc('oneKeyOpenAllMXTemp', { requireCharacter: true, forbidInBattle: true })
  async oneKeyOpenAllMXTemp(session: Session): Promise<TBag> {
    if (!(await midNoteOnFail(session, () => this.mxOpen.openAll(session)))) session.callback('onSystemMidMsgOrNote', TEMP_BAG_TEXT.NO_QUICK_OPEN);
    const tBag = await this.state.payload(session.characterId!);
    session.callback('updateTempBags', tBag);
    return tBag;
  }

  @Rpc('addSingleItemToBag', { requireCharacter: true })
  addSingleItemToBag(session: Session, args: unknown[]): Promise<null> {
    return this.run(session, () => this.temporary.addSingle(session, intArg(args[0], 'index')));
  }

  @Rpc('addAllToBag', { requireCharacter: true })
  addAllToBag(session: Session): Promise<null> {
    return this.run(session, () => this.temporary.addAll(session));
  }

  private put(session: Session, args: unknown[], mx: boolean): Promise<null> {
    return this.run(session, () => this.moves.put(session.characterId!, mx, intArg(args[0], 'bagSid'), intArg(args[1], 'posId')));
  }

  private between(session: Session, args: unknown[], mx: boolean): Promise<null> {
    return this.run(session, () => this.moves.between(session.characterId!, mx, intArg(args[0], 'from'), intArg(args[1], 'to')));
  }

  private takeTo(session: Session, args: unknown[], mx: boolean): Promise<null> {
    const num = args[2] === undefined || args[2] === null ? null : intArg(args[2], 'num');
    return this.run(session, async () => {
      this.assertNotTrading(session);
      return this.moves.take(session.characterId!, mx, intArg(args[0], 'posId'), intArg(args[1], 'bagSid'), num);
    });
  }

  private setHolder(session: Session, args: unknown[], mx: boolean): Promise<null> {
    return this.run(session, async () => {
      this.assertNotTrading(session);
      return this.holders.place(session.characterId!, mx, intArg(args[0], 'bagSid'), intArg(args[1], 'holderSid'));
    });
  }

  private async open(session: Session, mx: boolean): Promise<OpenSlotReply> {
    return midNoteOnFail(session, async () => {
      const { reply, pushes } = await this.holders.openSlot(session.characterId!, mx);
      sendPushes(session, pushes);
      return reply;
    });
  }

  private async sort(session: Session, mx: boolean): Promise<TBag> {
    await this.moves.sort(session.characterId!, mx);
    const tBag = await this.state.payload(session.characterId!);
    session.callback('updateTempBags', tBag);
    return tBag;
  }

  /** Go tradeLockedMethods: taking items out of the temp bag / placing holders is refused while an offer is locked. */
  private assertNotTrading(session: Session): void {
    if (this.trades.isLocked(session.characterId!)) throw RpcException.forbidden(TEMP_BAG_TEXT.TRADING);
  }

  private run(session: Session, op: () => Promise<Push[]>): Promise<null> {
    return midNoteOnFail(session, async () => {
      sendPushes(session, await op());
      return null;
    });
  }
}
