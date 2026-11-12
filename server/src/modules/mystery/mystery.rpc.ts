// Mật Bảo RPCs (legacy DecoratePanel page 4, Flash names kept): onGetMysBookData, onGetMysMakeData, onGetMysBagData, onGetChipBagData, getMysTreBuffByKind(kind),
// getMysTreBuffSimpleData, mysTreObjResolve({slot:{mid,num}}), onGetMysAddTimes, addLimitMakeTimes, makeMysTre(recipeId, {slot:{idx}}, {slot:stack}), onGetMakeLimitTimes and the H5
// catalog read getMysCatalog. Pushes: updateMysTreBag / Book / MakeTimes / MakeData, onActiveMysBookInfo, updateRuneChipBag, onAddMoney, onUPP. A refusal shows
// onSystemMidMsgOrNote and rejects the call.

import { Injectable } from '@nestjs/common';
import { MYS, type MakeMysTreReply, type MysBag, type MysBook, type MysBuffByKind, type MysBuffSimple, type MysCatalog, type MysLimit, type MysMakeData, type RuneChipBag } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { RuneService } from '../rune/rune.service';
import { MysteryResolveService } from './mystery-resolve.service';
import { MysteryService } from './mystery.service';

@Injectable()
export class MysteryRpc {
  constructor(
    private readonly mystery: MysteryService,
    private readonly resolver: MysteryResolveService,
    private readonly runes: RuneService,
  ) {}

  @Rpc('getMysCatalog', { requireCharacter: true })
  getMysCatalog(): Promise<MysCatalog> {
    return this.mystery.catalog();
  }

  @Rpc('onGetMysBookData', { requireCharacter: true })
  getBook(session: Session): Promise<MysBook> {
    return this.mystery.book(session.characterId!);
  }

  @Rpc('onGetMysMakeData', { requireCharacter: true })
  getMakeData(session: Session): Promise<MysMakeData> {
    return this.mystery.makeDataOf(session.characterId!);
  }

  @Rpc('onGetMysBagData', { requireCharacter: true })
  getBag(session: Session): Promise<MysBag> {
    return this.mystery.bag(session.characterId!);
  }

  /** The rune chip bag (shared with 13.5a, same store as getRuneChipBag). */
  @Rpc('onGetChipBagData', { requireCharacter: true })
  getChipBag(session: Session): Promise<RuneChipBag> {
    return this.runes.chips(session.characterId!);
  }

  @Rpc('getMysTreBuffByKind', { requireCharacter: true })
  getBuffByKind(session: Session, args: unknown[]): Promise<MysBuffByKind> {
    const kind = Number(args[0]);
    if (!Number.isInteger(kind) || kind < MYS.KIND_MIN || kind > MYS.KIND_MAX) throw RpcException.invalidArgs('kind');
    return this.mystery.buffByKind(session.characterId!, kind);
  }

  @Rpc('getMysTreBuffSimpleData', { requireCharacter: true })
  getBuffSimple(session: Session): Promise<MysBuffSimple> {
    return this.mystery.buffSimple(session.characterId!);
  }

  @Rpc('onGetMysAddTimes', { requireCharacter: true })
  getAddTimes(session: Session): Promise<MysLimit> {
    return this.mystery.addTimes(session.characterId!);
  }

  @Rpc('onGetMakeLimitTimes', { requireCharacter: true })
  getLimit(session: Session): Promise<MysLimit> {
    return this.mystery.limit(session.characterId!);
  }

  @Rpc('addLimitMakeTimes', { requireCharacter: true, forbidInBattle: true })
  addLimit(session: Session): Promise<MysLimit> {
    return midNoteOnFail(session, () => this.mystery.buy(session));
  }

  @Rpc('makeMysTre', { requireCharacter: true, forbidInBattle: true })
  make(session: Session, args: unknown[]): Promise<MakeMysTreReply> {
    const recipeId = Number(args[0]);
    if (!Number.isInteger(recipeId) || recipeId <= 0) throw RpcException.invalidArgs('recipeId');
    return midNoteOnFail(session, () => this.mystery.make(session, recipeId, args[1], args[2]));
  }

  @Rpc('mysTreObjResolve', { requireCharacter: true, forbidInBattle: true })
  resolve(session: Session, args: unknown[]): Promise<null> {
    return midNoteOnFail(session, () => this.resolver.resolve(session, args[0]));
  }
}
