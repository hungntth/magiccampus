// Shared item plumbing of the forge services: consuming material stacks (conditional decrement, row deleted at 0) with the
// legacy push shape (onAddCharactorSlot for a stack that remains, onDelCharactorSlot when it is gone), loading owned
// equipment / material rows, and the slot + stat-refresh pushes after an equipment changed.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DRESS_POSITION, DRESS_SERVER_TEXT, FLYER_POSITION, ItemKind, SlotType, WING_KIND, WING_POSITION, WING_TEXT, type BagItem } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService } from '../gamedata/gamedata.service';
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
    private readonly gameData: GameDataService,
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

  /**
   * An equipment row of the character, worn or in the bag (pet gear and the bank are refused); null when unusable. Fashion and flyer
   * gear (kind 10 / 11, position 14 / 21) is not workshop equipment: a mutating caller gets the refusal note (`gate`, default on);
   * read-only info calls pass `gate = false`.
   */
  async equipRow(characterId: number, id: number, wornOk = true, gate = true): Promise<CharacterItem | null> {
    const slots = wornOk ? [SlotType.BAG, SlotType.EQUIP] : [SlotType.BAG];
    const row = await this.items.findOne({ _id: id, characterId, itemType: ItemKind.EQUIP, slotType: { $in: slots } }).lean();
    if (row && gate) {
      await this.refuseDressGear(row.templateId);
      await this.refuseWing(row.templateId);
    }
    return row;
  }

  /** Wings have their own upgrade flows (wing module): the generic star / hole / refine calls refuse them. */
  async refuseWing(templateId: number): Promise<void> {
    const tpl = await this.gameData.template(19, templateId);
    if (Number(tpl?.kind) === WING_KIND || Number(tpl?.position) === WING_POSITION) throw RpcException.forbidden(WING_TEXT.FORGE_GATE);
  }

  /** Throws the R17 refusal when the equipment template is fashion (kind 11 / position 21) or a flyer (kind 10 / position 14). */
  async refuseDressGear(templateId: number): Promise<void> {
    const tpl = await this.gameData.template(19, templateId);
    const position = Number(tpl?.position);
    const kind = Number(tpl?.kind);
    if (kind === 10 || kind === 11 || position === FLYER_POSITION || position === DRESS_POSITION) {
      throw RpcException.forbidden(DRESS_SERVER_TEXT.FORGE_GATE);
    }
  }

  /** A general-bag item stack of template `tid` holding at least `need` units; null otherwise. */
  async stack(characterId: number, id: number, tid: number, need: number): Promise<CharacterItem | null> {
    if (!Number.isInteger(id) || id <= 0) return null;
    const row = await this.items.findOne({ _id: id, characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
    return row && row.templateId === tid && row.stackCount >= need ? row : null;
  }

  /** Units left in stack `id` when it is a stack of template `tid` of the character (0 otherwise): the `num` of the sublime replies. */
  async stackLeft(characterId: number, id: number, tid: number): Promise<number> {
    if (!Number.isInteger(id) || id <= 0) return 0;
    const row = await this.items.findOne({ _id: id, characterId, templateId: tid }, { stackCount: 1 }).lean();
    return row?.stackCount ?? 0;
  }

  /**
   * isEquSid: true when `sid` is an item of the character that is worn (an owned row with that id decides first, like Go), else when a
   * worn piece sits at that equip sid (1..22). Anything else, including another player's item, is false.
   */
  async isWornSid(characterId: number, sid: number): Promise<boolean> {
    if (!Number.isInteger(sid) || sid <= 0) return false;
    const row = await this.items.findOne({ _id: sid, characterId }, { slotType: 1 }).lean();
    if (row) return row.slotType === SlotType.EQUIP;
    return (await this.items.exists({ characterId, slotType: SlotType.EQUIP, slotIndex: sid - 1 })) !== null;
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
