// Guild bank: slots in guild_bank_slots (migrated at module init from the phase A guilds.bankItems stock), deposits (contribMaterial),
// moveGuildItem (canSlot), dropGuildItem (leader only), the H5 withdrawGuildItem (canSlot, into the bag as bound) and the
// build / skill resource spend. Pushes: onAddGuildSlot(slot), onDelGuildSlot(slotId), onUpdateGuildBankStock(stock).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  GUILD_BANK, GuildRank, ItemKind, bankCount, planBankDeposit, planBankMove, planBankSpend, rankCan,
  type BankNeed, type BankSlotRow,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { Counter } from '../character/counter.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { withGuildLock } from './guild-lock';
import { GuildViewService } from './guild-view.service';
import { GuildBankSlot, type GuildBankSlotDocument } from './guild.schema';

const NO_GUILD = 'Bạn chưa vào bang!';
const NO_RIGHT = 'Bạn không có quyền hạn này!';
const BUSY = 'Kho bang vừa thay đổi, hãy thử lại';

const toRow = (d: Pick<GuildBankSlot, '_id' | 'slotIndex' | 'tid' | 'count'>): BankSlotRow => ({ id: d._id, slotIndex: d.slotIndex, tid: d.tid, count: d.count });

@Injectable()
export class GuildBankService {
  constructor(
    @InjectModel(GuildBankSlot.name) private readonly slots: Model<GuildBankSlot>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly view: GuildViewService,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
  ) {}

  /** Moves every phase A stock (guilds.bankItems) into slots; idempotent (the take of each guild is atomic). Runs at module init. */
  async migrateAll(): Promise<number> {
    let moved = 0;
    for (;;) {
      const old = await this.view.guilds.findOneAndUpdate({ 'bankItems.0': { $exists: true } }, { $set: { bankItems: [] } }, { new: false });
      if (!old) return moved;
      await withGuildLock(old._id, async () => {
        for (const e of old.bankItems) await this.applyDeposit(old._id, e.tid, e.count, old.bagPages);
      });
      moved++;
    }
  }

  async rows(guildId: number): Promise<GuildBankSlotDocument[]> {
    return this.slots.find({ guildId }).sort({ slotIndex: 1 });
  }

  /** Units of one template and the whole bank as planner rows (for cost checks). */
  async rowsOf(guildId: number): Promise<BankSlotRow[]> {
    return (await this.rows(guildId)).map(toRow);
  }

  async pushChanges(guildId: number, touched: readonly number[]): Promise<void> {
    const alive = await this.slots.find({ guildId, _id: { $in: [...touched] } });
    const dtos = await this.view.slotDtos(alive);
    for (const s of dtos) await this.view.toMembers(guildId, 'onAddGuildSlot', s);
    const live = new Set(alive.map((a) => a._id));
    for (const id of touched) if (!live.has(id)) await this.view.toMembers(guildId, 'onDelGuildSlot', id);
    await this.view.toMembers(guildId, 'onUpdateGuildBankStock', await this.view.stockOf(guildId));
  }

  private async nextId(): Promise<number> {
    return (await this.counters.findByIdAndUpdate('guild_slots', { $inc: { seq: 1 } }, { new: true, upsert: true })).seq;
  }

  /** Writes a deposit plan (caller holds the guild lock); returns the touched slot ids or null when the pages are full. */
  private async applyDeposit(guildId: number, tid: number, count: number, pages: number): Promise<number[] | null> {
    const rows = (await this.slots.find({ guildId })).map(toRow);
    const plan = planBankDeposit(rows, tid, count, pages);
    if (!plan) return null;
    const touched: number[] = [];
    for (const t of plan.tops) {
      const r = await this.slots.updateOne({ _id: t.id, guildId, count: { $lte: GUILD_BANK.STACK_MAX - t.add } }, { $inc: { count: t.add } });
      if (r.modifiedCount !== 1) throw RpcException.forbidden(BUSY);
      touched.push(t.id);
    }
    for (const n of plan.news) {
      const id = await this.nextId();
      await this.slots.create({ _id: id, guildId, slotIndex: n.slotIndex, tid, count: n.count });
      touched.push(id);
    }
    return touched;
  }

  /**
   * Deposit with a paid-for source: under the guild lock, check the pages can take `count`, run `consume` (spend the bag stack;
   * false aborts), then write the slots. Returns false when the bank is full (nothing consumed) or `consume` refused.
   */
  async depositPaid(guildId: number, tid: number, count: number, consume: () => Promise<boolean>): Promise<boolean> {
    const touched = await withGuildLock(guildId, async () => {
      const guild = await this.view.guilds.findById(guildId, { bagPages: 1 });
      if (!guild) return null;
      const rows = (await this.slots.find({ guildId })).map(toRow);
      if (planBankDeposit(rows, tid, count, guild.bagPages) === null) throw RpcException.forbidden('Kho bang đã đầy');
      if (!(await consume())) return null;
      return this.applyDeposit(guildId, tid, count, guild.bagPages);
    });
    if (!touched) return false;
    await this.pushChanges(guildId, touched);
    return true;
  }

  /** Takes resources out of the bank (build / skill costs). Throws when a template falls short; touched ids are pushed. */
  async spend(guildId: number, needs: readonly BankNeed[]): Promise<void> {
    const touched = await withGuildLock(guildId, async () => {
      const rows = (await this.slots.find({ guildId })).map(toRow);
      const takes = planBankSpend(rows, needs);
      if (!takes) throw RpcException.forbidden('Kho bang không đủ vật liệu');
      const done: { id: number; take: number }[] = [];
      try {
        for (const t of takes) {
          const r = await this.slots.updateOne({ _id: t.id, guildId, count: { $gte: t.take } }, { $inc: { count: -t.take } });
          if (r.modifiedCount !== 1) throw RpcException.forbidden(BUSY);
          done.push(t);
        }
      } catch (e) {
        await Promise.all(done.map((t) => this.slots.updateOne({ _id: t.id }, { $inc: { count: t.take } })));
        throw e;
      }
      await this.slots.deleteMany({ guildId, count: { $lte: 0 } });
      return takes.map((t) => t.id);
    });
    await this.pushChanges(guildId, touched);
  }

