// Tủ Đồ RPCs (state side): checkSameDay -> dressInfo, activeDress(dressId, autoBuy), ensureBuyActive(dressId), recieveGoods(dressId) (sic),
// exchangeRecipe(recipeId), setFakeDress / unsetFakeDress(dressId, resCode), setFakeFlyerDress / unsetFakeFlyerDress(dressId, resCode,
// wavCode), H5 getDressCatalog. Every reply is the DressInfo object; a refusal shows onSystemMidMsgOrNote and rejects the call.

import { Injectable } from '@nestjs/common';
import { DRESS_TYPE, type DressCatalog, type DressInfo } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { DressService } from './dress.service';

/** Positive integer RPC argument or invalidArgs. */
export function idArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(name);
  return n;
}

@Injectable()
export class DressRpc {
  constructor(private readonly dress: DressService) {}

  @Rpc('getDressCatalog', { requireCharacter: true })
  getDressCatalog(): Promise<DressCatalog> {
    return this.dress.catalog();
  }

  @Rpc('checkSameDay', { requireCharacter: true })
  checkSameDay(session: Session): Promise<DressInfo> {
    return this.dress.checkSameDay(session.characterId!);
  }

  @Rpc('activeDress', { requireCharacter: true, forbidInBattle: true })
  activeDress(session: Session, args: unknown[]): Promise<DressInfo> {
    const id = idArg(args[0], 'dressId');
    return midNoteOnFail(session, () => this.dress.activate(session, id, args[1] === true));
  }

  @Rpc('ensureBuyActive', { requireCharacter: true, forbidInBattle: true })
  ensureBuyActive(session: Session, args: unknown[]): Promise<DressInfo> {
    const id = idArg(args[0], 'dressId');
    return midNoteOnFail(session, () => this.dress.activate(session, id, true));
  }

  @Rpc('recieveGoods', { requireCharacter: true, forbidInBattle: true })
  recieveGoods(session: Session, args: unknown[]): Promise<DressInfo> {
    const id = idArg(args[0], 'dressId');
    return midNoteOnFail(session, () => this.dress.receive(session, id));
  }

  @Rpc('exchangeRecipe', { requireCharacter: true, forbidInBattle: true })
  exchangeRecipe(session: Session, args: unknown[]): Promise<DressInfo> {
    const id = idArg(args[0], 'recipeId');
    return midNoteOnFail(session, () => this.dress.exchange(session, id));
  }

  // The resCode / wavCode arguments are the Flash client's copy of the art; the server resolves the art from the dress row itself.
  @Rpc('setFakeDress', { requireCharacter: true, forbidInBattle: true })
  setFakeDress(session: Session, args: unknown[]): Promise<DressInfo> {
    const id = idArg(args[0], 'dressId');
    return midNoteOnFail(session, () => this.dress.setFake(session, id, DRESS_TYPE.FASHION, true));
  }

  @Rpc('unsetFakeDress', { requireCharacter: true, forbidInBattle: true })
  unsetFakeDress(session: Session, args: unknown[]): Promise<DressInfo> {
    const id = idArg(args[0], 'dressId');
    return midNoteOnFail(session, () => this.dress.setFake(session, id, DRESS_TYPE.FASHION, false));
  }

  @Rpc('setFakeFlyerDress', { requireCharacter: true, forbidInBattle: true })
  setFakeFlyerDress(session: Session, args: unknown[]): Promise<DressInfo> {
    const id = idArg(args[0], 'dressId');
    return midNoteOnFail(session, () => this.dress.setFake(session, id, DRESS_TYPE.FLYER, true));
  }

  @Rpc('unsetFakeFlyerDress', { requireCharacter: true, forbidInBattle: true })
  unsetFakeFlyerDress(session: Session, args: unknown[]): Promise<DressInfo> {
    const id = idArg(args[0], 'dressId');
    return midNoteOnFail(session, () => this.dress.setFake(session, id, DRESS_TYPE.FLYER, false));
  }
}
