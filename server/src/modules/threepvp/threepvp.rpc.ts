// 3v3 Chiến Trường Dũng Sĩ RPCs (legacy names): checkPVPLine, initPVPRoom, getLastPVPRank, createPVPRoom, addPVPGroup, quickEnterRoom,
// leavePVPRoom, leftPVPGroup, PVPKickByLeader, updatePVPGroupLimit, updatePVPGroupPass, readyOrStartPVP, quickInvite, sureInvite, plus the GM
// test window gmThreePvp(minutes) (and the H5 dev helper gmThreePvpStop). Refusals are onMidNote + a null reply. Logic is in the services.

import { Injectable } from '@nestjs/common';
import type { LastPvpRankRow, PvpRoom, PvpRoomMap } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { ThreePvpProgressService } from './threepvp-progress.service';
import { ThreePvpRoomsService } from './threepvp-rooms.service';
import { ThreePvpRunService, type RunStatus } from './threepvp-run.service';

function idArg(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(field);
  return n;
}

@Injectable()
export class ThreePvpRpc {
  constructor(
    private readonly rooms: ThreePvpRoomsService,
    private readonly progress: ThreePvpProgressService,
    private readonly run: ThreePvpRunService,
  ) {}

  @Rpc('checkPVPLine', { requireCharacter: true })
  checkPVPLine(session: Session): Promise<boolean> {
    return this.rooms.checkLine(session);
  }

  @Rpc('initPVPRoom', { requireCharacter: true, forbidInBattle: true })
  initPVPRoom(session: Session): Promise<PvpRoomMap | null> {
    return this.rooms.enter(session);
  }

  @Rpc('getLastPVPRank', { requireCharacter: true })
  getLastPVPRank(): Promise<LastPvpRankRow[]> {
    return this.progress.lastRank();
  }

  @Rpc('createPVPRoom', { requireCharacter: true, forbidInBattle: true })
  createPVPRoom(session: Session): Promise<PvpRoom | null> {
    return this.rooms.create(session);
  }

  /** `args[1]` (leaderId) is ignored, as in Go. */
  @Rpc('addPVPGroup', { requireCharacter: true, forbidInBattle: true })
  addPVPGroup(session: Session, args: unknown[]): Promise<PvpRoom | null> {
    return this.rooms.join(session, idArg(args[0], 'roomId'), args[2]);
  }

  @Rpc('quickEnterRoom', { requireCharacter: true, forbidInBattle: true })
  quickEnterRoom(session: Session, args: unknown[]): Promise<PvpRoom | null> {
    return this.rooms.join(session, idArg(args[0], 'roomId'), args[1]);
  }

  @Rpc('leavePVPRoom', { requireCharacter: true })
  async leavePVPRoom(session: Session): Promise<null> {
    await this.rooms.leave(session);
    return null;
  }

  @Rpc('leftPVPGroup', { requireCharacter: true, forbidInBattle: true })
  leftPVPGroup(session: Session): Promise<PvpRoomMap | null> {
    return this.rooms.leftGroup(session);
  }

  @Rpc('PVPKickByLeader', { requireCharacter: true, forbidInBattle: true })
  async pvpKickByLeader(session: Session, args: unknown[]): Promise<null> {
    await this.rooms.kick(session, idArg(args[0], 'cid'));
    return null;
  }

  @Rpc('updatePVPGroupLimit', { requireCharacter: true, forbidInBattle: true })
  updatePVPGroupLimit(session: Session, args: unknown[]): null {
    this.rooms.setLimit(session, args[0], args[1]);
    return null;
  }

  @Rpc('updatePVPGroupPass', { requireCharacter: true, forbidInBattle: true })
  updatePVPGroupPass(session: Session, args: unknown[]): null {
    this.rooms.setPass(session, args[0]);
    return null;
  }

  @Rpc('readyOrStartPVP', { requireCharacter: true })
  readyOrStartPVP(session: Session): null {
    this.rooms.ready(session);
    return null;
  }

  @Rpc('quickInvite', { requireCharacter: true, forbidInBattle: true })
  async quickInvite(session: Session): Promise<null> {
    await this.rooms.invite(session);
    return null;
  }

  @Rpc('sureInvite', { requireCharacter: true, forbidInBattle: true })
  async sureInvite(session: Session, args: unknown[]): Promise<null> {
    const answer = Number(args[2]);
    if (answer !== 1 && answer !== -1) throw RpcException.invalidArgs('answer');
    await this.rooms.answerInvite(session, idArg(args[0], 'inviterCid'), idArg(args[1], 'roomId'), answer);
    return null;
  }

  /** GM test window (`requireGm`): fighting starts now and lasts `minutes` (default 15, at least 5). */
  @Rpc('gmThreePvp', { requireCharacter: true, requireGm: true })
  gmThreePvp(_session: Session, args: unknown[]): Promise<RunStatus> {
    return this.run.gmOpen(args[0]);
  }

  /** H5 dev helper (`requireGm`): ends the running window now; it settles when the arena battles are over. */
  @Rpc('gmThreePvpStop', { requireCharacter: true, requireGm: true })
  async gmThreePvpStop(): Promise<RunStatus | null> {
    return this.run.gmStop();
  }
}