  /** Whether the bank holds every need (read only; the spend re-checks under the lock). */
  async covers(guildId: number, needs: readonly BankNeed[]): Promise<boolean> {
    return planBankSpend(await this.rowsOf(guildId), needs) !== null;
  }

  async count(guildId: number, tid: number): Promise<number> {
    return bankCount(await this.rowsOf(guildId), tid);
  }

  /** The caller's membership and whether they may manage the bank (canSlot); throws when not a member. */
  private async actor(session: Session): Promise<{ guildId: number; rank: number; slotRight: boolean; pages: number }> {
    const row = await this.view.memberOf(session.characterId!);
    const guild = row ? await this.view.guilds.findById(row.guildId) : null;
    if (!row || !guild) throw RpcException.forbidden(NO_GUILD);
    return { guildId: guild._id, rank: row.rank, slotRight: rankCan(this.view.rankRows(guild), row.rank, 'canSlot'), pages: guild.bagPages };
  }

  /** `moveGuildItem(fromSid, toSid)`: needs canSlot. */
  async move(session: Session, fromSid: number, toSid: number): Promise<void> {
    const a = await this.actor(session);
    if (!a.slotRight) throw RpcException.forbidden(NO_RIGHT);
    const touched = await withGuildLock(a.guildId, async () => {
      const rows = (await this.slots.find({ guildId: a.guildId })).map(toRow);
      const plan = planBankMove(rows, fromSid, toSid, a.pages);
      if (typeof plan === 'string') throw RpcException.forbidden(plan);
      const g = a.guildId;
      if (plan.kind === 'move') {
        await this.slots.updateOne({ _id: plan.id, guildId: g }, { $set: { slotIndex: plan.toIndex } });
        return [plan.id];
      }
      if (plan.kind === 'merge') {
        await this.slots.updateOne({ _id: plan.toId, guildId: g }, { $set: { count: plan.toCount } });
        if (plan.fromLeft > 0) await this.slots.updateOne({ _id: plan.fromId, guildId: g }, { $set: { count: plan.fromLeft } });
        else await this.slots.deleteOne({ _id: plan.fromId, guildId: g });
        return [plan.fromId, plan.toId];
      }
      // swap through a parking index (the (guild, slot) index is unique)
      await this.slots.updateOne({ _id: plan.aId, guildId: g }, { $set: { slotIndex: -1 } });
      await this.slots.updateOne({ _id: plan.bId, guildId: g }, { $set: { slotIndex: plan.aIndex } });
      await this.slots.updateOne({ _id: plan.aId, guildId: g }, { $set: { slotIndex: plan.bIndex } });
      return [plan.aId, plan.bId];
    });
    await this.pushChanges(a.guildId, touched);
  }

  /** `dropGuildItem(slotId)`: leader only (client text: "Bang chủ có thể xóa nguyên liệu trong kho"); destroys the whole stack. */
  async drop(session: Session, slotId: number): Promise<void> {
    const a = await this.actor(session);
    if (a.rank !== GuildRank.LEADER) throw RpcException.forbidden(NO_RIGHT);
    const del = await withGuildLock(a.guildId, () => this.slots.deleteOne({ _id: slotId, guildId: a.guildId }));
    if (del.deletedCount !== 1) throw RpcException.notFound('Ô kho trống');
    await this.pushChanges(a.guildId, [slotId]);
  }

  /** H5 `withdrawGuildItem(slotId, num)`: canSlot; the stack leaves the bank first, then lands in the bag as bound (never donatable again). */
  async withdraw(session: Session, slotId: number, num: number): Promise<number> {
    const cid = session.characterId!;
    const a = await this.actor(session);
    if (!a.slotRight) throw RpcException.forbidden(NO_RIGHT);
    const touched = await withCharLock(cid, async () => {
      const row = await this.slots.findOne({ _id: slotId, guildId: a.guildId });
      if (!row || num > row.count) throw RpcException.notFound('Ô kho trống');
      const tpl = await this.gameData.template(29, row.tid);
      const spec = { templateId: row.tid, itemType: ItemKind.ITEM, bound: true, color: 0, amount: num, maxStack: maxStack(tpl) };
      if (!(await this.inventory.canFit(cid, spec))) throw RpcException.invalidArgs('Túi đồ đã đầy');
      const taken = await withGuildLock(a.guildId, async () => {
        const r = await this.slots.updateOne({ _id: slotId, guildId: a.guildId, count: { $gte: num } }, { $inc: { count: -num } });
        if (r.modifiedCount !== 1) throw RpcException.forbidden(BUSY);
        await this.slots.deleteOne({ _id: slotId, guildId: a.guildId, count: { $lte: 0 } });
        return true;
      });
      if (!taken) return [];
      try {
        for (const it of await this.inventory.add(cid, spec)) session.callback('onAddCharactorSlot', it);
      } catch (e) {
        await withGuildLock(a.guildId, async () => {
          const back = await this.slots.updateOne({ _id: slotId }, { $inc: { count: num } });
          if (back.matchedCount === 0) await this.applyDeposit(a.guildId, row.tid, num, a.pages);
        });
        throw e;
      }
      return [slotId];
    });
    await this.pushChanges(a.guildId, touched);
    return 1;
  }
}
