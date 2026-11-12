// Stone seal RPCs (legacy StoneSealPanel / StoneSealBoreCanvas), all answering the Responder shape {flag, data}: stoneSealGetData(),
// stoneSealSetStone(equipSid, sealIndex, stoneItemId, tempBagFlag), stoneSealRemoveStone(equipSid, sealIndex), stoneSealRemoveAllStone(equipSid),
// stoneSealSwapStone(equipSid, i1, i2), stoneSealBore(equipSid, sealIndex, payMode, diamondItemId), stoneSealSuccinct(equipSid, payMode).
// Pushes: onUPP (stats, gold, currencies), onAddCharactorSlot / onDelCharactorSlot (stones and Kim Cương). A refusal shows onSystemMidMsgOrNote, flag false.

import { Injectable } from '@nestjs/common';
import type { StoneSealReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { StoneSealService } from './stoneseal.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

@Injectable()
export class StoneSealRpc {
  constructor(private readonly seal: StoneSealService) {}

  @Rpc('stoneSealGetData', { requireCharacter: true })
  stoneSealGetData(session: Session): Promise<StoneSealReply> {
    return this.seal.getData(session.characterId!);
  }

  @Rpc('stoneSealSetStone', { requireCharacter: true, forbidInBattle: true })
  stoneSealSetStone(session: Session, args: unknown[]): Promise<StoneSealReply> {
    return this.seal.setStone(session, intArg(args[0], 'equipSid'), intArg(args[1], 'sealIndex'), intArg(args[2], 'stoneItemId'));
  }

  @Rpc('stoneSealRemoveStone', { requireCharacter: true, forbidInBattle: true })
  stoneSealRemoveStone(session: Session, args: unknown[]): Promise<StoneSealReply> {
    return this.seal.removeStone(session, intArg(args[0], 'equipSid'), intArg(args[1], 'sealIndex'));
  }

  @Rpc('stoneSealRemoveAllStone', { requireCharacter: true, forbidInBattle: true })
  stoneSealRemoveAllStone(session: Session, args: unknown[]): Promise<StoneSealReply> {
    return this.seal.removeAll(session, intArg(args[0], 'equipSid'));
  }

  @Rpc('stoneSealSwapStone', { requireCharacter: true, forbidInBattle: true })
  stoneSealSwapStone(session: Session, args: unknown[]): Promise<StoneSealReply> {
    return this.seal.swap(session, intArg(args[0], 'equipSid'), intArg(args[1], 'index1'), intArg(args[2], 'index2'));
  }

  /** The diamond item id (4th arg) is only read for payMode 2. */
  @Rpc('stoneSealBore', { requireCharacter: true, forbidInBattle: true })
  stoneSealBore(session: Session, args: unknown[]): Promise<StoneSealReply> {
    const diamond = args[3] === undefined || args[3] === null ? 0 : intArg(args[3], 'diamondItemId');
    return this.seal.bore(session, intArg(args[0], 'equipSid'), intArg(args[1], 'sealIndex'), intArg(args[2], 'payMode'), diamond);
  }

  @Rpc('stoneSealSuccinct', { requireCharacter: true, forbidInBattle: true })
  stoneSealSuccinct(session: Session, args: unknown[]): Promise<StoneSealReply> {
    return this.seal.succinct(session, intArg(args[0], 'equipSid'), intArg(args[1], 'payMode'));
  }
}
