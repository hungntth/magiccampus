// Guild RPCs (phase A): initViewGuildP, initGuildList, getGuildMemberList, addGuild, addGuildMember, confirmGuildApply,
// refuseGuildMember, kickGuildMember, quitGuild, updateGuildMember, demiseTo, delGuild, updateGuildNotice, changeGuildName,
// updateGuildRank, contribMoney, contribMaterial. Pushes: see GuildService / GuildMemberService / GuildContribService.

import { Injectable } from '@nestjs/common';
import type { GuildInfo, GuildMember } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { GuildContribService } from './guild-contrib.service';
import { GuildMemberService } from './guild-member.service';
import { GuildService } from './guild.service';

const posInt = (v: unknown, field: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(field);
  return n;
};
const obj = (v: unknown, field: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null) throw RpcException.invalidArgs(field);
  return v as Record<string, unknown>;
};
const text = (v: unknown, field: string): string => {
  if (typeof v !== 'string') throw RpcException.invalidArgs(field);
  return v;
};

@Injectable()
export class GuildRpc {
  constructor(
    private readonly guilds: GuildService,
    private readonly members: GuildMemberService,
    private readonly contrib: GuildContribService,
  ) {}

  @Rpc('initViewGuildP', { requireCharacter: true })
  async initViewGuildP(session: Session): Promise<null> {
    await this.guilds.sendPanel(session);
    return null;
  }

  @Rpc('initGuildList', { requireCharacter: true })
  async initGuildList(session: Session): Promise<null> {
    await this.guilds.sendList(session);
    return null;
  }

  @Rpc('getGuildMemberList', { requireCharacter: true })
  getGuildMemberList(session: Session): Promise<Record<string, GuildMember>> {
    return this.guilds.memberMap(session.characterId!);
  }

  @Rpc('addGuild', { requireCharacter: true, forbidInBattle: true })
  addGuild(session: Session, args: unknown[]): Promise<GuildInfo> {
    return this.guilds.create(session, text(obj(args[0], 'name').name, 'name'));
  }

  @Rpc('addGuildMember', { requireCharacter: true })
  async addGuildMember(session: Session, args: unknown[]): Promise<null> {
    await this.members.apply(session, posInt(obj(args[0], 'gid').gid, 'gid'));
    return null;
  }

  @Rpc('confirmGuildApply', { requireCharacter: true })
  async confirmGuildApply(session: Session, args: unknown[]): Promise<null> {
    await this.members.confirm(session, posInt(obj(args[0], 'tableId').tableId, 'tableId'));
    return null;
  }

  @Rpc('refuseGuildMember', { requireCharacter: true })
  async refuseGuildMember(session: Session, args: unknown[]): Promise<null> {
    await this.members.refuse(session, posInt(args[0], 'tableId'));
    return null;
  }

  @Rpc('kickGuildMember', { requireCharacter: true })
  async kickGuildMember(session: Session, args: unknown[]): Promise<null> {
    await this.members.kick(session, posInt(args[0], 'tableId'));
    return null;
  }

  @Rpc('quitGuild', { requireCharacter: true })
  async quitGuild(session: Session, args: unknown[]): Promise<null> {
    await this.members.quit(session, posInt(args[0], 'tableId'));
    return null;
  }

  @Rpc('updateGuildMember', { requireCharacter: true })
  async updateGuildMember(session: Session, args: unknown[]): Promise<null> {
    const o = obj(args[0], 'update');
    if (o.updateType !== 'rank') throw RpcException.invalidArgs('updateType');
    await this.members.setRank(session, posInt(o.tableId, 'tableId'), Number(o.newData));
    return null;
  }

  @Rpc('demiseTo', { requireCharacter: true })
  async demiseTo(session: Session, args: unknown[]): Promise<null> {
    await this.guilds.demise(session, posInt(args[0], 'newLeaderId'));
    return null;
  }

  @Rpc('delGuild', { requireCharacter: true })
  async delGuild(session: Session): Promise<null> {
    await this.guilds.disband(session);
    return null;
  }

  @Rpc('updateGuildNotice', { requireCharacter: true })
  async updateGuildNotice(session: Session, args: unknown[]): Promise<null> {
    await this.guilds.setNotice(session, posInt(args[0], 'gid'), text(args[1], 'text'));
    return null;
  }

  @Rpc('changeGuildName', { requireCharacter: true })
  async changeGuildName(session: Session, args: unknown[]): Promise<null> {
    await this.guilds.rename(session, text(args[0], 'name'));
    return null;
  }

  @Rpc('updateGuildRank', { requireCharacter: true })
  async updateGuildRank(session: Session, args: unknown[]): Promise<null> {
    await this.guilds.setRanks(session, args[0]);
    return null;
  }

  @Rpc('contribMoney', { requireCharacter: true, forbidInBattle: true })
  contribMoney(session: Session, args: unknown[]): Promise<null> {
    return this.contrib.contribMoney(session, args[0]);
  }

  @Rpc('contribMaterial', { requireCharacter: true, forbidInBattle: true })
  async contribMaterial(session: Session, args: unknown[]): Promise<number> {
    const o = obj(args[args.length - 1], 'args');
    return this.contrib.contribMaterial(session, posInt(o.num, 'num'), posInt(o.slotId, 'slotId'));
  }
}
