// Guild lifecycle: create (spend first), disband, rename, notice, rank permissions, leader transfer, snapshot / list pushes.
// Leader-only: rename, disband, rank settings, demise. Notice needs canInfo. Pushes use the GuildPanel.as consumer names.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  GuildLimits, GuildRank, defaultRankRows, guildNameError, parseRankUpdate, rankCan, rankRowsToPayload,
  type DemisePush, type GuildInfo, type GuildMember,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { AchievementEvents } from '../achievement/achievement-events.service';
import { Counter } from '../character/counter.schema';
import { GuildMemberService } from './guild-member.service';
import { GuildSkillService } from './guild-skill.service';
import { chooseCreateWallet, createGate } from './guild-rules';
import { GuildViewService } from './guild-view.service';

const LEADER_ONLY = 'Bạn không phải bang chủ, không thể thay đổi thiết lập quyền hạn';
const NO_GUILD = 'Bạn chưa vào bang!';
const dup = (e: unknown): boolean => (e as { code?: number }).code === 11000;

@Injectable()
export class GuildService {
  constructor(
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly view: GuildViewService,
    private readonly membership: GuildMemberService,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
    private readonly skills: GuildSkillService,
    private readonly achievements: AchievementEvents,
  ) {}

  /** `initViewGuildP`: the answer is the onInitViewGuildP push. */
  async sendPanel(session: Session): Promise<void> {
    session.callback('onInitViewGuildP', await this.view.panel(session.characterId!));
  }

  async sendList(session: Session): Promise<void> {
    session.callback('onInitGuildList', await this.view.listEntries());
  }

  /** `getGuildMemberList` reply: member table id -> member. */
  async memberMap(cid: number): Promise<Record<string, GuildMember>> {
    return (await this.view.panel(cid)).memberList;
  }

  /** `addGuild({name})`: gates, spend the 1 000 000 silver (one wallet), then create guild + leader row; refund on any failure. */
  async create(session: Session, rawName: string): Promise<GuildInfo> {
    const cid = session.characterId!;
    const name = rawName.trim();
    const bad = guildNameError(name);
    if (bad) throw RpcException.forbidden(bad);
    const c = await this.characters.getById(cid);
    const gate = createGate({
      level: c.level, moneyBind: c.moneyBind ?? 0, money: c.money,
      isMember: !!(await this.view.memberOf(cid)), hasApplication: !!(await this.view.appOf(cid)),
      nameTaken: !!(await this.view.guilds.exists({ name })),
    });
    if (gate) throw RpcException.forbidden(gate);
    const key = chooseCreateWallet(c.moneyBind ?? 0, c.money)!;
    const total = await this.characters.spendMoney(cid, key, GuildLimits.CREATE_COST);
    if (total === null) throw RpcException.forbidden('Bạc không đủ, không thể tạo!');
    const refund = (): Promise<number> => this.characters.addMoney(cid, key, GuildLimits.CREATE_COST);
    let guildId = 0;
    try {
      const g = await this.view.guilds.create({
        _id: await this.nextGuildId(), name, leaderCid: cid, memLimit: GuildLimits.START_MEMBERS, rankSettings: defaultRankRows(),
      });
      guildId = g._id;
      const restore = await this.membership.takeRestore(cid);
      await this.view.members.create({
        _id: await this.membership.nextRowId(), guildId, cid, rank: GuildRank.LEADER, normalContrib: restore.normal, donateContrib: restore.donate,
        skills: restore.skills,
      });
      session.callback('onUPP', { [key]: total });
      this.achievements.record(cid, 'guildJoined', { value: 1 });
      this.scenes.broadcastAll('onAddGuild', [await this.view.listEntry(g)]);
      await this.sendPanel(session);
      return this.view.guildDto(g);
    } catch (e) {
      if (guildId) await this.view.guilds.deleteOne({ _id: guildId });
      await refund();
      if (dup(e)) throw RpcException.forbidden('Tên bang bạn điền đã tồn tại, vui lòng điền lại!');
      throw e;
    }
  }

  private async leaderGuild(cid: number): Promise<{ id: number; name: string }> {
    const row = await this.view.memberOf(cid);
    if (!row) throw RpcException.forbidden(NO_GUILD);
    if (row.rank !== GuildRank.LEADER) throw RpcException.forbidden(LEADER_ONLY);
    const g = await this.view.guilds.findById(row.guildId);
    if (!g) throw RpcException.forbidden(NO_GUILD);
    return { id: g._id, name: g.name };
  }

