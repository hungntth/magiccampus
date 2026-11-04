// Item plumbing of the magic weapon services: load an owned kind-8 piece, count / take the stone stacks (spend first, with the
// legacy push shape) and build the push lists (slot, wallet, stat refresh) that follow a change.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, type EquipProperties } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { CurrencyService } from '../progression/currency.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { isMwTemplate } from './mw-rules';

export interface MwItem {
  row: CharacterItem;
  tpl: Row;
  worn: boolean;
}

@Injectable()
export class MwItemsService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly currencies: CurrencyService,
    private readonly stats: CharacterStatsService,
  ) {}

  /** A magic weapon of the character, in the bag or worn (`wornOk = false`: bag only). Throws a player-visible refusal. */
  async load(characterId: number, id: number, wornOk = true): Promise<MwItem> {
    const slots = wornOk ? [SlotType.BAG, SlotType.EQUIP] : [SlotType.BAG];
    const row = await this.items.findOne({ _id: id, characterId, itemType: ItemKind.EQUIP, slotType: { $in: slots } }).lean();
    const tpl = row ? await this.gameData.template(19, row.templateId) : undefined;
    if (!row || !tpl) throw RpcException.forbidden(wornOk ? 'Không tìm thấy thần khí.' : 'Không tìm thấy thần khí trong túi (hãy tháo ra trước).');
    if (!isMwTemplate(tpl)) throw RpcException.forbidden('Vật phẩm này không phải thần khí.');
    return { row, tpl, worn: row.slotType === SlotType.EQUIP };
  }

  /** Units of a stone template in the bag. */
  async stoneCount(characterId: number, tid: number): Promise<number> {
    return (await this.inventory.countByTemplate(characterId, [tid])).get(tid) ?? 0;
  }

  /** Spends `count` units of a stone template (across stacks); the returned pushes update / delete the stacks. */
  async takeStones(characterId: number, tid: number, count: number): Promise<{ pushes: Push[]; left: number }> {
    const r = await this.inventory.removeByTemplate(characterId, tid, count);
    const pushes = [
      ...r.updated.map((i) => push('onAddCharactorSlot', i)),
      ...r.deleted.map((d) => push('onDelCharactorSlot', d.id, d.sid)),
    ];
    return { pushes, left: await this.stoneCount(characterId, tid) };
  }

  /** Sets instance fields (`properties.<key>`) and optional row fields in one write. */
  async patch(
    characterId: number, id: number, props: Partial<Record<string, number | string>>, fields: Partial<Pick<CharacterItem, 'star' | 'isBound' | 'colorCode' | 'durability'>> = {},
  ): Promise<void> {
    const $set: Record<string, unknown> = { ...fields };
    for (const [k, v] of Object.entries(props)) $set[`properties.${k}`] = v;
    const r = await this.items.updateOne({ _id: id, characterId }, { $set });
    if (r.matchedCount !== 1) throw RpcException.forbidden('Thần khí vừa thay đổi, hãy thử lại');
  }

  /** onAddCharactorSlot of the item (its new state). */
  async slotPush(characterId: number, id: number): Promise<Push[]> {
    const [item] = await this.inventory.byIds(characterId, [id]);
    return item ? [push('onAddCharactorSlot', item)] : [];
  }

  /** Stat refresh pushes (onUPP, including property.spirituality and the clamped HP / MP). */
  async statPushes(characterId: number): Promise<Push[]> {
    return (await this.stats.gearChangeUpdates(characterId)).map((u) => push('onUPP', u));
  }

  /** onUPP {currencies}: the full small map, so the client's merge keeps every key. */
  async walletPush(characterId: number): Promise<Push> {
    return push('onUPP', { currencies: await this.currencies.balances(characterId) });
  }

  properties(row: CharacterItem): EquipProperties {
    return row.properties ?? {};
  }
}
