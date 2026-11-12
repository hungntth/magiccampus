// Team-room RPCs (legacy names): createRoom, getRoomList, getMyRoom, applyToRoom, acceptRoomApply, kickRoomMember, leaveRoom,
// setRoomHost, setRoomConfig, plus the group leftovers groupListOfMap, getGroupMemberPosistion (sic), getCharLeaderClient,
// reqAddGroup, groupReqSuccNotice. Logic is in RoomService / GroupExtrasService; pushes are listed in room.service.ts.

import { Injectable } from '@nestjs/common';
import type { CreateRoomArg, GroupListReply, GroupMemberPos, MyRoomReply, RoomListReply, SetRoomConfigArg } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { GroupExtrasService } from './group-extras.service';
import { PartyService } from './party.service';
import { RoomService } from './room.service';

function intArg(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw RpcException.invalidArgs(field);
  return n;
}

function idArg(value: unknown, field: string): number {
  const n = intArg(value, field);
  if (n <= 0) throw RpcException.invalidArgs(field);
  return n;
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw RpcException.invalidArgs(field);
  return value as Record<string, unknown>;
}

function createArg(raw: unknown): CreateRoomArg {
  const o = record(raw, 'room');
  return {
    minLevel: intArg(o.minLevel, 'minLevel'), maxLevel: intArg(o.maxLevel, 'maxLevel'), fid: intArg(o.fid, 'fid'),
    type: intArg(o.type, 'type'), hour: intArg(o.hour, 'hour'), minute: intArg(o.minute, 'minute'),
  };
}

function configArg(raw: unknown): SetRoomConfigArg {
  const o = record(raw, 'config');
  const out: SetRoomConfigArg = {};
  if (o.minLevel !== undefined) out.minLevel = intArg(o.minLevel, 'minLevel');
  if (o.maxLevel !== undefined) out.maxLevel = intArg(o.maxLevel, 'maxLevel');
  if (o.fid !== undefined) out.fid = intArg(o.fid, 'fid');
  if (o.type !== undefined) out.type = intArg(o.type, 'type');
  if (o.time !== undefined) {
    const t = record(o.time, 'time');
    out.time = { hour: intArg(t.hour, 'hour'), minute: intArg(t.minute, 'minute') };
  }
  if (Object.keys(out).length === 0) throw RpcException.invalidArgs('config');
  return out;
}

@Injectable()
export class RoomRpc {
  constructor(
    private readonly rooms: RoomService,
    private readonly extras: GroupExtrasService,
    private readonly party: PartyService,
  ) {}

  @Rpc('createRoom', { requireCharacter: true, forbidInBattle: true })
  createRoom(session: Session, args: unknown[]): Promise<number> {
    return this.rooms.create(session, createArg(args[0]));
  }

  @Rpc('getRoomList', { requireCharacter: true })
  getRoomList(session: Session): Promise<RoomListReply> {
    return this.rooms.list(session);
  }

  @Rpc('getMyRoom', { requireCharacter: true })
  getMyRoom(session: Session): Promise<MyRoomReply> {
    return this.rooms.mine(session);
  }

  @Rpc('applyToRoom', { requireCharacter: true, forbidInBattle: true })
  async applyToRoom(session: Session, args: unknown[]): Promise<null> {
    await this.rooms.apply(session, idArg(args[0], 'roomNo'));
    return null;
  }

  @Rpc('acceptRoomApply', { requireCharacter: true })
  async acceptRoomApply(session: Session, args: unknown[]): Promise<null> {
    await this.rooms.accept(session, idArg(args[0], 'cid'));
    return null;
  }

  @Rpc('kickRoomMember', { requireCharacter: true })
  async kickRoomMember(session: Session, args: unknown[]): Promise<null> {
    await this.rooms.kick(session, idArg(args[0], 'cid'));
    return null;
  }

  @Rpc('leaveRoom', { requireCharacter: true })
  async leaveRoom(session: Session): Promise<null> {
    await this.rooms.leave(session);
    return null;
  }

  @Rpc('setRoomHost', { requireCharacter: true })
  setRoomHost(session: Session, args: unknown[]): Promise<boolean> {
    return this.rooms.setHost(session, idArg(args[0], 'cid'));
  }

  @Rpc('setRoomConfig', { requireCharacter: true })
  async setRoomConfig(session: Session, args: unknown[]): Promise<null> {
    await this.rooms.setConfig(session, configArg(args[0]));
    return null;
  }

  @Rpc('groupListOfMap', { requireCharacter: true })
  groupListOfMap(_session: Session, args: unknown[]): Promise<GroupListReply> {
    return this.extras.groupsOfMap(intArg(args[0], 'mapId'));
  }

  @Rpc('getGroupMemberPosistion', { requireCharacter: true })
  getGroupMemberPosistion(session: Session, args: unknown[]): Promise<GroupMemberPos> {
    return this.extras.memberPosition(session, idArg(args[0], 'cid'));
  }

  @Rpc('getCharLeaderClient', { requireCharacter: true })
  getCharLeaderClient(_session: Session, args: unknown[]): boolean {
    return this.extras.isLeader(idArg(args[0], 'cid'));
  }

  /** Never called by Flash; forwards to groupRequest so nobody joins without the leader's approval. */
  @Rpc('reqAddGroup', { requireCharacter: true, forbidInBattle: true })
  async reqAddGroup(session: Session, args: unknown[]): Promise<null> {
    await this.party.request(session, idArg(args[0], 'leaderCid'));
    return null;
  }

  @Rpc('groupReqSuccNotice', { requireCharacter: true })
  groupReqSuccNotice(): null {
    return null;
  }
}
