// Guild skills: the leader develops levels with guild exp + money (developSkill), members learn them with personal contribution
// (addGuildSkill / improveGuildSkill, cost_guild_contrib paid from normal then donate points) up to the developed level and
// the guild level. The passive effect is applied by stats/guild-skill-bonus.service (buff pipeline). Pushes:
// onGuildSkillDeveloped({gid, sid, skillDevData}) to members, onUpdateNumProp (negative deltas) and onUPP (stat refresh) to the learner.

import { Injectable } from '@nestjs/common';
import {
  GuildNumProp, GuildRank, developError, learnError, spendContribution,
  type GuildSkillCatalogEntry, type GuildSkillRow, type GuildSkillState,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterStatsService } from '../stats/character-stats.service';
import { withGuildLock } from './guild-lock';
import { GuildViewService } from './guild-view.service';
import type { GuildMemberDocument } from './guild.schema';

const NO_GUILD = 'Bạn chưa vào bang!';
const LEADER_ONLY = 'Chỉ có bang chủ mới có thể tiến hành thao tác này';

@Injectable()
export class GuildSkillService {
  private catalogCache: GuildSkillCatalogEntry[] | null = null;

  constructor(
    private readonly view: GuildViewService,
    private readonly characters: CharacterService,
    private readonly gameData: GameDataService,
    private readonly stats: CharacterStatsService,
  ) {}

  private catalog(): GuildSkillCatalogEntry[] {
    this.catalogCache ??= [...this.gameData.guildSkillChains()].map(([chain, rows]) => ({
      chain, name: rows[0].name, iconCode: rows[0].iconCode,
      levels: rows.map((r) => ({
        sid: r.id, level: r.level, devExp: r.devExp, devMoney: r.devMoney, contrib: r.contrib, reqLevel: r.reqLevel, description: r.description,
      })),
    }));
    return this.catalogCache;
  }

  private sidOf(chain: string, level: number): number | undefined {
    return this.gameData.guildSkillChains().get(chain)?.find((r) => r.level === level)?.id;
  }

  private async member(cid: number): Promise<GuildMemberDocument> {
    const m = await this.view.memberOf(cid);
    if (!m) throw RpcException.forbidden(NO_GUILD);
    return m;
  }

  /** `getGuildPrivateSkillData` reply and the `onShowGuildSkillPanel` payload. */
  async stateOf(cid: number): Promise<GuildSkillState> {
    const m = await this.member(cid);
    const guild = await this.view.guilds.findById(m.guildId);
    if (!guild) throw RpcException.forbidden(NO_GUILD);
    const learned: Record<string, number> = {};
    for (const s of m.skills) learned[String(s.sid)] = s.level;
    return { gid: guild._id, skillDevData: this.view.skillDevData(guild), learned, catalog: this.catalog() };
  }

  /** `developSkill({gid, sid})`: leader only; sid is the next undeveloped level of its chain. */
  async develop(session: Session, gid: number, sid: number): Promise<GuildSkillState['skillDevData']> {
    const mine = await this.member(session.characterId!);
    if (mine.rank !== GuildRank.LEADER) throw RpcException.forbidden(LEADER_ONLY);
    if (mine.guildId !== gid) throw RpcException.invalidArgs('gid');
    const row = this.gameData.guildSkillRow(sid);
    const data = await withGuildLock(gid, async () => {
      const guild = await this.view.guilds.findById(gid);
      if (!guild) throw RpcException.forbidden(NO_GUILD);
      const err = developError({
        row, guildLevel: guild.level, developedLevel: row ? (this.view.devLevels(guild)[row.chain] ?? 0) : 0, guildExp: guild.exp, guildMoney: guild.money,
      });
      if (err || !row) throw RpcException.forbidden(err ?? 'Kỹ năng không tồn tại');
      const paid = await this.view.guilds.updateOne({ _id: gid, money: { $gte: row.devMoney }, exp: { $gte: row.devExp } }, { $inc: { money: -row.devMoney, exp: -row.devExp } });
      if (paid.modifiedCount !== 1) throw RpcException.forbidden('Tiền hoặc kinh nghiệm bang hội không đủ');
      const set = await this.view.guilds.updateOne({ _id: gid, 'skills.chain': row.chain }, { $set: { 'skills.$.level': row.level, 'skills.$.sid': row.id } });
      if (set.matchedCount === 0) await this.view.guilds.updateOne({ _id: gid }, { $push: { skills: { chain: row.chain, sid: row.id, level: row.level } } });
      const fresh = await this.view.guilds.findById(gid);
      return fresh ? this.view.skillDevData(fresh) : {};
    });
    if (row?.devMoney) await this.view.toMembers(gid, 'onUpdateNumProp', { type: GuildNumProp.MONEY, num: -row.devMoney, cid: 0 });
    if (row?.devExp) await this.view.toMembers(gid, 'onUpdateNumProp', { type: GuildNumProp.EXP, num: -row.devExp, cid: 0 });
    await this.view.toMembers(gid, 'onGuildSkillDeveloped', { gid, sid, skillDevData: data });
    await this.refreshGuild(gid);
    return data;
  }

