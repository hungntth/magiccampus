// Battle loot routing into the Túi Tiện Dụng (phase C, plan decision 11; Go loot_delivery.go routeLoot): Ma Tâm always tries the Ma Tâm
// bag first, other eligible materials go to the normal temp bag when the "Trực tiếp" flag is on, and loot that fits nowhere
// becomes a Túi tạm thời entry instead of being lost. `route` must run under the character lock (the caller already holds it).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ItemKind, SlotType, TEMP_BAG_TEXT, isMaTam, tempIndex, type TempDirectEffect, type TempSlotData, type TemporaryEntry } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { Counter } from '../character/counter.schema';
import type { Row } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { CharacterItem } from '../inventory/character-item.schema';
import { push, type Push } from '../inventory/pushes';
import { isRewardTemp, planDirect } from './tempbag-rules';
import { TempBagStateService } from './tempbag-state.service';
import { TemporaryBagService } from './temporary-bag.service';

export interface RoutedLoot {
  mx: boolean;
  pos: number;
  slot: TempSlotData;
  curNum: number;
}

/** Legacy display effect of a loot notice ({i, q, s, c, t, n, tt}). */
export function lootEffect(itemId: number, qty: number, name: string, kind: number, color = 0): TempDirectEffect {
  return { i: itemId, q: qty, s: ` x${Math.max(qty, 1)}`, c: color, t: 29, n: name, tt: kind };
}

@Injectable()
export class TempBagLootService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
    private readonly state: TempBagStateService,
    private readonly temporary: TemporaryBagService,
  ) {}

  /** Tries to store the whole drop in a temp bag; null = use the normal bag. Caller holds withCharLock(cid). */
  async route(cid: number, itemId: number, tpl: Row, qty: number, bound: boolean, color = 0): Promise<RoutedLoot | null> {
    const facts = { kind: Number(tpl.kind ?? 0), type: Number(tpl.type ?? 0) };
    if (isMaTam(facts, itemId)) return this.store(cid, true, itemId, tpl, qty, bound, color);
    if (!isRewardTemp(facts) || !(await this.state.state(cid)).dire) return null;
    return this.store(cid, false, itemId, tpl, qty, bound, color);
  }

  /** Offers overflow entries to the session's Túi tạm thời; pushes the warning + chat lines, or the "lost" note for the rest. */
  overflow(session: Session | undefined, entries: readonly TemporaryEntry[]): Push[] {
    if (entries.length === 0) return [];
    const accepted = session ? this.temporary.offer(session, entries) : [];
    const out: Push[] = [];
    if (session && accepted.length > 0) {
      out.push(push('warnTemporaryBag', [...session.temporaryBag]));
      for (const e of accepted) out.push(push('onAddTemporaryItem', lootEffect(e.itemId, e.stackNum, e.name, 0)));
    }
    if (accepted.length < entries.length) out.push(push('onSystemMidMsgOrNote', TEMP_BAG_TEXT.TEMPORARY_FULL));
    return out;
  }

  private async store(
    cid: number, mx: boolean, itemId: number, tpl: Row, qty: number, bound: boolean, color: number,
  ): Promise<RoutedLoot | null> {
    const [rows, cap] = await Promise.all([this.state.rows(cid, mx), this.state.capacity(cid, mx)]);
    const spec = { templateId: itemId, itemType: ItemKind.ITEM, isBound: bound, colorCode: color, stackCount: qty, maxStack: maxStack(tpl) };
    const plan = planDirect(rows, cap, spec);
    if (!plan) return null;
    let slot: TempSlotData;
    if (plan.kind === 'top') {
      const top = await this.items.findOneAndUpdate(
        { _id: plan.id, characterId: cid, stackCount: { $lte: spec.maxStack - qty } }, { $inc: { stackCount: qty } }, { new: true },
      ).lean();
      if (!top) return null;
      slot = await this.state.slot(top);
    } else {
      try {
        const id = (await this.counters.findByIdAndUpdate('items', { $inc: { seq: 1 } }, { new: true, upsert: true })).seq;
        const doc = await this.items.create({
          _id: id, characterId: cid, templateId: itemId, itemType: ItemKind.ITEM, slotType: SlotType.TEMP_BAG,
          slotIndex: tempIndex(mx, plan.pos), stackCount: qty, isBound: bound, colorCode: color,
        });
        slot = await this.state.slot(doc);
      } catch (e) {
        if ((e as { code?: number }).code === 11000) return null; // slot taken under us: fall back to the bag
        throw e;
      }
    }
    return { mx, pos: plan.pos, slot, curNum: await this.state.count(cid, mx) };
  }
}
