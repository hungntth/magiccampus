// Item use (legacy Service.UseItem + FullRecoverByItem), M1 scope: equipment (-> equip), HP/MP potions (501) and
// food (502). Spend before credit: the stack is decremented with a conditional update first, then HP/MP are credited
// with a capped atomic update. Gate messages are pushed (not thrown) because the client calls these fire-and-forget.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { CharacterStatsService, type CharStats } from '../stats/character-stats.service';
import { withCharLock } from './char-lock';
import { CharacterItem } from './character-item.schema';
import { EquipmentService } from './equipment.service';
import { InventoryService } from './inventory.service';
import {
  HP_POTION, healAmount, ITEM_TYPE_POTION, MP_POTION, planRecover, type HealAmount, type RecoverCandidate,
} from './potion';
import { push, type Push } from './pushes';
import { planPageBook, type PageBookPlan } from './bag-pages';
import { sidOf } from './bag-rules';

export type RecoverKind = 'hp' | 'mp';
export const ITEM_TYPE_PET_FUNC = 507;

/** Implemented by PetService (registered at startup: PetModule imports this module, not the reverse). */
export interface PetItemHook {
  /** Why the life item cannot be used on this pet, or null. */
  restoreBlocker(characterId: number, petId: number, reqLevel: number): Promise<string | null>;
  restoreLife(characterId: number, petId: number): Promise<Push[]>;
}
const note = (msg: string): Push => push('onSystemMidMsgOrNote', msg);

