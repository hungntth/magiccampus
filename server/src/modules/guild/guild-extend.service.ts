// Guild extensions paid with guild money (leader only): addMaxGuildMemberNum (+10 members, price per slot) and
// addGuildBankSlotNum (+1 bank page, max 4, fixed page prices). Prices are H5 values (see shared GuildExtend); the client has none.
// Pushes to online members: onUpdateGuildProperty({memLimit | bagSlotNum}) and onUpdateNumProp(MONEY, -cost).

import { Injectable } from '@nestjs/common';
import { GUILD_BANK, GuildExtend, GuildNumProp, GuildRank, bankPageExtend, memberExtend } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { withGuildLock } from './guild-lock';
import { GuildViewService } from './guild-view.service';

const NO_GUILD = 'Bạn chưa vào bang!';
const LEADER_ONLY = 'Chỉ có bang chủ mới có thể tiến hành thao tác này';

@Injectable()
export class GuildExtendService {
  constructor(private readonly view: GuildViewService) {}

  private async leaderGuildId(session: Session, gid: number): Promise<number> {
    const row = await this.view.memberOf(session.characterId!);
    if (!row) throw RpcException.forbidden(NO_GUILD);
    if (row.rank !== GuildRank.LEADER) throw RpcException.forbidden(LEADER_ONLY);
    if (row.guildId !== gid) throw RpcException.invalidArgs('gid');
    return gid;
  }

  /** `addMaxGuildMemberNum(gid)`: +10 members for `memLimit * 10 000` guild money. */
  async addMembers(session: Session, gid: number): Promise<void> {
    await this.leaderGuildId(session, gid);
    const memLimit = await withGuildLock(gid, async () => {
      const g = await this.view.guilds.findById(gid);
      if (!g) throw RpcException.forbidden(NO_GUILD);
      const r = memberExtend(g);
      if ('error' in r) throw RpcException.forbidden(r.error);
      const upd = await this.view.guilds.updateOne(
        { _id: gid, memLimit: g.memLimit, money: { $gte: r.cost } },
        { $inc: { memLimit: GuildExtend.MEMBER_STEP, money: -r.cost } },
      );
      if (upd.modifiedCount !== 1) throw RpcException.forbidden('Tiền bang hội không đủ');
      await this.view.toMembers(gid, 'onUpdateNumProp', { type: GuildNumProp.MONEY, num: -r.cost, cid: 0 });
      return g.memLimit + GuildExtend.MEMBER_STEP;
    });
    await this.view.toMembers(gid, 'onUpdateGuildProperty', { memLimit });
  }

  /** `addGuildBankSlotNum(gid)`: opens the next bank page for its price (max 4 pages). */
  async addBankPage(session: Session, gid: number): Promise<void> {
    await this.leaderGuildId(session, gid);
    const pages = await withGuildLock(gid, async () => {
      const g = await this.view.guilds.findById(gid);
      if (!g) throw RpcException.forbidden(NO_GUILD);
      const r = bankPageExtend(g, GUILD_BANK.MAX_PAGES);
      if ('error' in r) throw RpcException.forbidden(r.error);
      const upd = await this.view.guilds.updateOne(
        { _id: gid, bagPages: g.bagPages, money: { $gte: r.cost } },
        { $inc: { bagPages: 1, money: -r.cost } },
      );
      if (upd.modifiedCount !== 1) throw RpcException.forbidden('Tiền bang hội không đủ');
      await this.view.toMembers(gid, 'onUpdateNumProp', { type: GuildNumProp.MONEY, num: -r.cost, cid: 0 });
      return g.bagPages + 1;
    });
    await this.view.toMembers(gid, 'onUpdateGuildProperty', { bagSlotNum: pages });
  }
}
