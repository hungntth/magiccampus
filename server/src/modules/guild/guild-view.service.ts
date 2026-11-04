// Guild read side: wire objects (22-key guild, member rows, list entries, the onInitViewGuildP snapshot, login payload) and
// push fan-out helpers (online members, approvers), the bank slot / stock readers and the guild skill maps. Names, levels and
// classes are joined from `characters` at read time.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  GuildRank, ITEM_INSTANCE_TYPE, defaultRankRows, guildSlotSid, rankCan, skillDataMap,
  type GuildBankStock, type GuildSlot, type GuildInfo, type GuildListEntry, type GuildLoginInfo, type GuildMember, type GuildRankRow,
  type InitViewGuildP,
} from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { memberNote } from './guild-rules';
import {
  Guild, GuildApplication, GuildBankSlot, GuildBuilding, GuildMemberRow,
  type GuildApplicationDocument, type GuildDocument, type GuildMemberDocument,
} from './guild.schema';

type Row = Pick<GuildMemberDocument, '_id' | 'guildId' | 'cid' | 'rank' | 'normalContrib' | 'donateContrib'>;

const pad = (n: number): string => String(n).padStart(2, '0');
const stamp = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

@Injectable()
export class GuildViewService {
  constructor(
    @InjectModel(Guild.name) readonly guilds: Model<Guild>,
    @InjectModel(GuildMemberRow.name) readonly members: Model<GuildMemberRow>,
    @InjectModel(GuildApplication.name) readonly apps: Model<GuildApplication>,
    @InjectModel(GuildBankSlot.name) readonly bankSlots: Model<GuildBankSlot>,
    @InjectModel(GuildBuilding.name) readonly buildings: Model<GuildBuilding>,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly scenes: SceneManager,
  ) {}

  memberOf(cid: number): Promise<GuildMemberDocument | null> {
    return this.members.findOne({ cid });
  }

  appOf(cid: number): Promise<GuildApplicationDocument | null> {
    return this.apps.findOne({ cid });
  }

  /** Guild name for showChaInfo ("Không bang hội" when none). */
  async guildNameOf(cid: number): Promise<string> {
    const row = await this.memberOf(cid);
    const g = row ? await this.guilds.findById(row.guildId, { name: 1 }) : null;
    return g?.name ?? 'Không bang hội';
  }

  rankRows(g: Pick<Guild, 'rankSettings'>): GuildRankRow[] {
    return g.rankSettings.length === 6 ? g.rankSettings : defaultRankRows();
  }

  /** Member rows joined with their character (rank override lets an applicant row be shown as rank -1). */
  async memberDtos(rows: readonly Row[], rank?: number): Promise<GuildMember[]> {
    const chars = new Map((await this.characters.findByIds(rows.map((r) => r.cid))).map((c) => [c._id, c]));
    const out: GuildMember[] = [];
    for (const r of rows) {
      const c = chars.get(r.cid);
      if (!c) continue;
      out.push({
        id: r._id, cid: r.cid, gid: r.guildId, rank: rank ?? r.rank, status: this.scenes.findByCharacter(r.cid) ? 1 : 0,
        name: c.name, level: c.level, classId: c.classId, note: memberNote(c.name, c.classId, c.exp),
        normalContrib: r.normalContrib, donateContrib: r.donateContrib,
      });
    }
    return out;
  }

  async guildDto(g: GuildDocument): Promise<GuildInfo> {
    const [leader, count] = await Promise.all([
      this.characters.findByIds([g.leaderCid]), this.members.countDocuments({ guildId: g._id }),
    ]);
    return {
      id: g._id, name: g.name, cid: g.leaderCid, ln: leader[0]?.name ?? '?', level: g.level, exp: g.exp, iconCode: null,
      money: g.money, guildInfo: g.guildInfo, bagSlotNum: g.bagPages, memLimit: g.memLimit, dailyProduce: '0', daliyCost: '0',
      moneyLimit: '0', time: stamp((g as unknown as { createdAt?: Date }).createdAt ?? new Date()), timeStamp: null,
      totalExp: g.exp, skillData: JSON.stringify(this.skillDevData(g)), announcement: g.guildInfo, joinLevelReq: 1, memberNumber: count, members: [],
    };
  }

  /** Highest developed level per skill chain. */
  devLevels(g: Pick<Guild, 'skills'>): Record<string, number> {
    return Object.fromEntries(g.skills.map((k) => [k.chain, k.level]));
  }

  /** `{templateId of the developed level: level}` (the `skillDevData` wire shape). */
  skillDevData(g: Pick<Guild, 'skills'>): Record<string, number> {
    return skillDataMap(this.devLevels(g), (chain, level) => this.gameData.guildSkillChains().get(chain)?.find((r) => r.level === level)?.id);
  }

  /** Bank slot rows with their template name / icon. */
  async slotDtos(docs: readonly Pick<GuildBankSlot, '_id' | 'slotIndex' | 'tid' | 'count'>[]): Promise<GuildSlot[]> {
    const tpls = await this.gameData.templatesByIds(29, [...new Set(docs.map((d) => d.tid))]);
    return docs.map((d) => {
      const t = tpls.get(d.tid);
      return {
        id: d._id, sid: guildSlotSid(d.slotIndex), type: ITEM_INSTANCE_TYPE, itemId: d.tid, stackNum: d.count, tid: d.tid,
        name: t?.name ? String(t.name) : `#${d.tid}`, iconCode: t?.icon_code ? String(t.icon_code) : '0',
      };
    });
  }

