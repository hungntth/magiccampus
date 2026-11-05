// Guild shop (shop 83, NPC 1117) support for the shop module: the open gate (member of a guild of level >= 3, Go texts) and the
// contribution wallet (normal / donate) spent by price types 20 / 21 with one conditional update on the member row.

import { Injectable } from '@nestjs/common';
import { GUILD_SHOP_MIN_LEVEL } from '@mc/shared';
import { GuildViewService } from './guild-view.service';

export const GUILD_SHOP_TEXT = {
  NOT_MEMBER: 'Chỉ thành viên bang hội mới có thể mua ở Shop Bang Hội.',
  LEVEL: (level: number): string => `Bang hội cần đạt cấp ${level} mới có thể sử dụng Shop Bang Hội.`,
} as const;

export interface Contribution {
  normal: number;
  donate: number;
}

@Injectable()
export class GuildShopService {
  constructor(private readonly view: GuildViewService) {}

  /** Go guildShopAllowed: null when the character may use the shop, else the note to show. */
  async gate(cid: number): Promise<string | null> {
    const member = await this.view.memberOf(cid);
    const guild = member ? await this.view.guilds.findById(member.guildId, { level: 1 }) : null;
    if (!member || !guild) return GUILD_SHOP_TEXT.NOT_MEMBER;
    return guild.level < GUILD_SHOP_MIN_LEVEL ? GUILD_SHOP_TEXT.LEVEL(GUILD_SHOP_MIN_LEVEL) : null;
  }

  /** The member's contribution wallet, or null for a character without a guild. */
  async balance(cid: number): Promise<Contribution | null> {
    const row = await this.view.members.findOne({ cid }, { normalContrib: 1, donateContrib: 1 }).lean();
    return row ? { normal: row.normalContrib ?? 0, donate: row.donateContrib ?? 0 } : null;
  }

  /** Atomic spend of both amounts: the new wallet, or null (nothing changed) when either is short or there is no guild. */
  async spend(cid: number, cost: Contribution): Promise<Contribution | null> {
    const inc: Record<string, number> = {};
    const filter: Record<string, unknown> = { cid };
    if (cost.normal > 0) {
      inc.normalContrib = -cost.normal;
      filter.normalContrib = { $gte: cost.normal };
    }
    if (cost.donate > 0) {
      inc.donateContrib = -cost.donate;
      filter.donateContrib = { $gte: cost.donate };
    }
    if (Object.keys(inc).length === 0) return this.balance(cid);
    const row = await this.view.members.findOneAndUpdate(filter, { $inc: inc }, { new: true, projection: { normalContrib: 1, donateContrib: 1 } }).lean();
    return row ? { normal: row.normalContrib ?? 0, donate: row.donateContrib ?? 0 } : null;
  }

  /** Gives a spend back (undo of a failed purchase); returns the wallet, null when the member row is gone. */
  async refund(cid: number, cost: Contribution): Promise<Contribution | null> {
    const row = await this.view.members.findOneAndUpdate(
      { cid }, { $inc: { normalContrib: cost.normal, donateContrib: cost.donate } }, { new: true, projection: { normalContrib: 1, donateContrib: 1 } },
    ).lean();
    return row ? { normal: row.normalContrib ?? 0, donate: row.donateContrib ?? 0 } : null;
  }
}
