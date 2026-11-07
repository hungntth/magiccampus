// Choose-one gift boxes (legacy effect_gift_box.go + handlers/item/gift_box_pick.go): useItem only opens the panel (push
// itemMultitoSel(payload, itemId), the box is NOT consumed); selMultiItemByIdx(itemId, idx) picks one choice. Pick order: room check
// -> charge costGold (paid chests, non-bound gold) -> consume the box unit (first pick only) -> grant -> onUPP{gold}. A failed grant
// refunds the gold; the box stays consumed and its remaining picks stay pending, so using any choice box again re-sends them
// instead of opening a new box (no double pay-out). Pending choices live in memory only (like Go).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ITEM_USE_TEXT, itemUseText, type ItemMultiToSelPayload } from '@mc/shared';
import { Character } from '../character/character.schema';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { PetService } from '../pet/pet.service';
import { GrantService } from '../rewards/grant.service';
import {
  afterPick, CHOICE_PET, newPending, pickGrant, toPayload, type GiftChoice, type PendingBox,
} from './gift-box-plan';
import { note } from './open-helpers';
import { PushCollector } from './push-collector';

export interface PickOutcome {
  /** selMultiItemByIdx reply: -1 refused, 0 done, N > 0 picks left. */
  result: number;
  pushes: Push[];
}

const refused = (message?: string): PickOutcome => ({ result: -1, pushes: message ? [note(message)] : [] });

@Injectable()
export class GiftBoxService {
  private readonly logger = new Logger(GiftBoxService.name);
  private readonly pending = new Map<number, PendingBox>();

  constructor(
    @InjectModel(Character.name) private readonly chars: Model<Character>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
    private readonly pets: PetService,
  ) {}

  /** The pending choice of a character (tests, diagnostics). */
  pendingOf(characterId: number): PendingBox | undefined {
    return this.pending.get(characterId);
  }

  /**
   * Opens the panel for a box (called from the useItem path, which holds the character lock). A consumed pending box is re-sent as is.
   * A paid box needs the gold up front (nothing is shown otherwise).
   */
  async open(ctx: ItemConsumeCtx, choices: readonly GiftChoice[], goldCost = 0): Promise<Push[]> {
    const cid = ctx.characterId;
    if (goldCost > 0 && ((await this.chars.findById(cid, { gold: 1 }).lean())?.gold ?? 0) < goldCost) return [note(ITEM_USE_TEXT.NEED_GOLD)];
    let box = this.pending.get(cid);
    if (!box?.consumed) {
      box = newPending(ctx.itemId, ctx.templateId, ctx.bound, choices, goldCost);
      this.pending.set(cid, box);
    }
    const pushes: Push[] = [];
    if (box.goldCost > 0) pushes.push(note(itemUseText(ITEM_USE_TEXT.PICK_PAID, box.goldCost)));
    pushes.push(push('itemMultitoSel', await this.payload(box), box.itemId));
    return pushes;
  }

  /** selMultiItemByIdx. */
  select(characterId: number, itemId: number, idx: number): Promise<PickOutcome> {
    return withCharLock(characterId, () => this.pick(characterId, itemId, idx));
  }

  private async pick(cid: number, itemId: number, idx: number): Promise<PickOutcome> {
    const box = this.pending.get(cid);
    const choice = box?.choices.get(idx);
    if (!box || !choice || box.itemId !== itemId) return refused();
    if (!(await this.fits(cid, choice, box.bound))) return refused(ITEM_USE_TEXT.PICK_NO_ROOM);
    let gold: number | null = null;
    if (box.goldCost > 0) {
      gold = await this.charge(cid, box.goldCost);
      if (gold === null) return refused(ITEM_USE_TEXT.PICK_NO_GOLD);
    }
    const out: Push[] = [];
    if (!box.consumed) {
      const slot = await this.consumeBox(cid, box);
      if (!slot) {
        await this.refund(cid, box.goldCost, gold);
        this.pending.delete(cid);
        return refused();
      }
      out.push(...slot);
    }
    const granted = await this.grantPick(cid, choice, box.bound);
    if (!granted) {
      await this.refund(cid, box.goldCost, gold);
      return { result: -1, pushes: out };
    }
    out.push(...granted);
    if (gold !== null) out.push(push('onUPP', { gold }));
    const result = afterPick(box, idx);
    if (result === 0) this.pending.delete(cid);
    this.logger.log(`char ${cid} picked ${choice.table}/${choice.id} from box ${box.templateId}: ${result} picks left, gold ${gold === null ? 0 : box.goldCost}`);
    return { result, pushes: out };
  }

  private async payload(box: PendingBox): Promise<ItemMultiToSelPayload> {
    const labels = new Map<string, { nm: string; ic: string }>();
    for (const c of box.choices.values()) labels.set(`${c.table}:${c.id}`, await this.labelOf(c));
    return toPayload(box, (c) => labels.get(`${c.table}:${c.id}`) ?? { nm: '', ic: '0' });
  }

  private async labelOf(c: GiftChoice): Promise<{ nm: string; ic: string }> {
    if (c.table === CHOICE_PET) {
      const pet = this.gameData.petTemplate(c.id);
      return { nm: pet?.name ?? `#${c.id}`, ic: pet?.iconCode ? String(pet.iconCode) : '0' };
    }
    const tpl = await this.gameData.template(c.table, c.id);
    return { nm: String(tpl?.name ?? `#${c.id}`).trim(), ic: tpl?.icon_code ? String(tpl.icon_code) : '0' };
  }

  private async fits(cid: number, c: GiftChoice, bound: boolean): Promise<boolean> {
    if (c.table === CHOICE_PET) return this.pets.hasRoom(cid, 1);
    return this.grants.fits(cid, [pickGrant(c, bound)]);
  }

  /** Atomic non-bound gold charge; the new balance, or null when the character is short. */
  private async charge(cid: number, cost: number): Promise<number | null> {
    const row = await this.chars.findOneAndUpdate({ _id: cid, gold: { $gte: cost } }, { $inc: { gold: -cost } }, { new: true, projection: { gold: 1 } }).lean();
    return row ? row.gold : null;
  }

  private async refund(cid: number, cost: number, charged: number | null): Promise<void> {
    if (charged !== null && cost > 0) await this.chars.updateOne({ _id: cid }, { $inc: { gold: cost } });
  }

  /** Spends one box unit (slot pushes), or null when the box left the bag. */
  private async consumeBox(cid: number, box: PendingBox): Promise<Push[] | null> {
    const spent = await this.inventory.consumeStack(cid, box.itemId, 1);
    if (!spent) {
      this.logger.warn(`char ${cid}: gift box pick refused, box ${box.itemId} is no longer in the bag`);
      return null;
    }
    box.consumed = true;
    if (spent.left > 0) {
      const [row] = await this.inventory.byIds(cid, [box.itemId]);
      if (row) return [push('onAddCharactorSlot', row)];
    }
    return [push('onDelCharactorSlot', box.itemId, spent.sid)];
  }

  private async grantPick(cid: number, c: GiftChoice, bound: boolean): Promise<Push[] | null> {
    if (c.table === CHOICE_PET) {
      const wrapper = await this.pets.award(cid, c.id, { ...(c.growRate && c.growRate > 0 ? { growRate: c.growRate } : {}), bind: bound });
      return wrapper ? [push('onAddPet', wrapper)] : null;
    }
    const out = new PushCollector(cid);
    return (await this.grants.grant(out, [pickGrant(c, bound)])) ? out.pushes : null;
  }
}
