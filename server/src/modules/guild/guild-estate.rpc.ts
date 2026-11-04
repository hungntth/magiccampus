// Guild phase B RPCs: bank (getInitGuildSlot, moveGuildItem, dropGuildItem, H5 withdrawGuildItem), extensions (guildLevelUp,
// addMaxGuildMemberNum, addGuildBankSlotNum), buildings (createGuildBuildings, clickBuild, execBuildFunc, constructBuild,
// finishCreate, finishUpgrade, resetConstruction) and skills (developSkill, getGuildPrivateSkillData, addGuildSkill,
// improveGuildSkill). Pushes come from the services (onAddGuildSlot, onDelGuildSlot, onCreateBuild, reloadBuild, onShow*, ...).

import { Injectable } from '@nestjs/common';
import type { BuildMenuItem, BuildingObj, GuildSkillState, GuildSlot } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Rpc } from '../../gateway/rpc.decorator';
import type { Session } from '../../gateway/session';
import { GuildBankService } from './guild-bank.service';
import { GuildBuildService } from './guild-build.service';
import { GuildExtendService } from './guild-extend.service';
import { GuildSkillService } from './guild-skill.service';
import { GuildViewService } from './guild-view.service';

const posInt = (v: unknown, field: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw RpcException.invalidArgs(field);
  return n;
};

@Injectable()
export class GuildEstateRpc {
  constructor(
    private readonly bank: GuildBankService,
    private readonly extend: GuildExtendService,
    private readonly build: GuildBuildService,
    private readonly skills: GuildSkillService,
    private readonly view: GuildViewService,
  ) {}

  @Rpc('getInitGuildSlot', { requireCharacter: true })
  async getInitGuildSlot(session: Session): Promise<Record<string, GuildSlot>> {
    const row = await this.view.memberOf(session.characterId!);
    if (!row) throw RpcException.forbidden('Bạn chưa vào bang!');
    return this.view.slotMap(row.guildId);
  }

  @Rpc('moveGuildItem', { requireCharacter: true, forbidInBattle: true })
  async moveGuildItem(session: Session, args: unknown[]): Promise<null> {
    await this.bank.move(session, posInt(args[0], 'fromSid'), posInt(args[1], 'toSid'));
    return null;
  }

  @Rpc('dropGuildItem', { requireCharacter: true, forbidInBattle: true })
  async dropGuildItem(session: Session, args: unknown[]): Promise<null> {
    await this.bank.drop(session, posInt(args[0], 'slotId'));
    return null;
  }

  /** H5-only (the Flash client has no withdraw path): `withdrawGuildItem(slotId, num)` moves bank stock into the caller's bag. */
  @Rpc('withdrawGuildItem', { requireCharacter: true, forbidInBattle: true })
  withdrawGuildItem(session: Session, args: unknown[]): Promise<number> {
    return this.bank.withdraw(session, posInt(args[0], 'slotId'), posInt(args[1], 'num'));
  }

  @Rpc('guildLevelUp', { requireCharacter: true, forbidInBattle: true })
  async guildLevelUp(session: Session, args: unknown[]): Promise<null> {
    await this.build.levelUp(session, posInt(args[args.length - 1], 'gid'));
    return null;
  }

  @Rpc('addMaxGuildMemberNum', { requireCharacter: true, forbidInBattle: true })
  async addMaxGuildMemberNum(session: Session, args: unknown[]): Promise<null> {
    await this.extend.addMembers(session, posInt(args[args.length - 1], 'gid'));
    return null;
  }

  @Rpc('addGuildBankSlotNum', { requireCharacter: true, forbidInBattle: true })
  async addGuildBankSlotNum(session: Session, args: unknown[]): Promise<null> {
    await this.extend.addBankPage(session, posInt(args[args.length - 1], 'gid'));
    return null;
  }

  @Rpc('createGuildBuildings', { requireCharacter: true })
  createGuildBuildings(session: Session): Promise<BuildingObj[]> {
    return this.build.list(session);
  }

  @Rpc('clickBuild', { requireCharacter: true })
  clickBuild(session: Session, args: unknown[]): Promise<BuildMenuItem[]> {
    return this.build.menu(session, posInt(args[0], 'buildId'));
  }

  @Rpc('execBuildFunc', { requireCharacter: true })
  async execBuildFunc(session: Session, args: unknown[]): Promise<null> {
    if (typeof args[0] !== 'string') throw RpcException.invalidArgs('func');
    await this.build.exec(session, args[0], posInt(args[1], 'bid'));
    return null;
  }

  @Rpc('constructBuild', { requireCharacter: true, forbidInBattle: true })
  async constructBuild(session: Session, args: unknown[]): Promise<null> {
    await this.build.construct(session, posInt(args[0], 'buildId'), posInt(args[1], 'templateId'), Number(args[2]), Number(args[3]));
    return null;
  }

  @Rpc('finishCreate', { requireCharacter: true, forbidInBattle: true })
  async finishCreate(session: Session, args: unknown[]): Promise<null> {
    await this.build.finish(session, posInt(args[0], 'buildId'), true);
    return null;
  }

  @Rpc('finishUpgrade', { requireCharacter: true, forbidInBattle: true })
  async finishUpgrade(session: Session, args: unknown[]): Promise<null> {
    await this.build.finish(session, posInt(args[0], 'buildId'), false);
    return null;
  }

  @Rpc('resetConstruction', { requireCharacter: true, forbidInBattle: true })
  async resetConstruction(session: Session, args: unknown[]): Promise<null> {
    await this.build.reset(session, posInt(args[args.length - 1], 'buildId'));
    return null;
  }

  @Rpc('developSkill', { requireCharacter: true, forbidInBattle: true })
  async developSkill(session: Session, args: unknown[]): Promise<Record<string, number>> {
    const o = args[args.length - 1];
    if (typeof o !== 'object' || o === null) throw RpcException.invalidArgs('args');
    const a = o as Record<string, unknown>;
    return this.skills.develop(session, posInt(a.gid, 'gid'), posInt(a.sid, 'sid'));
  }

  @Rpc('getGuildPrivateSkillData', { requireCharacter: true })
  getGuildPrivateSkillData(session: Session): Promise<GuildSkillState> {
    return this.skills.stateOf(session.characterId!);
  }

  @Rpc('addGuildSkill', { requireCharacter: true, forbidInBattle: true })
  addGuildSkill(session: Session, args: unknown[]): Promise<{ id: number; level: number }> {
    return this.skills.learn(session, posInt(args[args.length - 1], 'skillId'));
  }

  @Rpc('improveGuildSkill', { requireCharacter: true, forbidInBattle: true })
  improveGuildSkill(session: Session, args: unknown[]): Promise<{ id: number; level: number }> {
    return this.skills.learn(session, posInt(args[args.length - 1], 'skillId'));
  }
}
