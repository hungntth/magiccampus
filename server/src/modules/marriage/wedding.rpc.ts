// Wedding hall RPCs (Flash names): bookWeddingHall({line, hour, minute, flag}), cancelWeddingHall, enterWeddingHall(cid), changeRing,
// useWeddingBag(slotId), useRedBag(slotId). Replies are null; results travel as pushes (onInitBookList, onAddMoney / onUPP, the world
// onSysEvent t 117-119, onSceneEnter, onChangeRingMale / onChangeRingFemale, onInitCouple). Logic lives in the wedding services.

import { Injectable } from '@nestjs/common';
import type { BookWeddingArg } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { WeddingCeremony } from './wedding-ceremony.service';
import { WeddingHall } from './wedding-hall.service';
import { WeddingInvites } from './wedding-invites.service';
import { WeddingService } from './wedding.service';

function intArg(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

function positive(v: unknown, field: string): number {
  const n = intArg(v, field);
  if (n <= 0) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class WeddingRpc {
  constructor(
    private readonly service: WeddingService,
    private readonly hall: WeddingHall,
    private readonly ceremony: WeddingCeremony,
    private readonly invites: WeddingInvites,
  ) {}

  @Rpc('bookWeddingHall', { requireCharacter: true, forbidInBattle: true })
  bookWeddingHall(session: Session, args: unknown[]): Promise<null> {
    const o = args[0];
    if (typeof o !== 'object' || o === null) throw RpcException.invalidArgs('book');
    const r = o as Record<string, unknown>;
    const arg: BookWeddingArg = { line: Number(r.line ?? 1), hour: Number(r.hour), minute: Number(r.minute), flag: Number(r.flag ?? 0) };
    return this.service.book(session, arg);
  }

  @Rpc('cancelWeddingHall', { requireCharacter: true, forbidInBattle: true })
  cancelWeddingHall(session: Session): Promise<null> {
    return this.service.cancel(session);
  }

  @Rpc('enterWeddingHall', { requireCharacter: true, forbidInBattle: true })
  enterWeddingHall(session: Session, args: unknown[]): Promise<null> {
    return this.hall.enter(session, positive(args[0], 'cid'));
  }

  @Rpc('changeRing', { requireCharacter: true, forbidInBattle: true })
  changeRing(session: Session): Promise<null> {
    return this.ceremony.changeRing(session);
  }

  @Rpc('useWeddingBag', { requireCharacter: true, forbidInBattle: true })
  useWeddingBag(session: Session, args: unknown[]): Promise<null> {
    return this.invites.useWeddingBag(session, positive(args[0], 'slotId'));
  }

  @Rpc('useRedBag', { requireCharacter: true, forbidInBattle: true })
  useRedBag(session: Session, args: unknown[]): Promise<null> {
    return this.invites.useRedBag(session, positive(args[0], 'slotId'));
  }
}
