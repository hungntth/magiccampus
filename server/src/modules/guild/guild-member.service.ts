// Guild membership: apply, approve / refuse, kick, quit, appoint, and the 90 % contribution parking / restore.
// Permissions are the rank flags (rankCan); the leader can always act. Refusals throw RpcException.forbidden (client toast).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  GuildLeaveType, GuildRank, rankCan,
  type ConfirmGuildApplyPush, type DelGuildMemberPush, type UpdateGuildMemberPush,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { Counter } from '../character/counter.schema';
import { canAppoint, canKick, mergeParked, parkContribution, type Contribution, type Restore } from './guild-rules';
import { GuildSkillService } from './guild-skill.service';
import { GuildViewService } from './guild-view.service';
import {
  GuildRestore, type GuildMemberDocument, type SkillLevel,
} from './guild.schema';

const NO_RIGHT = 'Bạn không có quyền hạn này!';
const NO_GUILD = 'Bạn chưa vào bang!';
const ONLY_ONE = 'Bạn đã vào bang hoặc đã gửi lời xin vào bang, mỗi người chỉ có thể vào 1 bang!';
const FULL = 'Thành viên bang này đã đầy!';

@Injectable()
export class GuildMemberService {
  constructor(
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    @InjectModel(GuildRestore.name) private readonly restores: Model<GuildRestore>,
    private readonly view: GuildViewService,
    private readonly characters: CharacterService,
    private readonly skills: GuildSkillService,
  ) {}

  async nextRowId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('guild_rows', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }

  /** Contribution parked by an earlier leave, consumed on join (zero when none). */
  async takeRestore(cid: number): Promise<Restore> {
    const r = await this.restores.findOneAndDelete({ _id: cid });
    return { normal: r?.normalContrib ?? 0, donate: r?.donateContrib ?? 0, skills: r?.skills ?? [] };
  }

  /** Parks 90 % of a leaving member's contribution and their learned guild skills (merged with anything already waiting). */
  async park(cid: number, own: Contribution, skills: readonly SkillLevel[] = []): Promise<void> {
    const add = parkContribution(own);
    if (add.normal === 0 && add.donate === 0 && skills.length === 0) return;
    const waiting = await this.restores.findById(cid);
    const sum = mergeParked(waiting ? { normal: waiting.normalContrib, donate: waiting.donateContrib } : null, add);
    const keep = new Map((waiting?.skills ?? []).map((k) => [k.chain, k]));
    for (const k of skills) if ((keep.get(k.chain)?.level ?? 0) < k.level) keep.set(k.chain, { chain: k.chain, sid: k.sid, level: k.level });
    await this.restores.updateOne(
      { _id: cid },
      { $set: { normalContrib: sum.normal, donateContrib: sum.donate, skills: [...keep.values()] } },
      { upsert: true },
    );
  }

