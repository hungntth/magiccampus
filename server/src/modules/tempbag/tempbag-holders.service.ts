// Túi Tiện Dụng holders and options: openTempSlot / openmxTempSlot (buy the next holder slot with gold, spend before write), setTempBag /
// setmxTempBag (consume one type-517 bag item, then record it in the holder slot; the item is restored when the record fails) and
// setTbagDire. State lives in Character.tempBag and is only written under the character lock. Legacy: Go tempbag.go, tempbag_take.go.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ItemKind, SlotType, TEMP_BAG, TEMP_BAG_TEXT, slotOf, sidOf } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { busy } from '../inventory/slot-writes';
import { canReplaceHolder, holderExpiry, sectionOf } from './tempbag-rules';
import { TempBagStateService } from './tempbag-state.service';

export type OpenSlotReply = number | { success: false; code: 'ERR_MAX_SLOTS' };

const key = (mx: boolean): 'n' | 'mx' => (mx ? 'mx' : 'n');

@Injectable()
export class TempBagHoldersService {
  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly state: TempBagStateService,
    private readonly gameData: GameDataService,
  ) {}

  /** openTempSlot / openmxTempSlot: +1 holder slot for HOLDER_COST[opened] gold. Reply = holder slots opened. */
  openSlot(cid: number, mx: boolean): Promise<{ reply: OpenSlotReply; pushes: Push[] }> {
    return withCharLock(cid, async () => {
      const opened = sectionOf((await this.state.state(cid))[key(mx)]).opened;
      if (opened >= TEMP_BAG.HOLDERS) return { reply: { success: false, code: 'ERR_MAX_SLOTS' }, pushes: [] };
      const cost = TEMP_BAG.HOLDER_COST[opened];
      const gold = await this.characters.spendMoney(cid, 'gold', cost); // spend first
      if (gold === null) throw RpcException.forbidden('Vàng không đủ!');
      try {
        await this.chars.updateOne({ _id: cid }, { $set: { [`tempBag.${key(mx)}.opened`]: opened + 1 } });
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', cost);
        throw e;
      }
      return { reply: opened + 1, pushes: [push('onUPP', { gold }), push('updateTempBags', await this.state.payload(cid))] };
    });
  }

  /** setTempBag / setmxTempBag(bagSid, holderSid): place a type-517 bag item into an opened holder slot. */
  place(cid: number, mx: boolean, bagSid: number, holderSid: number): Promise<Push[]> {
    const ref = slotOf(bagSid);
    if (!ref || ref.slotType !== SlotType.BAG) throw RpcException.invalidArgs('bagSid');
    const idx = holderSid - (mx ? TEMP_BAG.MX_HOLDER_SID - 1 : TEMP_BAG.NORMAL_HOLDER_SID - 1);
    if (!Number.isInteger(idx) || idx < 1 || idx > TEMP_BAG.HOLDERS) throw RpcException.invalidArgs('holderSid');
    return withCharLock(cid, async () => {
      const row = await this.items.findOne({ characterId: cid, slotType: SlotType.BAG, slotIndex: ref.slotIndex }).lean();
      if (!row) throw RpcException.notFound('không tìm thấy vật phẩm');
      const section = sectionOf((await this.state.state(cid))[key(mx)]);
      if (idx > section.opened) throw RpcException.invalidArgs('holderSid');
      const tpl = row.itemType === ItemKind.ITEM ? await this.gameData.template(29, row.templateId) : undefined;
      const num = Number(tpl?.propl_num ?? 0);
      if (!tpl || Number(tpl.type) !== TEMP_BAG.HOLDER_TYPE || !(num > 0)) throw RpcException.forbidden(mx ? TEMP_BAG_TEXT.MX_ONLY : TEMP_BAG_TEXT.MATERIAL);
      if (!canReplaceHolder(section.holders[String(idx)], num)) throw RpcException.forbidden(TEMP_BAG_TEXT.HOLDER);
      const took = await this.inventory.consumeStack(cid, row._id, 1); // spend before the holder is recorded
      if (!took) throw busy();
      try {
        const holder = { tid: row.templateId, num, exp: holderExpiry(Number(tpl.t ?? 0), Date.now()) };
        await this.chars.updateOne({ _id: cid }, { $set: { [`tempBag.${key(mx)}.holders.${idx}`]: holder } });
      } catch (e) {
        if (took.left > 0) await this.items.updateOne({ _id: row._id, characterId: cid }, { $inc: { stackCount: 1 } });
        else await this.items.create(row).catch(() => undefined);
        throw e;
      }
      const gone = took.left <= 0;
      const [dto] = gone ? [] : await this.inventory.byIds(cid, [row._id]);
      return [
        gone ? push('onDelCharactorSlot', row._id, sidOf(SlotType.BAG, row.slotIndex)) : push('onAddCharactorSlot', dto),
        push('updateTempBags', await this.state.payload(cid)),
      ];
    });
  }

  /** setTbagDire(flag): the "Trực tiếp đặt vào túi tiện dụng" checkbox. */
  setDire(cid: number, on: boolean): Promise<void> {
    return withCharLock(cid, async () => {
      await this.chars.updateOne({ _id: cid }, { $set: { 'tempBag.dire': on } });
    });
  }
}
