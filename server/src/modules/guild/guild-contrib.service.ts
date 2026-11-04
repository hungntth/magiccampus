// Guild donations: contribMoney (unbound silver / gold -> guild money + guild exp + member donate contribution) and
// contribMaterial (bag material -> guild bank slots + contribution). The character pays first; the guild is credited after
// and the payment is refunded when the guild row vanished. Pushes: onUPP / onAddCharactorSlot / onDelCharactorSlot (self),
// onUpdateNumProp (online members); the bank pushes come from GuildBankService.

import { Injectable } from '@nestjs/common';
import { GuildMaterial, GuildNumProp, ItemKind, SlotType, donateContribOf, donateMoneyOf, materialGrant, type UpdateNumProp } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { parseContribMoney } from './guild-rules';
import { GuildBankService } from './guild-bank.service';
import { GuildViewService } from './guild-view.service';

const NO_GUILD = 'Bạn chưa vào bang!';

@Injectable()
export class GuildContribService {
  constructor(
    private readonly view: GuildViewService,
    private readonly bank: GuildBankService,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
  ) {}

  /** `contribMoney({g, s})`: silver in multiples of 1000 (unbound `money`), gold unbound `gold`. */
  async contribMoney(session: Session, raw: unknown): Promise<null> {
    const cid = session.characterId!;
    const args = parseContribMoney(raw);
    if (typeof args === 'string') throw RpcException.invalidArgs(args);
    const member = await this.view.memberOf(cid);
    if (!member) throw RpcException.forbidden(NO_GUILD);
    const { silver, gold } = args;
    await withCharLock(cid, async () => {
      const upp: Record<string, number> = {};
      if (silver > 0) {
        const left = await this.characters.spendMoney(cid, 'money', silver);
        if (left === null) throw RpcException.forbidden('Bạc của bạn không đủ');
        upp.money = left;
      }
      if (gold > 0) {
        const left = await this.characters.spendMoney(cid, 'gold', gold);
        if (left === null) {
          if (silver > 0) await this.characters.addMoney(cid, 'money', silver);
          throw RpcException.forbidden('Vàng của bạn không đủ');
        }
        upp.gold = left;
      }
      const money = donateMoneyOf(silver, gold);
      const contrib = donateContribOf(silver, gold);
      const credited = await this.view.guilds.updateOne({ _id: member.guildId }, { $inc: { money, exp: contrib } });
      if (credited.modifiedCount !== 1) {
        if (silver > 0) await this.characters.addMoney(cid, 'money', silver);
        if (gold > 0) await this.characters.addMoney(cid, 'gold', gold);
        throw RpcException.forbidden(NO_GUILD);
      }
      await this.view.members.updateOne({ _id: member._id }, { $inc: { donateContrib: contrib } });
      session.callback('onUPP', upp);
      await this.pushNum(member.guildId, [
        { type: GuildNumProp.MONEY, num: money, cid }, { type: GuildNumProp.EXP, num: contrib, cid },
        { type: GuildNumProp.DONATE, num: contrib, cid },
      ]);
    });
    return null;
  }

  /** `contribMaterial({num, slotId})`: slotId is the bag item id; returns 1 on success (the client refreshes the slot on non-zero). */
  async contribMaterial(session: Session, num: number, slotId: number): Promise<number> {
    const cid = session.characterId!;
    const member = await this.view.memberOf(cid);
    if (!member) throw RpcException.forbidden(NO_GUILD);
    await withCharLock(cid, async () => {
      const [item] = await this.inventory.byIds(cid, [slotId]);
      if (!item || item.slotType !== SlotType.BAG || item.itemType !== ItemKind.ITEM) throw RpcException.notFound('Vui lòng kiểm tra vật liệu và số lượng');
      if (num > item.stackNum) throw RpcException.forbidden('Vui lòng kiểm tra vật liệu và số lượng');
      const grant = materialGrant(item.tid, item.color, num);
      if (!grant) throw RpcException.forbidden('Chỉ có thể quyên góp nguyên liệu và vật liệu bang hội đặc biệt');
      if (grant.guildCount <= 0 || grant.contrib <= 0) throw RpcException.forbidden('Số lượng quá ít để quyên góp');
      if (item.binded && item.tid === GuildMaterial.SPECIAL) throw RpcException.forbidden('Vật phẩm đã khóa không thể quyên góp');
      const took: { left: number; sid: number }[] = [];
      const stored = await this.bank.depositPaid(member.guildId, grant.guildTid, grant.guildCount, async () => {
        const t = await this.inventory.consumeStack(cid, slotId, num);
        if (t) took.push(t);
        return t !== null;
      });
      if (!stored || took.length === 0) throw RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');
      await this.view.members.updateOne({ _id: member._id }, { $inc: { donateContrib: grant.contrib } });
      if (took[0].left > 0) {
        for (const it of await this.inventory.byIds(cid, [slotId])) session.callback('onAddCharactorSlot', it);
      } else {
        session.callback('onDelCharactorSlot', slotId, took[0].sid);
      }
      await this.pushNum(member.guildId, [{ type: GuildNumProp.DONATE, num: grant.contrib, cid }]);
    });
    return 1;
  }

  private async pushNum(guildId: number, props: UpdateNumProp[]): Promise<void> {
    for (const p of props) await this.view.toMembers(guildId, 'onUpdateNumProp', p);
  }
}
