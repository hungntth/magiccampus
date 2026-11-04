// Guild estate on the guild map 49: lots + buildings (guild_buildings), clickBuild menus, execBuildFunc pushes, constructBuild /
// finishCreate / finishUpgrade / resetConstruction and guildLevelUp (= the main hall upgrade). Costs and prerequisites are the
// data_tbl_building rows (guild money + exp + guild materials 2026 / 2027 / 2039 from the bank); there is no timer. Leader only.
// Pushes to the guild's online members: onCreateBuild(obj) on start, reloadBuild(obj) on finish / reset, onUpdateGuildProperty({level}).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  BuildFunc, BuildMode, BuildTid, GUILD_MAP_ID, GuildMaterial, GuildNumProp, GuildRank, HALL_CHAIN, HALL_LOT,
  constructError, costOf, costShortfall, guildLevelOf, nextLevelRow, unmetPrereqs,
  type BankNeed, type BuildCost, type BuildExtInfo, type BuildMenuItem, type BuildOption, type BuildProcess, type BuildingObj,
  type BuildingRow, type OwnedBuilding,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import type { GuildLot } from '../gamedata/guild-data';
import { GuildBankService } from './guild-bank.service';
import { GuildSkillService } from './guild-skill.service';
import { GuildViewService } from './guild-view.service';
import { GuildBuilding, type GuildDocument } from './guild.schema';

const NO_GUILD = 'Bạn không thuộc bang hội nào';
const LEADER_ONLY = 'Chỉ có bang chủ mới có thể tiến hành thao tác này';
const needsOf = (c: BuildCost): BankNeed[] => [
  { tid: GuildMaterial.GENERAL, count: c.gen }, { tid: GuildMaterial.RARE, count: c.rare }, { tid: GuildMaterial.SPECIAL, count: c.sp },
];

@Injectable()
export class GuildBuildService {
  constructor(
    @InjectModel(GuildBuilding.name) private readonly buildings: Model<GuildBuilding>,
    private readonly view: GuildViewService,
    private readonly bank: GuildBankService,
    private readonly skills: GuildSkillService,
    private readonly gameData: GameDataService,
  ) {}

  private row(id: number): BuildingRow | undefined {
    return this.gameData.guildBuildingRow(id);
  }

  /** Art of a building: the level-1 sheet of its chain (the higher-level SWFs are not in the asset cache). */
  private art(r: BuildingRow | undefined): string {
    if (!r) return '0';
    const base = this.gameData.guildBuildingRows().find((x) => x.chain === r.chain && x.level === 1);
    return base?.resCode ?? r.resCode;
  }

  private toObj(lot: GuildLot, b?: { tid: number; buildState: number }): BuildingObj {
    const tid = b?.tid ?? BuildTid.EMPTY_LOT;
    const r = this.row(tid);
    return {
      id: lot.id, tid, mid: lot.mid, posX: lot.posX, posY: lot.posY, posDir: lot.posDir, layer: b ? 1 : 0, buildState: b?.buildState ?? 0,
      buildType: lot.buildType, name: r?.name ?? '', level: r?.level ?? 0, resCode: tid === BuildTid.IN_BUILDING || !b ? (r?.resCode ?? '0') : this.art(r),
    };
  }

  /** The guild's buildings; the main hall (level 1, no cost) is created on first use. */
  async ownedOf(guildId: number): Promise<{ docs: GuildBuilding[]; owned: OwnedBuilding[] }> {
    const hall = this.gameData.guildBuildingRows().find((r) => r.chain === HALL_CHAIN && r.level === 1);
    if (hall) await this.buildings.updateOne({ guildId, extendId: HALL_LOT }, { $setOnInsert: { tid: hall.id, buildState: 0 } }, { upsert: true });
    const docs = await this.buildings.find({ guildId }).lean();
    return { docs, owned: docs.map((d) => ({ extendId: d.extendId, tid: d.tid, buildState: d.buildState })) };
  }

  private async memberGuild(session: Session): Promise<{ guild: GuildDocument; rank: number }> {
    const row = await this.view.memberOf(session.characterId!);
    const guild = row ? await this.view.guilds.findById(row.guildId) : null;
    if (!row || !guild) throw RpcException.forbidden(NO_GUILD);
    return { guild, rank: row.rank };
  }