  /** `addGuildSkill(sid)` (level 1) / `improveGuildSkill(sid)` (next level): member contribution pays; stats refresh on success. */
  async learn(session: Session, sid: number): Promise<{ id: number; level: number }> {
    const cid = session.characterId!;
    const row = this.gameData.guildSkillRow(sid);
    const got = await withCharLock(cid, async () => {
      const m = await this.member(cid);
      const guild = await this.view.guilds.findById(m.guildId);
      if (!guild) throw RpcException.forbidden(NO_GUILD);
      const c = await this.characters.getById(cid);
      const learnedLevel = row ? (m.skills.find((s) => s.chain === row.chain)?.level ?? 0) : 0;
      const err = learnError({
        row, guildLevel: guild.level, developedLevel: row ? (this.view.devLevels(guild)[row.chain] ?? 0) : 0, learnedLevel,
        contribTotal: m.normalContrib + m.donateContrib, charLevel: c.level, classId: c.classId,
      });
      if (err || !row) throw RpcException.forbidden(err ?? 'Kỹ năng không tồn tại');
      const pay = spendContribution(m.normalContrib, m.donateContrib, row.contrib);
      if (!pay) throw RpcException.forbidden('Điểm cống hiến không đủ');
      const paid = await this.view.members.updateOne(
        { _id: m._id, normalContrib: { $gte: pay.normal }, donateContrib: { $gte: pay.donate } },
        { $inc: { normalContrib: -pay.normal, donateContrib: -pay.donate } },
      );
      if (paid.modifiedCount !== 1) throw RpcException.forbidden('Điểm cống hiến vừa thay đổi, hãy thử lại');
      await this.store(m, row);
      if (pay.normal > 0) session.callback('onUpdateNumProp', { type: GuildNumProp.NORMAL, num: -pay.normal, cid });
      if (pay.donate > 0) session.callback('onUpdateNumProp', { type: GuildNumProp.DONATE, num: -pay.donate, cid });
      return { id: sid, level: row.level };
    });
    await this.stats.refreshPush(session);
    return got;
  }

  private async store(m: GuildMemberDocument, row: GuildSkillRow): Promise<void> {
    const set = await this.view.members.updateOne({ _id: m._id, 'skills.chain': row.chain }, { $set: { 'skills.$.level': row.level, 'skills.$.sid': row.id } });
    if (set.matchedCount === 0) await this.view.members.updateOne({ _id: m._id }, { $push: { skills: { chain: row.chain, sid: row.id, level: row.level } } });
  }

  /** Stat refresh for a character whose guild skill effects may have changed (join, leave, kick, disband); no-op when offline. */
  async refreshStatsOf(cid: number): Promise<void> {
    const s = this.view.sessionOf(cid);
    if (s) await this.stats.refreshPush(s);
  }

  /** Stat refresh for every online member of the guild (a develop can raise the effective level of restored skills). */
  async refreshGuild(gid: number): Promise<void> {
    for (const s of await this.view.onlineMembers(gid)) await this.stats.refreshPush(s);
  }
}
