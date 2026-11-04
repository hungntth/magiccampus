// Prabuff RPCs (Flash names): getMagicArrayData(praType 1..8) and addPracticeExp(praType, isGold); the latter also pushes updatePraView.

import { Injectable } from '@nestjs/common';
import type { PraView } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { PrabuffService } from './prabuff.service';

function praType(args: unknown[]): number {
  const t = Number(args[0]);
  if (!Number.isInteger(t)) throw RpcException.invalidArgs('praType');
  return t;
}

@Injectable()
export class PrabuffRpc {
  constructor(private readonly prabuff: PrabuffService) {}

  @Rpc('getMagicArrayData', { requireCharacter: true })
  getMagicArrayData(session: Session, args: unknown[]): Promise<PraView> {
    return this.prabuff.getData(session.characterId!, praType(args));
  }

  @Rpc('addPracticeExp', { requireCharacter: true, forbidInBattle: true })
  addPracticeExp(session: Session, args: unknown[]): Promise<PraView> {
    return this.prabuff.addExp(session, praType(args), args[1] === true || args[1] === 1 || args[1] === 'true');
  }
}