  private async leaderGuild(session: Session): Promise<GuildDocument> {
    const { guild, rank } = await this.memberGuild(session);
    if (rank !== GuildRank.LEADER) throw RpcException.forbidden(LEADER_ONLY);
    return guild;
  }

  private async have(guild: Pick<GuildDocument, '_id' | 'money' | 'exp'>): Promise<BuildCost> {
    const rows = await this.bank.rowsOf(guild._id);
    const n = (tid: number): number => rows.reduce((s, r) => (r.tid === tid ? s + r.count : s), 0);
    return { money: guild.money, exp: guild.exp, gen: n(GuildMaterial.GENERAL), rare: n(GuildMaterial.RARE), sp: n(GuildMaterial.SPECIAL) };
  }

  /** `createGuildBuildings`: the lots of the guild map with the caller's guild buildings on them; [] elsewhere or without a guild. */
  async list(session: Session): Promise<BuildingObj[]> {
    if (session.mapId !== GUILD_MAP_ID) return [];
    const mine = await this.view.memberOf(session.characterId!);
    if (!mine) return [];
    const { docs } = await this.ownedOf(mine.guildId);
    const byLot = new Map(docs.map((d) => [d.extendId, d]));
    return this.gameData.guildLots().map((l) => this.toObj(l, byLot.get(l.id)));
  }

  /** `clickBuild(id, type)`: the menu for a lot or building. */
  async menu(session: Session, id: number): Promise<BuildMenuItem[]> {
    const { guild } = await this.memberGuild(session);
    if (!this.gameData.guildLots().some((l) => l.id === id)) throw RpcException.notFound('Công trình không tồn tại');
    const { docs } = await this.ownedOf(guild._id);
    const b = docs.find((d) => d.extendId === id);
    const item = (name: string, func: string): BuildMenuItem => ({ name, func, bid: id });
    if (!b) return [item('Xây dựng', BuildFunc.EXT_INFO)];
    if (b.buildState > 0) return [item('Tiến độ công trình', BuildFunc.PROCESS)];
    const r = this.row(b.tid);
    const out: BuildMenuItem[] = [];
    if (r?.funcScript.includes('showGuildWarehouse')) out.push(item('Kho bang', BuildFunc.WAREHOUSE));
    if (r?.funcScript.includes('showDonatePanel')) out.push(item('Quyên góp', BuildFunc.DONATE));
    if (r?.funcScript.includes('showGuildSkillPanel')) out.push(item('Kỹ năng bang', BuildFunc.SKILL));
    out.push(item(r && nextLevelRow(this.gameData.guildBuildingRows(), r.chain, r.level) ? 'Thăng cấp' : (r?.name ?? 'Thông tin'), BuildFunc.EXT_INFO));
    return out;
  }

  /** `execBuildFunc(func, bid, type)`: opens the matching panel on the caller's client with a push. */
  async exec(session: Session, func: string, bid: number): Promise<void> {
    const { guild } = await this.memberGuild(session);
    if (func === BuildFunc.WAREHOUSE) return void session.callback('onShowGuildWarehouse', bid);
    if (func === BuildFunc.DONATE) return void session.callback('onShowDonatePanel', bid);
    if (func === BuildFunc.SKILL) return void session.callback('onShowGuildSkillPanel', await this.skills.stateOf(session.characterId!));
    const { docs, owned } = await this.ownedOf(guild._id);
    const b = docs.find((d) => d.extendId === bid);
    if (func === BuildFunc.PROCESS) {
      if (!b || b.buildState === 0) throw RpcException.notFound('Không có công trình đang xây');
      return void session.callback('onShowBuildProcess', await this.processOf(guild, b, owned));
    }
    if (func !== BuildFunc.EXT_INFO) throw RpcException.invalidArgs('func');
    session.callback('onShowExtInfo', this.extInfoOf(bid, b, owned));
  }

  private optionOf(r: BuildingRow, mode: number, lot: OwnedBuilding | undefined, owned: OwnedBuilding[]): BuildOption {
    const rowOf = (id: number): BuildingRow | undefined => this.row(id);
    return {
      tid: r.id, name: r.name, description: r.description, cost: costOf(r),
      pre: r.pre.map((id) => ({ id, name: this.row(id)?.name ?? `#${id}`, ok: !unmetPrereqs({ ...r, pre: [id] }, owned, rowOf).length })),
      canBuild: constructError({ mode, lot, target: r, owned, rowOf }) === null,
    };
  }