  /** `getInitGuildSlot` reply / login `gi`: slot id -> slot. */
  async slotMap(guildId: number): Promise<Record<string, GuildSlot>> {
    const docs = await this.bankSlots.find({ guildId }).sort({ slotIndex: 1 });
    return Object.fromEntries((await this.slotDtos(docs)).map((s) => [String(s.id), s]));
  }

  /** Guild material totals per template (donate tab). */
  async stockOf(guildId: number): Promise<GuildBankStock[]> {
    const totals = new Map<number, number>();
    for (const d of await this.bankSlots.find({ guildId }, { tid: 1, count: 1 }).lean()) totals.set(d.tid, (totals.get(d.tid) ?? 0) + d.count);
    return [...totals].filter(([, count]) => count > 0).map(([tid, count]) => ({ tid, count }));
  }

  /** `onInitViewGuildP` snapshot. An applicant sees their own application as the only member row (rank -1). */
  async panel(cid: number): Promise<InitViewGuildP> {
    const empty: InitViewGuildP = { myGuild: null, memberList: {}, guildRank: [], applyList: [], skillDevData: {}, bankStock: [] };
    const mine = await this.memberOf(cid);
    if (!mine) {
      const app = await this.appOf(cid);
      const guild = app ? await this.guilds.findById(app.guildId) : null;
      if (!app || !guild) return empty;
      const [dto, rows] = await Promise.all([this.guildDto(guild), this.memberDtos([{ ...app.toObject(), rank: GuildRank.APPLICANT, normalContrib: 0, donateContrib: 0 }])]);
      return { ...empty, myGuild: dto, memberList: Object.fromEntries(rows.map((m) => [String(m.id), m])), guildRank: this.rankRows(guild) };
    }
    const guild = await this.guilds.findById(mine.guildId);
    if (!guild) return empty;
    const rows = this.rankRows(guild);
    const [dto, members, apps] = await Promise.all([
      this.guildDto(guild),
      this.members.find({ guildId: guild._id }).sort({ rank: 1, _id: 1 }),
      rankCan(rows, mine.rank, 'canAdd') ? this.apps.find({ guildId: guild._id }).sort({ _id: 1 }) : Promise.resolve([]),
    ]);
    const memberList = await this.memberDtos(members);
    const applyList = await this.memberDtos(apps.map((a) => ({ ...a.toObject(), rank: GuildRank.APPLICANT, normalContrib: 0, donateContrib: 0 })));
    return {
      myGuild: dto, memberList: Object.fromEntries(memberList.map((m) => [String(m.id), m])), guildRank: rows, applyList,
      skillDevData: this.skillDevData(guild), bankStock: await this.stockOf(guild._id),
    };
  }

  async listEntries(): Promise<Record<string, GuildListEntry>> {
    const [all, counts] = await Promise.all([
      this.guilds.find().sort({ _id: 1 }),
      this.members.aggregate<{ _id: number; n: number }>([{ $group: { _id: '$guildId', n: { $sum: 1 } } }]),
    ]);
    const n = new Map(counts.map((c) => [c._id, c.n]));
    const leaders = new Map((await this.characters.findByIds(all.map((g) => g.leaderCid))).map((c) => [c._id, c.name]));
    return Object.fromEntries(all.map((g) => [String(g._id), {
      id: g._id, name: g.name, ln: leaders.get(g.leaderCid) ?? '?', cid: g.leaderCid, memberNumber: n.get(g._id) ?? 0,
    }]));
  }

  async listEntry(g: GuildDocument): Promise<GuildListEntry> {
    const dto = await this.guildDto(g);
    return { id: dto.id, name: dto.name, ln: dto.ln, cid: dto.cid, memberNumber: dto.memberNumber };
  }

  /** Login payload extras: own guild, own member row (applicant rows included) and the bank map. */
  async loginInfo(cid: number): Promise<GuildLoginInfo> {
    const p = await this.panel(cid);
    const own = Object.values(p.memberList).find((m) => m.cid === cid) ?? null;
    return { guild: p.myGuild, gData: own, gi: own && p.myGuild && own.rank >= GuildRank.LEADER ? await this.slotMap(p.myGuild.id) : {} };
  }

  /** Sessions of the guild's online members (optionally only those who may approve applicants). */
  async onlineMembers(guildId: number, approversOnly = false): Promise<Session[]> {
    const guild = approversOnly ? await this.guilds.findById(guildId) : null;
    const rows = guild ? this.rankRows(guild) : [];
    const list = await this.members.find({ guildId }, { cid: 1, rank: 1 }).lean();
    const out: Session[] = [];
    for (const m of list) {
      if (approversOnly && !rankCan(rows, m.rank, 'canAdd')) continue;
      const s = this.scenes.findByCharacter(m.cid);
      if (s) out.push(s);
    }
    return out;
  }

  async toMembers(guildId: number, method: string, ...args: unknown[]): Promise<void> {
    for (const s of await this.onlineMembers(guildId)) s.callback(method, ...args);
  }

  async toApprovers(guildId: number, method: string, ...args: unknown[]): Promise<void> {
    for (const s of await this.onlineMembers(guildId, true)) s.callback(method, ...args);
  }

  /** Online session of a character, if any. */
  sessionOf(cid: number): Session | undefined {
    return this.scenes.findByCharacter(cid);
  }
}
