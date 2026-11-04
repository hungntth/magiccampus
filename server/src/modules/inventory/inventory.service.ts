// Bag persistence: list, add (stacking per bag-rules, compensated on partial failure) and remove-for-sale.
// Concurrency: no transactions (standalone Mongo); top-ups are guarded conditional $inc, new slots rely on the
// unique (character, slot) index, and add() undoes its own writes before rethrowing.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BAG_PAGE_SLOTS, ItemKind, SlotType, type BagItem } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Counter } from '../character/counter.schema';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { toBagItem, templateTable } from './bag-mapping';
import { fitsAll, planAdd, planRemove, sellUnit, sidOf, type AddSpec, type BagStack } from './bag-rules';
import { CharacterItem } from './character-item.schema';

export interface SoldItem {
  item: BagItem;
  unit: number;
}

const toStack = (d: CharacterItem): BagStack => ({
  id: d._id, slotIndex: d.slotIndex, templateId: d.templateId, itemType: d.itemType, isBound: d.isBound,
  colorCode: d.colorCode, stackCount: d.stackCount,
});

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly gameData: GameDataService,
  ) {}

  /** Bag items followed by equipped items (getInitSlot returns both in one map). */
  async list(characterId: number): Promise<BagItem[]> {
    const docs = await this.items.find({ characterId }).sort({ slotType: 1, slotIndex: 1 }).lean();
    return this.mapDocs(docs);
  }

  /** Wire items of specific instance ids of this character (for onAddCharactorSlot / equipItems). */
  async byIds(characterId: number, ids: number[]): Promise<BagItem[]> {
    if (ids.length === 0) return [];
    const docs = await this.items.find({ characterId, _id: { $in: ids } }).sort({ slotType: 1, slotIndex: 1 }).lean();
    return this.mapDocs(docs);
  }

  async equipped(characterId: number): Promise<BagItem[]> {
    const docs = await this.items.find({ characterId, slotType: SlotType.EQUIP }).sort({ slotIndex: 1 }).lean();
    return this.mapDocs(docs);
  }

  /** Slot count for capacity checks (one page for now). */
  capacity(): number {
    return BAG_PAGE_SLOTS;
  }

  /** Dry run of add(): true when the amount fits (checked before charging a purchase). */
  async canFit(characterId: number, spec: AddSpec): Promise<boolean> {
    const docs = await this.items.find({ characterId, slotType: SlotType.BAG }).lean();
    return planAdd(docs.map(toStack), spec, this.capacity()) !== null;
  }

  /** Dry run of several add() calls in a row (quest rewards). */
  async canFitAll(characterId: number, specs: readonly AddSpec[]): Promise<boolean> {
    if (specs.length === 0) return true;
    const docs = await this.items.find({ characterId, slotType: SlotType.BAG }).lean();
    return fitsAll(docs.map(toStack), specs, this.capacity());
  }

  /** Adds `spec.amount` of an item; throws invalidArgs('Túi đồ đã đầy') when it does not fit. Returns changed slots. */
  async add(characterId: number, spec: AddSpec, durability = 0): Promise<BagItem[]> {
    const docs = await this.items.find({ characterId, slotType: SlotType.BAG }).lean();
    const plan = planAdd(docs.map(toStack), spec, this.capacity());
    if (!plan) throw RpcException.invalidArgs('Túi đồ đã đầy');
    const done: { id: number; add: number }[] = [];
    const created: number[] = [];
    const changedIds: number[] = [];
    try {
      for (const t of plan.topUps) {
        const r = await this.items.updateOne(
          { _id: t.id, characterId, stackCount: { $lte: spec.maxStack - t.add } },
          { $inc: { stackCount: t.add } },
        );
        if (r.modifiedCount !== 1) throw RpcException.invalidArgs('Túi đồ vừa thay đổi, hãy thử lại');
        done.push(t);
        changedIds.push(t.id);
      }
      for (const n of plan.newStacks) {
        const id = await this.nextId();
        await this.items.create({
          _id: id, characterId, templateId: spec.templateId, itemType: spec.itemType, slotType: SlotType.BAG,
          slotIndex: n.slotIndex, stackCount: n.count, isBound: spec.bound, colorCode: spec.color,
          durability, maxDurability: durability,
        });
        created.push(id);
        changedIds.push(id);
      }
    } catch (e) {
      await Promise.all([
        ...done.map((t) => this.items.updateOne({ _id: t.id }, { $inc: { stackCount: -t.add } })),
        created.length ? this.items.deleteMany({ _id: { $in: created } }) : Promise.resolve(),
      ]);
      throw e;
    }
    const fresh = await this.items.find({ _id: { $in: changedIds } }).sort({ slotIndex: 1 }).lean();
    return this.mapDocs(fresh);
  }

  /** Bag units per item template id (ItemKind.ITEM stacks only) for the requested ids. */
  async countByTemplate(characterId: number, templateIds: readonly number[]): Promise<Map<number, number>> {
    const out = new Map<number, number>();
    if (templateIds.length === 0) return out;
    const docs = await this.items
      .find({ characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM, templateId: { $in: [...templateIds] } }, { templateId: 1, stackCount: 1 })
      .lean();
    for (const d of docs) out.set(d.templateId, (out.get(d.templateId) ?? 0) + d.stackCount);
    return out;
  }

  /**
   * Consumes `count` units of an item template (quest turn-in). Conditional decrements; a stack that changed under us
   * undoes the earlier takes and throws. Returns the bag changes as pushes' payload: rows left (updated) and rows deleted.
   */
  async removeByTemplate(
    characterId: number, templateId: number, count: number,
  ): Promise<{ updated: BagItem[]; deleted: { id: number; sid: number }[] }> {
    const docs = await this.items.find({ characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM, templateId }).lean();
    const plan = planRemove(docs.map(toStack), templateId, ItemKind.ITEM, count);
    if (!plan) throw RpcException.forbidden('Không đủ vật phẩm yêu cầu');
    const done: { id: number; take: number }[] = [];
    try {
      for (const t of plan.takes) {
        const r = await this.items.updateOne(
          { _id: t.id, characterId, slotType: SlotType.BAG, stackCount: { $gte: t.take } },
          { $inc: { stackCount: -t.take } },
        );
        if (r.modifiedCount !== 1) throw RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');
        done.push(t);
      }
    } catch (e) {
      await Promise.all(done.map((t) => this.items.updateOne({ _id: t.id }, { $inc: { stackCount: t.take } })));
      throw e;
    }
    const gone = plan.takes.filter((t) => t.left <= 0);
    if (gone.length > 0) await this.items.deleteMany({ _id: { $in: gone.map((t) => t.id) }, characterId, stackCount: { $lte: 0 } });
    const updated = await this.byIds(characterId, plan.takes.filter((t) => t.left > 0).map((t) => t.id));
    return { updated, deleted: gone.map((t) => ({ id: t.id, sid: sidOf(t.slotIndex) })) };
  }

  /** Conditional decrement of one bag stack (deletes the row at 0). Null when the stack is missing or too small. */
  async consumeStack(characterId: number, itemId: number, count: number): Promise<{ left: number; sid: number } | null> {
    const row = await this.items.findOneAndUpdate(
      { _id: itemId, characterId, slotType: SlotType.BAG, stackCount: { $gte: count } },
      { $inc: { stackCount: -count } },
      { new: true, projection: { stackCount: 1, slotIndex: 1 } },
    ).lean();
    if (!row) return null;
    if (row.stackCount <= 0) await this.items.deleteOne({ _id: itemId, characterId, stackCount: { $lte: 0 } });
    return { left: row.stackCount, sid: sidOf(row.slotIndex) };
  }

  /** Deletes a whole bag stack for sale (delete first, so a double click cannot pay twice). */
  async removeForSale(characterId: number, itemId: number): Promise<SoldItem> {
    const doc = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.BAG }).lean();
    if (!doc) throw RpcException.notFound('không tìm thấy vật phẩm');
    const tpl = await this.gameData.template(templateTable(doc.itemType), doc.templateId);
    const unit = Math.floor(sellUnit(tpl));
    if (unit <= 0) throw RpcException.forbidden('vật phẩm này không thể bán');
    const del = await this.items.deleteOne({ _id: itemId, characterId, slotType: SlotType.BAG });
    if (del.deletedCount !== 1) throw RpcException.notFound('không tìm thấy vật phẩm');
    return { item: toBagItem(doc, tpl), unit };
  }

  private async mapDocs(docs: CharacterItem[]): Promise<BagItem[]> {
    const tpls = new Map<number, Map<number, Row>>();
    for (const table of [19, 29]) {
      const ids = [...new Set(docs.filter((d) => templateTable(d.itemType) === table).map((d) => d.templateId))];
      tpls.set(table, await this.gameData.templatesByIds(table, ids));
    }
    return docs.map((d) => toBagItem(d, tpls.get(templateTable(d.itemType))?.get(d.templateId)));
  }

  private async nextId(): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate('items', { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
