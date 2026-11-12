// Material mixing and gem upgrade (legacy mix.go / jewel.go R28, R38): materialMixOne/All and jewelUpdateOne/All.
// The stack is spent before the rolls (also on failure); successes are credited afterwards as the next ColorCode (mix)
// or the next gem tier (`next_jewel_tid`), keeping the bound flag. Replies {slotId, num, flag, finalNum}.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, jewelExchangeGroup, jewelRate, mixRate, type JewelExchangeReply, type MaterialMixReply } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import type { Rng } from './craft-rules';
import { ForgeItemsService } from './forge-items.service';
import { GEM_TYPE, MIXABLE_KINDS, mixAttempts, mixCapped, mixProductColor, rollAttempts, validMixNum } from './mix-rules';

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export interface MixResult {
  reply: MaterialMixReply;
  pushes: Push[];
  note?: string;
}

export type MixMode = 'mix' | 'jewel';

export interface JewelExchangeResult {
  reply: JewelExchangeReply;
  pushes: Push[];
  note?: string;
}

const JEWEL_FAIL: JewelExchangeReply = { flag: false };

@Injectable()
export class MixService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly forgeItems: ForgeItemsService,
  ) {}

  run(
    characterId: number, mode: MixMode, all: boolean, num: number, itemId: number, tempFlag: boolean, rng: Rng = Math.random,
  ): Promise<MixResult> {
    return withCharLock(characterId, () => this.doRun(characterId, mode, all, num, itemId, tempFlag, rng));
  }

  /**
   * pmJewelExchage(sid, targetTid, tempBagFlag): the whole stack of a purple (55-59) or orange (60-64) gem becomes the same count of another
   * gem of the same group, bound, free. The target is added first and the source removed afterwards (Go removed first and lost the stack when
   * the add failed); a source that cannot be taken after the add takes the added gems back. Temp-bag references are refused.
   */
  exchangeJewel(characterId: number, sid: number, targetTid: number, tempFlag: boolean): Promise<JewelExchangeResult> {
    return withCharLock(characterId, async () => {
      const fail = (note: string): JewelExchangeResult => ({ reply: JEWEL_FAIL, pushes: [], note });
      if (tempFlag) return fail('Dữ liệu không hợp lệ.');
      const row = await this.items.findOne({ _id: sid, characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
      const group = row ? jewelExchangeGroup(row.templateId) : -1;
      if (!row || row.stackCount <= 0 || group < 0 || group !== jewelExchangeGroup(targetTid) || row.templateId === targetTid) return fail('Đổi thất bại');
      const target = await this.gameData.template(29, targetTid);
      if (!target) return fail('Đổi thất bại');
      const num = row.stackCount;
      const spec = { templateId: targetTid, itemType: ItemKind.ITEM, bound: true, color: 0, amount: num, maxStack: maxStack(target) };
      if (!(await this.inventory.canFit(characterId, spec))) return fail('Túi đồ đã đầy.');
      const made = await this.inventory.add(characterId, spec);
      let spent: Awaited<ReturnType<ForgeItemsService['consume']>>;
      try {
        spent = await this.forgeItems.consume(characterId, [{ id: sid, count: num }]);
      } catch (e) {
        await this.inventory.removeByTemplate(characterId, targetTid, num).catch(() => undefined);
        throw e;
      }
      const name = String(target.name ?? '');
      return {
        reply: { flag: true, finalNum: num, finalNme: name },
        pushes: [...spent.pushes, push('onAddItem', { i: targetTid, q: num, t: ItemKind.ITEM, n: name }), ...made.map((m) => push('onAddCharactorSlot', m))],
      };
    });
  }

  private refuse(itemId: number, left: number, note: string): MixResult {
    return { reply: { slotId: itemId, num: left, flag: false, finalNum: 0 }, pushes: [], note };
  }

  private async doRun(
    characterId: number, mode: MixMode, all: boolean, num: number, itemId: number, tempFlag: boolean, rng: Rng,
  ): Promise<MixResult> {
    if (!validMixNum(num) || tempFlag) return this.refuse(itemId, 0, 'Dữ liệu không hợp lệ.');
    const row = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.BAG }).lean();
    if (!row || row.itemType !== ItemKind.ITEM) return this.refuse(itemId, 0, 'Không tìm thấy nguyên liệu.');
    const tpl = await this.gameData.template(29, row.templateId);
    if (!tpl) return this.refuse(itemId, row.stackCount, 'Không tìm thấy nguyên liệu.');
    let productTid = row.templateId;
    let color = Math.max(row.colorCode, int(tpl.color));
    let productColor: number;
    let rate: number;
    if (mode === 'mix') {
      if (!MIXABLE_KINDS.includes(int(tpl.kind))) return this.refuse(itemId, row.stackCount, 'Vật phẩm này không thể dung hợp.');
      if (mixCapped(color)) return this.refuse(itemId, row.stackCount, 'Nguyên liệu đã đạt cấp tối đa.');
      rate = mixRate(num, color);
      productColor = mixProductColor(color);
    } else {
      productTid = int(tpl.next_jewel_tid);
      if (int(tpl.type) !== GEM_TYPE || productTid <= 0) return this.refuse(itemId, row.stackCount, 'Bảo thạch đã đạt cấp tối đa.');
      color = row.colorCode;
      rate = jewelRate(num);
      productColor = 0;
    }
    const attempts = mixAttempts(all, row.stackCount, num);
    if (attempts === 0) return this.refuse(itemId, row.stackCount, 'Không đủ nguyên liệu.');
    const consumed = attempts * num;
    const productTpl = productTid === row.templateId ? tpl : await this.gameData.template(29, productTid);
    const spec = {
      templateId: productTid, itemType: ItemKind.ITEM, bound: row.isBound, color: productColor, amount: attempts,
      maxStack: maxStack(productTpl),
    };
    if (consumed < row.stackCount && !(await this.inventory.canFit(characterId, spec))) {
      return this.refuse(itemId, row.stackCount, 'Túi đồ đã đầy.');
    }
    const spent = await this.forgeItems.consume(characterId, [{ id: itemId, count: consumed }]);
    const left = spent.left.get(itemId) ?? 0;
    const ok = rollAttempts(attempts, rate, rng);
    const reply: MaterialMixReply = { slotId: itemId, num: left, flag: ok > 0, finalNum: all ? ok : 0 };
    if (ok === 0) return { reply, pushes: spent.pushes, note: mode === 'mix' ? 'Dung hợp nguyên liệu thất bại!' : 'Thăng cấp bảo thạch thất bại!' };
    const made = await this.inventory.add(characterId, { ...spec, amount: ok });
    const notice = { i: productTid, q: ok, t: ItemKind.ITEM, n: String(productTpl?.name ?? '') };
    return { reply, pushes: [...spent.pushes, push('onAddItem', notice), ...made.map((m) => push('onAddCharactorSlot', m))] };
  }
}
