// Shared item plumbing of the forge services: consuming material stacks (conditional decrement, row deleted at 0) with the
// legacy push shape (onAddCharactorSlot for a stack that remains, onDelCharactorSlot when it is gone), loading owned
// equipment / material rows, and the slot + stat-refresh pushes after an equipment changed.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, type BagItem } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterItem } from '../inventory/character-item.schema';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { CharacterStatsService } from '../stats/character-stats.service';

export interface Take {
  id: number;
  count: number;
}

export interface Consumed {
  pushes: Push[];
  /** Units left per taken item id (0 = row deleted). */
  left: Map<number, number>;
}

@Injectable()
export class ForgeItemsService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly inventory: InventoryService,
    private readonly stats: CharacterStatsService,
  ) {}

  /** Spends the stacks first (callers credit afterwards). Throws when a stack changed under us. */
  async consume(characterId: number, takes: readonly Take[]): Promise<Consumed> {
    const done: { id: number; sid: number; left: number }[] = [];
    for (const t of takes) {
      const r = await this.inventory.consumeStack(characterId, t.id, t.count);
      if (!r) throw RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');
      done.push({ id: t.id, sid: r.sid, left: r.left });
    }
    const kept = await this.inventory.byIds(characterId, done.filter((d) => d.left > 0).map((d) => d.id));
    const pushes: Push[] = done.map((d) => (d.left > 0
      ? push('onAddCharactorSlot', kept.find((k) => k.id === d.id))
      : push('onDelCharactorSlot', d.id, d.sid)));
    return { pushes, left: new Map(done.map((d) => [d.id, d.left])) };
  }

  /** An equipment row of the character, worn or in the bag (pet gear and the bank are refused); null when unusable. */
  async equipRow(characterId: number, id: number, wornOk = true): Promise<CharacterItem | null> {
    const slots = wornOk ? [SlotType.BAG, SlotType.EQUIP] : [SlotType.BAG];
    return this.items.findOne({ _id: id, characterId, itemType: ItemKind.EQUIP, slotType: { $in: slots } }).lean();
  }

  /** A general-bag item stack of template `tid` holding at least `need` units; null otherwise. */
  async stack(characterId: number, id: number, tid: number, need: number): Promise<CharacterItem | null> {
    if (!Number.isInteger(id) || id <= 0) return null;
    const row = await this.items.findOne({ _id: id, characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
    return row && row.templateId === tid && row.stackCount >= need ? row : null;
  }

  /** Wire view of one item of the character. */
  async view(characterId: number, id: number): Promise<BagItem | null> {
    return (await this.inventory.byIds(characterId, [id]))[0] ?? null;
  }

  /** onAddCharactorSlot of the item; for a worn item `withStats` adds the stat-refresh onUPP pushes. */
  async slotPushes(characterId: number, id: number, withStats: boolean): Promise<Push[]> {
    const [item] = await this.inventory.byIds(characterId, [id]);
    if (!item) return [];
    const out = [push('onAddCharactorSlot', item)];
    if (withStats && item.slotType === SlotType.EQUIP) {
      for (const u of await this.stats.gearChangeUpdates(characterId)) out.push(push('onUPP', u));
    }
    return out;
  }
}