  private extInfoOf(bid: number, b: { tid: number; buildState: number } | undefined, owned: OwnedBuilding[]): BuildExtInfo {
    const rows = this.gameData.guildBuildingRows();
    const lot = b ? { extendId: bid, tid: b.tid, buildState: b.buildState } : undefined;
    if (!b || !lot) {
      const options = rows.filter((r) => r.type === 1 && r.level === 1 && r.chain !== HALL_CHAIN).map((r) => this.optionOf(r, BuildMode.CREATE, undefined, owned));
      return { bid, mode: BuildMode.CREATE, title: 'Xây dựng', options };
    }
    const cur = this.row(b.tid);
    const next = cur ? nextLevelRow(rows, cur.chain, cur.level) : undefined;
    return { bid, mode: BuildMode.UPGRADE, title: cur?.name ?? '', options: next ? [this.optionOf(next, BuildMode.UPGRADE, lot, owned)] : [] };
  }

  private async processOf(guild: GuildDocument, b: GuildBuilding, owned: OwnedBuilding[]): Promise<BuildProcess> {
    const target = this.row(b.buildState);
    if (!target) throw RpcException.notFound('Công trình không hợp lệ');
    const have = await this.have(guild);
    const ready = costShortfall(costOf(target), have) === null && unmetPrereqs(target, owned, (id) => this.row(id)).length === 0;
    return { bid: b.extendId, create: b.tid === BuildTid.IN_BUILDING, tid: target.id, name: target.name, description: target.description, cost: costOf(target), have, ready };
  }

  /** `constructBuild(buildId, templateId, mode, mapId)`: starts a build / upgrade on a lot (nothing is spent until it finishes). */
  async construct(session: Session, bid: number, tid: number, mode: number, mapId: number): Promise<void> {
    const guild = await this.leaderGuild(session);
    if (mapId !== GUILD_MAP_ID || session.mapId !== GUILD_MAP_ID) throw RpcException.forbidden('Chỉ có thể xây dựng ở bản đồ bang hội');
    const lot = this.gameData.guildLots().find((l) => l.id === bid);
    if (!lot) throw RpcException.notFound('Vị trí xây dựng không tồn tại');
    const { docs, owned } = await this.ownedOf(guild._id);
    const cur = docs.find((d) => d.extendId === bid);
    const err = constructError({ mode, lot: cur && { extendId: bid, tid: cur.tid, buildState: cur.buildState }, target: this.row(tid), owned, rowOf: (id) => this.row(id) });
    if (err) throw RpcException.forbidden(err);
    if (mode === BuildMode.CREATE) {
      try {
        await this.buildings.create({ guildId: guild._id, extendId: bid, tid: BuildTid.IN_BUILDING, buildState: tid });
      } catch (e) {
        if ((e as { code?: number }).code === 11000) throw RpcException.forbidden('Vị trí này đã có công trình');
        throw e;
      }
    } else {
      const r = await this.buildings.updateOne({ guildId: guild._id, extendId: bid, buildState: 0 }, { $set: { buildState: tid } });
      if (r.modifiedCount !== 1) throw RpcException.forbidden('Công trình đang được xây dựng');
    }
    await this.view.toMembers(guild._id, 'onCreateBuild', this.toObj(lot, { tid: mode === BuildMode.CREATE ? BuildTid.IN_BUILDING : cur!.tid, buildState: tid }));
  }

  /** `finishCreate` / `finishUpgrade(buildId)`: checks prerequisites and costs, spends them (money / exp first, then the bank), completes. */
  async finish(session: Session, bid: number, create: boolean): Promise<void> {
    const guild = await this.leaderGuild(session);
    const lot = this.gameData.guildLots().find((l) => l.id === bid);
    const { docs, owned } = await this.ownedOf(guild._id);
    const b = docs.find((d) => d.extendId === bid);
    if (!lot || !b || b.buildState === 0) throw RpcException.notFound('Không có công trình đang xây');
    if ((b.tid === BuildTid.IN_BUILDING) !== create) throw RpcException.invalidArgs('buildId');
    const target = this.row(b.buildState);
    if (!target) throw RpcException.notFound('Công trình không hợp lệ');
    if (unmetPrereqs(target, owned, (id) => this.row(id)).length > 0) throw RpcException.forbidden('Chưa đủ công trình tiên quyết');
    const cost = costOf(target);
    const short = costShortfall(cost, await this.have(guild));
    if (short) throw RpcException.forbidden(short);
    await this.pay(guild._id, cost);
    await this.buildings.updateOne({ guildId: guild._id, extendId: bid }, { $set: { tid: target.id, buildState: 0 } });
    if (target.chain === HALL_CHAIN) {
      const level = guildLevelOf(target);
      await this.view.guilds.updateOne({ _id: guild._id }, { $max: { level } });
      await this.view.toMembers(guild._id, 'onUpdateGuildProperty', { level });
    }
    await this.view.toMembers(guild._id, 'reloadBuild', this.toObj(lot, { tid: target.id, buildState: 0 }));
  }