  /** `delGuild`: leader only; every member's contribution is parked (90 %), applications are dropped, onDelGuild goes to everyone. */
  async disband(session: Session): Promise<void> {
    const { id } = await this.leaderGuild(session.characterId!);
    const rows = await this.view.members.find({ guildId: id });
    await this.view.members.deleteMany({ guildId: id });
    await this.view.apps.deleteMany({ guildId: id });
    await this.view.guilds.deleteOne({ _id: id });
    await Promise.all([this.view.bankSlots.deleteMany({ guildId: id }), this.view.buildings.deleteMany({ guildId: id })]);
    for (const m of rows) await this.membership.park(m.cid, { normal: m.normalContrib, donate: m.donateContrib }, m.skills);
    this.scenes.broadcastAll('onDelGuild', [id]);
    for (const m of rows) await this.skills.refreshStatsOf(m.cid);
  }

  /** `changeGuildName(name)`: leader only, unique, same 2..10 rule; free (Go charged nothing). */
  async rename(session: Session, rawName: string): Promise<void> {
    const { id } = await this.leaderGuild(session.characterId!);
    const name = rawName.trim();
    const bad = guildNameError(name);
    if (bad) throw RpcException.forbidden(bad);
    try {
      await this.view.guilds.updateOne({ _id: id }, { $set: { name } });
    } catch (e) {
      if (dup(e)) throw RpcException.forbidden('Tên bang bạn điền đã tồn tại, vui lòng điền lại!');
      throw e;
    }
    await this.view.toMembers(id, 'onChangeGuildName', name);
    this.scenes.broadcastAll('onUpdateGuild', [id, 'name', name]);
  }

  /** `updateGuildNotice(gid, text)`: needs canInfo. */
  async setNotice(session: Session, gid: number, raw: string): Promise<void> {
    const row = await this.view.memberOf(session.characterId!);
    const guild = row && row.guildId === gid ? await this.view.guilds.findById(gid) : null;
    if (!row || !guild) throw RpcException.forbidden(NO_GUILD);
    if (!rankCan(this.view.rankRows(guild), row.rank, 'canInfo')) throw RpcException.forbidden('Bạn không có quyền hạn thay đổi thông báo bang hội!');
    const text = [...raw.trim()].slice(0, GuildLimits.NOTICE_MAX).join('');
    await this.view.guilds.updateOne({ _id: gid }, { $set: { guildInfo: text } });
    await this.view.toMembers(gid, 'onUpdateGuildProperty', { guildInfo: text, announcement: text });
  }

  /** `updateGuildRank(flat keys)`: leader only; rank 1 / 6 fixed. Pushes onUpdateGuildRank(gid, obj) (two args). */
  async setRanks(session: Session, raw: unknown): Promise<void> {
    const { id } = await this.leaderGuild(session.characterId!);
    const guild = await this.view.guilds.findById(id);
    const rows = guild ? parseRankUpdate(raw, this.view.rankRows(guild)) : null;
    if (!guild || !rows) throw RpcException.invalidArgs('rank');
    await this.view.guilds.updateOne({ _id: id }, { $set: { rankSettings: rows } });
    await this.view.toMembers(id, 'onUpdateGuildRank', id, rankRowsToPayload(rows));
  }

  /** `demiseTo(newLeaderCid)`: leader only; the target must be a member (rank 2..6); ranks swap (old leader becomes rank 6). */
  async demise(session: Session, newCid: number): Promise<void> {
    const cid = session.characterId!;
    const { id } = await this.leaderGuild(cid);
    if (newCid === cid) throw RpcException.invalidArgs('newLeaderId');
    const target = await this.view.members.findOne({ guildId: id, cid: newCid });
    if (!target || target.rank === GuildRank.APPLICANT) throw RpcException.notFound('Không tìm thấy thành viên');
    await this.view.members.updateOne({ _id: target._id }, { $set: { rank: GuildRank.LEADER } });
    await this.view.guilds.updateOne({ _id: id }, { $set: { leaderCid: newCid } });
    await this.view.members.updateOne({ guildId: id, cid }, { $set: { rank: GuildRank.MEMBER } });
    const ln = (await this.characters.findByIds([newCid]))[0]?.name ?? '?';
    const push: DemisePush = { gid: id, newCid, oldCid: cid, ln };
    await this.view.toMembers(id, 'onDemise', push);
  }

  private async nextGuildId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('guilds', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