  /** `addGuildMember({gid})`: file an application; the applicant and the approvers get onAddGuildMember (rank -1). */
  async apply(session: Session, gid: number): Promise<void> {
    const cid = session.characterId!;
    const guild = await this.view.guilds.findById(gid);
    if (!guild) throw RpcException.notFound('Bang hội không tồn tại');
    if ((await this.view.memberOf(cid)) || (await this.view.appOf(cid))) throw RpcException.forbidden(ONLY_ONE);
    let app;
    try {
      app = await this.view.apps.create({ _id: await this.nextRowId(), guildId: gid, cid });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) throw RpcException.forbidden(ONLY_ONE);
      throw e;
    }
    const [dto] = await this.view.memberDtos([{ ...app.toObject(), rank: GuildRank.APPLICANT, normalContrib: 0, donateContrib: 0 }]);
    session.callback('onAddGuildMember', dto);
    await this.view.toApprovers(gid, 'onAddGuildMember', dto);
  }

  private async actor(session: Session): Promise<{ row: GuildMemberDocument; allowed: (f: 'canAdd' | 'canDel' | 'canDuty') => boolean }> {
    const row = await this.view.memberOf(session.characterId!);
    if (!row) throw RpcException.forbidden(NO_GUILD);
    const guild = await this.view.guilds.findById(row.guildId);
    if (!guild) throw RpcException.forbidden(NO_GUILD);
    const rows = this.view.rankRows(guild);
    return { row, allowed: (f) => rankCan(rows, row.rank, f) };
  }

  /** `confirmGuildApply({tableId, newData: 6})`: needs canAdd; the application row id becomes the member id. */
  async confirm(session: Session, tableId: number): Promise<void> {
    const { row, allowed } = await this.actor(session);
    if (!allowed('canAdd')) throw RpcException.forbidden(NO_RIGHT);
    const guild = await this.view.guilds.findById(row.guildId);
    if (!guild) throw RpcException.forbidden(NO_GUILD);
    if ((await this.view.members.countDocuments({ guildId: guild._id })) >= guild.memLimit) throw RpcException.forbidden(FULL);
    const app = await this.view.apps.findOneAndDelete({ _id: tableId, guildId: guild._id });
    if (!app) throw RpcException.notFound('Lời xin gia nhập không tồn tại');
    const restore = await this.takeRestore(app.cid);
    const member = await this.view.members.create({
      _id: app._id, guildId: guild._id, cid: app.cid, rank: GuildRank.MEMBER, normalContrib: restore.normal, donateContrib: restore.donate,
      skills: restore.skills,
    });
    const [gData] = await this.view.memberDtos([member]);
    const push: ConfirmGuildApplyPush = { gid: guild._id, tableId: app._id, cid: app.cid, gData };
    await this.view.toMembers(guild._id, 'onConfirmGuildApply', push);
    this.view.sessionOf(app.cid)?.callback('onConfirmGuildApply', push);
    await this.skills.refreshStatsOf(app.cid);
  }

  /** `refuseGuildMember(tableId)`: needs canAdd; onDelGuildMember type 3 to the members and the applicant. */
  async refuse(session: Session, tableId: number): Promise<void> {
    const { row, allowed } = await this.actor(session);
    if (!allowed('canAdd')) throw RpcException.forbidden(NO_RIGHT);
    const app = await this.view.apps.findOneAndDelete({ _id: tableId, guildId: row.guildId });
    if (!app) throw RpcException.notFound('Lời xin gia nhập không tồn tại');
    await this.announceLeave(row.guildId, app.cid, app._id, GuildLeaveType.REFUSE);
  }

  /** `kickGuildMember(tableId)`: needs canDel and a strictly lower rank; contribution is parked. */
  async kick(session: Session, tableId: number): Promise<void> {
    const { row, allowed } = await this.actor(session);
    const guild = await this.view.guilds.findById(row.guildId);
    const target = await this.view.members.findOne({ _id: tableId, guildId: row.guildId });
    if (!guild || !target) throw RpcException.notFound('Không tìm thấy thành viên');
    if (!allowed('canDel') || !canKick(this.view.rankRows(guild), row.rank, target.rank)) throw RpcException.forbidden(NO_RIGHT);
    await this.removeMember(target, GuildLeaveType.KICK);
  }

  /** `quitGuild(id)`: id is the caller's member row (leader refused) or their pending application (give up). */
  async quit(session: Session, id: number): Promise<void> {
    const cid = session.characterId!;
    const mine = await this.view.memberOf(cid);
    if (mine && mine._id === id) {
      if (mine.rank === GuildRank.LEADER) throw RpcException.forbidden('Bang chủ không thể rời khỏi bang!');
      await this.removeMember(mine, GuildLeaveType.QUIT);
      return;
    }
    const app = await this.view.apps.findOneAndDelete({ _id: id, cid });
    if (!app) throw RpcException.notFound('Không tìm thấy thành viên');
    await this.announceLeave(app.guildId, cid, app._id, GuildLeaveType.GIVE_UP);
  }

  /** `updateGuildMember({tableId, newData, updateType: 'rank'})`: needs canDuty; see canAppoint. */
  async setRank(session: Session, tableId: number, newRank: number): Promise<void> {
    const { row, allowed } = await this.actor(session);
    const guild = await this.view.guilds.findById(row.guildId);
    const target = await this.view.members.findOne({ _id: tableId, guildId: row.guildId });
    if (!guild || !target) throw RpcException.notFound('Không tìm thấy thành viên');
    if (!allowed('canDuty') || !canAppoint(this.view.rankRows(guild), row.rank, target.rank, newRank)) throw RpcException.forbidden(NO_RIGHT);
    await this.view.members.updateOne({ _id: target._id }, { $set: { rank: newRank } });
    const push: UpdateGuildMemberPush = { tableId: target._id, updateType: 'rank', newData: newRank };
    await this.view.toMembers(guild._id, 'onUpdateGuildMember', push);
  }

  /** Deletes a member row, parks the contribution, tells the guild and the leaver. */
  async removeMember(target: GuildMemberDocument, type: number): Promise<void> {
    const del = await this.view.members.deleteOne({ _id: target._id });
    if (del.deletedCount !== 1) return;
    await this.park(target.cid, { normal: target.normalContrib, donate: target.donateContrib }, target.skills);
    await this.announceLeave(target.guildId, target.cid, target._id, type);
    await this.skills.refreshStatsOf(target.cid);
  }

  private async announceLeave(gid: number, cid: number, id: number, type: number): Promise<void> {
    const name = (await this.characters.findByIds([cid]))[0]?.name ?? '?';
    const push: DelGuildMemberPush = { gid, id, cid, name, type };
    await this.view.toMembers(gid, 'onDelGuildMember', push);
    this.view.sessionOf(cid)?.callback('onDelGuildMember', push);
  }
}
