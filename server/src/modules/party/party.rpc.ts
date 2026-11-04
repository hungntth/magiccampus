// Party RPCs (legacy names): groupInvite, groupJoin, groupReqDeny, groupRequest, groupAdd, groupLeave, groupKick,
// groupGiveLeader, groupAFK, unGroupAFK. Pushes are sent by PartyService (see its header). Logic lives in the service.

import { Injectable } from '@nestjs/common';
import type { GroupAfkReply } from '@mc/shared';
import { Rpc } from '../../gateway/rpc.decorator';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { PartyService } from './party.service';

function cidArg(value: unknown): number {
  const cid = Number(value);
  if (!Number.isInteger(cid) || cid <= 0) throw RpcException.invalidArgs('cid');
  return cid;
}

/** The last numeric argument: Flash sends `(selfCid, targetCid)` for groupRequest while Go read the first one. */
function lastCidArg(args: unknown[]): number {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === 'number' || typeof args[i] === 'string') return cidArg(args[i]);
  }
  throw RpcException.invalidArgs('cid');
}

@Injectable()
export class PartyRpc {
  constructor(private readonly party: PartyService) {}

  @Rpc('groupInvite', { requireCharacter: true, forbidInBattle: true })
  async groupInvite(session: Session, args: unknown[]): Promise<null> {
    await this.party.invite(session, cidArg(args[0]));
    return null;
  }

  @Rpc('groupJoin', { requireCharacter: true, forbidInBattle: true })
  async groupJoin(session: Session, args: unknown[]): Promise<null> {
    await this.party.join(session, cidArg(args[0]));
    return null;
  }

  @Rpc('groupReqDeny', { requireCharacter: true })
  async groupReqDeny(session: Session, args: unknown[]): Promise<null> {
    await this.party.deny(session, cidArg(args[0]));
    return null;
  }

  @Rpc('groupRequest', { requireCharacter: true, forbidInBattle: true })
  async groupRequest(session: Session, args: unknown[]): Promise<null> {
    await this.party.request(session, lastCidArg(args));
    return null;
  }

  @Rpc('groupAdd', { requireCharacter: true })
  groupAdd(session: Session, args: unknown[]): Promise<boolean> {
    return this.party.add(session, cidArg(args[0]));
  }

  @Rpc('groupLeave', { requireCharacter: true })
  async groupLeave(session: Session): Promise<null> {
    await this.party.leave(session);
    return null;
  }

  @Rpc('groupKick', { requireCharacter: true })
  async groupKick(session: Session, args: unknown[]): Promise<null> {
    await this.party.kick(session, cidArg(args[0]));
    return null;
  }

  @Rpc('groupGiveLeader', { requireCharacter: true })
  groupGiveLeader(session: Session, args: unknown[]): Promise<boolean> {
    return this.party.giveLeader(session, cidArg(args[0]));
  }

  @Rpc('groupAFK', { requireCharacter: true })
  groupAFK(session: Session): Promise<GroupAfkReply> {
    return this.party.setAfk(session);
  }

  @Rpc('unGroupAFK', { requireCharacter: true })
  unGroupAFK(session: Session, args: unknown[]): Promise<GroupAfkReply> {
    return this.party.returnFromAfk(session, args[0] === true);
  }
}
