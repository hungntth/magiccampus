// Hồn Khí RPCs (legacy DecorateItem / DecoratePanel): activeDecoShow(id, position), equipDecoShow(id, position), equipOffDecoShow(id, position),
// showDecoShow(position), hideDecoShow(position), changeShowLvl(showLvl, position), updateActiveDecoShow(obj), addDecoHoleLevel(position),
// addDecoHoleLevelTenTimes(position), getDecoSuitProp(suitId, linkSuitId, linkId) and the H5 reads getDecoCatalog / getDecoInfo. Every state RPC
// answers the full DecoInfo; a refusal shows onSystemMidMsgOrNote and rejects the call.

import { Injectable } from '@nestjs/common';
import { DECO_TEN_TIMES, type DecoCatalog, type DecoInfo, type DecoSuitPropReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { DecoService } from './deco.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

@Injectable()
export class DecoRpc {
  constructor(private readonly deco: DecoService) {}

  @Rpc('getDecoCatalog', { requireCharacter: true })
  getDecoCatalog(): DecoCatalog {
    return this.deco.catalog();
  }

  @Rpc('getDecoInfo', { requireCharacter: true })
  getDecoInfo(session: Session): Promise<DecoInfo> {
    return this.deco.info(session.characterId!);
  }

  @Rpc('activeDecoShow', { requireCharacter: true, forbidInBattle: true })
  activeDecoShow(session: Session, args: unknown[]): Promise<DecoInfo> {
    const [id, position] = [intArg(args[0], 'id'), intArg(args[1], 'position')];
    return midNoteOnFail(session, () => this.deco.activate(session, id, position));
  }

  @Rpc('equipDecoShow', { requireCharacter: true, forbidInBattle: true })
  equipDecoShow(session: Session, args: unknown[]): Promise<DecoInfo> {
    const [id, position] = [intArg(args[0], 'id'), intArg(args[1], 'position')];
    return midNoteOnFail(session, () => this.deco.equip(session, id, position, true));
  }

  @Rpc('equipOffDecoShow', { requireCharacter: true, forbidInBattle: true })
  equipOffDecoShow(session: Session, args: unknown[]): Promise<DecoInfo> {
    const [id, position] = [intArg(args[0], 'id'), intArg(args[1], 'position')];
    return midNoteOnFail(session, () => this.deco.equip(session, id, position, false));
  }

  @Rpc('showDecoShow', { requireCharacter: true, forbidInBattle: true })
  showDecoShow(session: Session, args: unknown[]): Promise<DecoInfo> {
    const position = intArg(args[0], 'position');
    return midNoteOnFail(session, () => this.deco.show(session, position, true));
  }

  @Rpc('hideDecoShow', { requireCharacter: true, forbidInBattle: true })
  hideDecoShow(session: Session, args: unknown[]): Promise<DecoInfo> {
    const position = intArg(args[0], 'position');
    return midNoteOnFail(session, () => this.deco.show(session, position, false));
  }

  @Rpc('changeShowLvl', { requireCharacter: true, forbidInBattle: true })
  changeShowLvl(session: Session, args: unknown[]): Promise<DecoInfo> {
    const [showLvl, position] = [intArg(args[0], 'showLvl'), intArg(args[1], 'position')];
    return midNoteOnFail(session, () => this.deco.showLevel(session, showLvl, position));
  }

  /** The expiry timer of the client: not blocked in battle (it only drops shows that really expired). */
  @Rpc('updateActiveDecoShow', { requireCharacter: true })
  updateActiveDecoShow(session: Session): Promise<DecoInfo> {
    return this.deco.expire(session);
  }

  @Rpc('addDecoHoleLevel', { requireCharacter: true, forbidInBattle: true })
  addDecoHoleLevel(session: Session, args: unknown[]): Promise<DecoInfo> {
    const position = intArg(args[0], 'position');
    return midNoteOnFail(session, () => this.deco.levelUp(session, position, 1));
  }

  @Rpc('addDecoHoleLevelTenTimes', { requireCharacter: true, forbidInBattle: true })
  addDecoHoleLevelTenTimes(session: Session, args: unknown[]): Promise<DecoInfo> {
    const position = intArg(args[0], 'position');
    return midNoteOnFail(session, () => this.deco.levelUp(session, position, DECO_TEN_TIMES));
  }

  @Rpc('getDecoSuitProp', { requireCharacter: true })
  getDecoSuitProp(session: Session, args: unknown[]): Promise<DecoSuitPropReply> {
    const suitId = intArg(args[0], 'suitId');
    if (suitId <= 0) throw RpcException.invalidArgs('suitId');
    const link = Number(args[1]);
    return this.deco.suitProp(session.characterId!, suitId, Number.isInteger(link) ? link : 0);
  }
}