@Injectable()
export class UseItemService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly equipment: EquipmentService,
    private readonly stats: CharacterStatsService,
  ) {}

  private petHook: PetItemHook | null = null;

  setPetHook(hook: PetItemHook): void {
    this.petHook = hook;
  }

  /** useItem(2, petId, itemId): life restore items (type 507). Spend first, then credit the pet. */
  usePet(characterId: number, petId: number, itemId: number): Promise<Push[]> {
    return withCharLock(characterId, async () => {
      const hook = this.petHook;
      if (!hook) throw RpcException.forbidden('Chưa hỗ trợ dùng vật phẩm cho pet');
      const item = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.BAG }).lean();
      if (!item || item.itemType !== ItemKind.ITEM) throw RpcException.notFound('Không tìm thấy vật phẩm');
      const tpl = await this.gameData.template(29, item.templateId);
      if (!tpl) throw RpcException.notFound('Không tìm thấy vật phẩm');
      if (Number(tpl.type) !== ITEM_TYPE_PET_FUNC) return [note('Vật phẩm này không dùng được cho pet')];
      const why = await hook.restoreBlocker(characterId, petId, Number(tpl.req_level ?? 0));
      if (why) return [note(why)]; // H5: nothing is consumed
      const left = await this.consume(characterId, itemId, 1);
      if (left === null) throw RpcException.forbidden('Vật phẩm vừa thay đổi, hãy thử lại');
      return [
        ...(await hook.restoreLife(characterId, petId)),
        ...(await this.slotPushes(characterId, [{ id: itemId, sid: sidOf(item.slotIndex), left }])),
      ];
    });
  }

  /** useItem(1, -1, itemId). Equipment goes through the equip path; returns the ordered pushes. */
  async useItem(characterId: number, itemId: number): Promise<Push[]> {
    const probe = await this.items.findOne({ _id: itemId, characterId }, { itemType: 1 }).lean();
    if (!probe) throw RpcException.notFound('Không tìm thấy vật phẩm');
    if (probe.itemType === ItemKind.EQUIP) return (await this.equipment.equipOn(characterId, itemId)).pushes;
    return withCharLock(characterId, () => this.useConsumable(characterId, itemId));
  }

  /** fullHpRecoverByItem / fullMpRecoverByItem: spends potions (client-ordered or auto-scanned) until HP/MP is full. */
  recover(characterId: number, kind: RecoverKind, entries: { id: number; priority: number }[]): Promise<Push[]> {
    return withCharLock(characterId, () => this.doRecover(characterId, kind, entries));
  }

  /**
   * Battle potion: validates and consumes ONE unit without crediting HP/MP (the battle heals its own fighter and the
   * result is persisted at settle). `room` is how much the fighter can still heal; a potion that would do nothing is
   * refused before anything is consumed. Returns the heal amounts and the ordered bag pushes.
   */
  consumeForBattle(
    characterId: number, itemId: number, room: HealAmount,
  ): Promise<{ heal: HealAmount; pushes: Push[] }> {
    return withCharLock(characterId, async () => {
      const item = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.BAG }).lean();
      if (!item || item.itemType !== ItemKind.ITEM) throw RpcException.notFound('Không tìm thấy vật phẩm');
      const tpl = await this.gameData.template(29, item.templateId);
      if (!tpl) throw RpcException.notFound('Không tìm thấy vật phẩm');
      const level = (await this.chars.findById(characterId, { level: 1 }).lean())?.level ?? 1;
      if (level < Number(tpl.req_level ?? 0)) throw RpcException.forbidden('Cấp độ bạn chưa đủ!');
      const useType = Number(tpl.use_type ?? 0);
      if (useType === 4 || useType === 2) throw RpcException.forbidden('Vật phẩm này bạn không dùng được!');
      const heal = healAmount(tpl);
      if (heal.hp <= 0 && heal.mp <= 0) throw RpcException.forbidden('Vật phẩm này chưa dùng được');
      if ((heal.hp <= 0 || room.hp <= 0) && (heal.mp <= 0 || room.mp <= 0)) {
        throw RpcException.forbidden(heal.hp > 0 ? 'HP đã đầy!' : 'MP đã đầy!');
      }
      const left = await this.consume(characterId, itemId, 1);
      if (left === null) throw RpcException.forbidden('Vật phẩm vừa thay đổi, hãy thử lại');
      return { heal, pushes: await this.slotPushes(characterId, [{ id: itemId, sid: sidOf(item.slotIndex), left }]) };
    });
  }

  private async useConsumable(characterId: number, itemId: number): Promise<Push[]> {
    const item = await this.items.findOne({ _id: itemId, characterId, slotType: SlotType.BAG }).lean();
    if (!item || item.itemType !== ItemKind.ITEM) throw RpcException.notFound('Không tìm thấy vật phẩm');
    const tpl = await this.gameData.template(29, item.templateId);
    if (!tpl) throw RpcException.notFound('Không tìm thấy vật phẩm');
    const char = await this.chars.findById(characterId, { level: 1, bagSlotNum: 1, bankSlotNum: 1 }).lean();
    if ((char?.level ?? 1) < Number(tpl.req_level ?? 0)) return [note('Cấp độ bạn chưa đủ!')];
    const book = planPageBook(item.templateId, char?.bagSlotNum ?? 1, char?.bankSlotNum ?? 1);
    if (book) return this.usePageBook(characterId, itemId, sidOf(item.slotIndex), book);
    const useType = Number(tpl.use_type ?? 0);
    if (useType === 4 || useType === 2) return [note('Vật phẩm này bạn không dùng được!')];
    const heal = healAmount(tpl);
    if (heal.hp <= 0 && heal.mp <= 0) return [note('Vật phẩm này chưa dùng được')];

    const st = await this.stats.compute(characterId);
    const hp = Math.min(heal.hp, Math.max(0, st.maxHp - st.doc.currentHp));
    const mp = Math.min(heal.mp, Math.max(0, st.maxMp - st.doc.currentMp));
    if (hp + mp <= 0) return [note(heal.hp > 0 ? 'HP đã đầy!' : 'MP đã đầy!')]; // H5: nothing is consumed

    const left = await this.consume(characterId, itemId, 1);
    if (left === null) throw RpcException.forbidden('Vật phẩm vừa thay đổi, hãy thử lại');
    const cur = await this.stats.healCapped(characterId, hp, mp, st.maxHp, st.maxMp);
    return [push('onUPP', cur), ...(await this.slotPushes(characterId, [{ id: itemId, sid: sidOf(item.slotIndex), left }]))];
  }

  /** Page books (324 bank / 325 bag): the book is consumed first, then the page count is raised ($max keeps it idempotent). */
  private async usePageBook(characterId: number, itemId: number, sid: number, plan: PageBookPlan): Promise<Push[]> {
    if (!plan.ok) return [note(plan.note)];
    const left = await this.consume(characterId, itemId, 1);
    if (left === null) throw RpcException.forbidden('Vật phẩm vừa thay đổi, hãy thử lại');
    await this.chars.updateOne({ _id: characterId }, { $max: { [plan.field]: plan.next } });
    return [push('onUPP', { [plan.field]: plan.next }), ...(await this.slotPushes(characterId, [{ id: itemId, sid, left }]))];
  }

  private async doRecover(
    characterId: number, kind: RecoverKind, entries: { id: number; priority: number }[],
  ): Promise<Push[]> {
    const st = await this.stats.compute(characterId);
    const deficit = kind === 'hp' ? st.maxHp - st.doc.currentHp : st.maxMp - st.doc.currentMp;
    if (deficit <= 0) return [note(kind === 'hp' ? 'HP đã đầy!' : 'MP đã đầy!')];
    const cands = await this.candidates(characterId, kind, st, entries);
    const plan = planRecover(cands, deficit);
    if (plan.steps.length === 0) return [note('Không có vật phẩm này')];

    const consumed: { id: number; sid: number; left: number }[] = [];
    let healed = 0;
    for (const step of plan.steps) {
      const cand = cands.find((c) => c.id === step.id)!;
      const left = await this.consume(characterId, step.id, step.count);
      if (left === null) break; // the stack changed under us: credit what was really spent
      healed += step.count * cand.amount;
      consumed.push({ id: step.id, sid: sidOf(cand.slotIndex), left });
    }
    if (consumed.length === 0) return [];
    const amount = Math.min(healed, deficit);
    const cur = await this.stats.healCapped(
      characterId, kind === 'hp' ? amount : 0, kind === 'mp' ? amount : 0, st.maxHp, st.maxMp,
    );
    return [...(await this.slotPushes(characterId, consumed)), push('onUPP', cur)];
  }

  /** Bag potions of the right kind (type 501, level ok); the client's list restricts and re-prioritizes them. */
  private async candidates(
    characterId: number, kind: RecoverKind, st: CharStats, entries: { id: number; priority: number }[],
  ): Promise<(RecoverCandidate & { slotIndex: number })[]> {
    const table = kind === 'hp' ? HP_POTION : MP_POTION;
    const rows = await this.items.find({ characterId, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
    const tpls = await this.gameData.templatesByIds(29, [...new Set(rows.map((r) => r.templateId))]);
    const wanted = new Map(entries.map((e) => [e.id, e.priority]));
    const out: (RecoverCandidate & { slotIndex: number })[] = [];
    for (const r of rows) {
      const tpl = tpls.get(r.templateId);
      const amount = table[r.templateId] ?? 0;
      if (!tpl || Number(tpl.type) !== ITEM_TYPE_POTION || amount <= 0) continue;
      if (st.doc.level < Number(tpl.req_level ?? 0) || [2, 4].includes(Number(tpl.use_type ?? 0))) continue;
      if (wanted.size > 0 && !wanted.has(r._id)) continue;
      const fallback = amount - (r.isBound ? 1 : 0);
      out.push({ id: r._id, slotIndex: r.slotIndex, stackCount: r.stackCount, amount, priority: wanted.get(r._id) ?? fallback });
    }
    return out;
  }

  /** Conditional decrement; deletes the row at 0. Returns the remaining count, or null when the stack is too small. */
  private async consume(characterId: number, id: number, count: number): Promise<number | null> {
    const row = await this.items.findOneAndUpdate(
      { _id: id, characterId, slotType: SlotType.BAG, stackCount: { $gte: count } },
      { $inc: { stackCount: -count } },
      { new: true, projection: { stackCount: 1 } },
    ).lean();
    if (!row) return null;
    if (row.stackCount <= 0) await this.items.deleteOne({ _id: id, characterId, stackCount: { $lte: 0 } });
    return row.stackCount;
  }

  private async slotPushes(characterId: number, rows: { id: number; sid: number; left: number }[]): Promise<Push[]> {
    const alive = await this.inventory.byIds(characterId, rows.filter((r) => r.left > 0).map((r) => r.id));
    return rows.map((r) => {
      const item = alive.find((a) => a.id === r.id);
      return r.left > 0 && item ? push('onAddCharactorSlot', item) : push('onDelCharactorSlot', r.id, r.sid);
    });
  }
}
