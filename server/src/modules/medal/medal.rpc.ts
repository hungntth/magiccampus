// Medal RPCs (legacy MedalPanel / MedalSlot): getMedalInfo(), moveMedal(fromSid, toSid), arrangeMedalBag(), upMedal(index), breakMedal(index, count,
// breakType) and the H5 catalog read getMedalCatalog(). Pushes: onMoveMedal, onUpMedal, onBreakMedal, onUPP, onRefreshPetProp. A refusal shows
// onSystemMidMsgOrNote and rejects the call (the Go server answered most of them silently).

import { Injectable } from '@nestjs/common';
import type { MEDAL_RARE_REPLY, MedalBagMap, MedalCatalog, MedalInfo, MedalOpPush } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { midNoteOnFail } from '../inventory/pushes';
import { MedalService } from './medal.service';

function intArg(v: unknown, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(name);
  return n;
}

@Injectable()
export class MedalRpc {
  constructor(private readonly medals: MedalService) {}

  @Rpc('getMedalCatalog', { requireCharacter: true })
  getMedalCatalog(): MedalCatalog {
    return this.medals.catalog();
  }

  @Rpc('getMedalInfo', { requireCharacter: true })
  getMedalInfo(session: Session): Promise<MedalInfo> {
    return this.medals.info(session.characterId!);
  }

  @Rpc('moveMedal', { requireCharacter: true, forbidInBattle: true })
  moveMedal(session: Session, args: unknown[]): Promise<null> {
    const [from, to] = [intArg(args[0], 'fromSid'), intArg(args[1], 'toSid')];
    return midNoteOnFail(session, () => this.medals.move(session, from, to));
  }

  @Rpc('arrangeMedalBag', { requireCharacter: true, forbidInBattle: true })
  arrangeMedalBag(session: Session): Promise<MedalBagMap> {
    return this.medals.arrange(session);
  }

  @Rpc('upMedal', { requireCharacter: true, forbidInBattle: true })
  upMedal(session: Session, args: unknown[]): Promise<MedalOpPush> {
    const index = intArg(args[0], 'index');
    return midNoteOnFail(session, () => this.medals.up(session, index));
  }

  /** args: (index, count, breakType); breakType 1 = one, 2 = many (both dissolve `count`). */
  @Rpc('breakMedal', { requireCharacter: true, forbidInBattle: true })
  breakMedal(session: Session, args: unknown[]): Promise<MedalOpPush | typeof MEDAL_RARE_REPLY> {
    const [index, count] = [intArg(args[0], 'index'), intArg(args[1], 'count')];
    return midNoteOnFail(session, () => this.medals.breakMedal(session, index, count));
  }
}