  /** Spends guild money + exp (one conditional update), then the guild materials; the first spend is refunded when the second fails. */
  private async pay(guildId: number, cost: BuildCost): Promise<void> {
    const upd = await this.view.guilds.updateOne({ _id: guildId, money: { $gte: cost.money }, exp: { $gte: cost.exp } }, { $inc: { money: -cost.money, exp: -cost.exp } });
    if (upd.modifiedCount !== 1) throw RpcException.forbidden('Tiền hoặc kinh nghiệm bang hội không đủ');
    try {
      await this.bank.spend(guildId, needsOf(cost));
    } catch (e) {
      await this.view.guilds.updateOne({ _id: guildId }, { $inc: { money: cost.money, exp: cost.exp } });
      throw e;
    }
    if (cost.money > 0) await this.view.toMembers(guildId, 'onUpdateNumProp', { type: GuildNumProp.MONEY, num: -cost.money, cid: 0 });
    if (cost.exp > 0) await this.view.toMembers(guildId, 'onUpdateNumProp', { type: GuildNumProp.EXP, num: -cost.exp, cid: 0 });
  }

  /** `resetConstruction(buildId)`: cancels a build in progress (nothing was spent); an unfinished new building frees its lot. */
  async reset(session: Session, bid: number): Promise<void> {
    const guild = await this.leaderGuild(session);
    const lot = this.gameData.guildLots().find((l) => l.id === bid);
    const b = await this.buildings.findOne({ guildId: guild._id, extendId: bid, buildState: { $gt: 0 } });
    if (!lot || !b) throw RpcException.notFound('Không có công trình đang xây');
    if (b.tid === BuildTid.IN_BUILDING) {
      await this.buildings.deleteOne({ guildId: guild._id, extendId: bid });
      await this.view.toMembers(guild._id, 'reloadBuild', this.toObj(lot));
    } else {
      await this.buildings.updateOne({ guildId: guild._id, extendId: bid }, { $set: { buildState: 0 } });
      await this.view.toMembers(guild._id, 'reloadBuild', this.toObj(lot, { tid: b.tid, buildState: 0 }));
    }
    await this.view.toMembers(guild._id, 'onCancelUpgrade', { bid });
  }

  /** `guildLevelUp(gid)`: upgrades the main hall in one step (start + finish); the start is undone when the finish is refused. */
  async levelUp(session: Session, gid: number): Promise<void> {
    const guild = await this.leaderGuild(session);
    if (guild._id !== gid) throw RpcException.invalidArgs('gid');
    const { docs, owned } = await this.ownedOf(guild._id);
    const hall = docs.find((d) => d.extendId === HALL_LOT);
    const cur = hall && this.row(hall.tid);
    const next = cur && nextLevelRow(this.gameData.guildBuildingRows(), cur.chain, cur.level);
    if (!hall || hall.buildState !== 0) throw RpcException.forbidden('Đại sảnh đang được xây dựng');
    if (!next) throw RpcException.forbidden('Bang hội đã đạt cấp tối đa');
    const err = constructError({ mode: BuildMode.UPGRADE, lot: { extendId: HALL_LOT, tid: hall.tid, buildState: 0 }, target: next, owned, rowOf: (id) => this.row(id) });
    if (err) throw RpcException.forbidden(err);
    await this.buildings.updateOne({ guildId: guild._id, extendId: HALL_LOT }, { $set: { buildState: next.id } });
    try {
      await this.finish(session, HALL_LOT, false);
    } catch (e) {
      await this.buildings.updateOne({ guildId: guild._id, extendId: HALL_LOT }, { $set: { buildState: 0 } });
      throw e;
    }
  }
}
