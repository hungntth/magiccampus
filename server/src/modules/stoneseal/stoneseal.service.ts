// Stone seal service (M13 phase E2): stones in the bored holes of the 12 worn equipment slots, boring and the seal level. State = feature `stone_seal`.
// Every mutation runs under withCharLock: validate (pure plan) -> conditional spend (gold / Bụi Ấn Thạch / Kim Cương / the stone) -> save -> hand
// stones back -> pushes. A failed save refunds the spend; a refused call answers {flag:false} after showing the note (the Flash handlers check `flag`).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, STONE_SEAL, STONE_SEAL_TEXT as T, type StoneSealReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack, type AddSpec } from '../inventory/bag-rules';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { sendPushes, type Push } from '../inventory/pushes';
import { ForgeItemsService } from '../forge/forge-items.service';
import { CurrencyService } from '../progression/currency.service';
import { FeatureStoreService } from '../progression/feature-store.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { isError, planBore, planRemove, planRemoveAll, planSet, planSuccinct, planSwap, type Cost, type PlanError } from './stoneseal-rules';
import { loadSealContext } from './stoneseal-loader';
import { sealViews } from './stoneseal-stats';
import { STONE_SEAL_FEATURE_KEY, encodeStoneSeal, parseStoneSeal, stoneSealData, type StoneSealState } from './stoneseal-state';

function must<T>(plan: T | PlanError): T {
  if (isError(plan)) throw RpcException.forbidden(plan.error);
  return plan;
}

@Injectable()
export class StoneSealService {
  private readonly logger = new Logger(StoneSealService.name);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly store: FeatureStoreService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly currencies: CurrencyService,
    private readonly forgeItems: ForgeItemsService,
    private readonly inventory: InventoryService,
    private readonly stats: CharacterStatsService,
  ) {}

  private load(cid: number): Promise<StoneSealState> {
    return this.store.get(cid, STONE_SEAL_FEATURE_KEY, {}).then(parseStoneSeal);
  }

  private save(cid: number, state: StoneSealState): Promise<void> {
    return this.store.put(cid, STONE_SEAL_FEATURE_KEY, encodeStoneSeal(state));
  }

  /** The Responder reply: {flag, data, watch, equip, slot} + the H5 view of the 12 slots. */
  async reply(cid: number, flag: boolean, state?: StoneSealState): Promise<StoneSealReply> {
    const s = state ?? (await this.load(cid));
    const ctx = await loadSealContext(this.items, this.gameData, cid, s);
    return { flag, data: stoneSealData(s), watch: false, equip: null, slot: null, view: sealViews(s, ctx.worn, ctx.itemOf) };
  }

  getData(cid: number): Promise<StoneSealReply> {
    return this.reply(cid, true);
  }

  private async pushStats(session: Session): Promise<void> {
    for (const u of await this.stats.gearChangeUpdates(session.characterId!)) session.callback('onUPP', u);
  }

  /** Runs a mutation; a rejection shows the note and answers flag false (state unchanged). */
  async run(session: Session, fn: () => Promise<StoneSealState>): Promise<StoneSealReply> {
    const cid = session.characterId!;
    try {
      const state = await withCharLock(cid, fn);
      const reply = await this.reply(cid, true, state);
      await this.pushStats(session);
      return reply;
    } catch (e) {
      if (!(e instanceof RpcException)) throw e;
      session.callback('onSystemMidMsgOrNote', e.message);
      return this.reply(cid, false);
    }
  }

  private async giveStones(session: Session, tids: readonly number[]): Promise<void> {
    const cid = session.characterId!;
    for (const tid of tids) {
      const tpl = await this.gameData.template(29, tid);
      if (!tpl) continue;
      const spec: AddSpec = { templateId: tid, itemType: ItemKind.ITEM, bound: false, color: 0, amount: 1, maxStack: maxStack(tpl) };
      const changed = await this.inventory.add(cid, spec);
      session.callback('onAddItem', { i: tid, q: 1, t: ItemKind.ITEM, n: String(tpl.name ?? `#${tid}`) });
      for (const item of changed) session.callback('onAddCharactorSlot', item);
    }
  }

  private async specsFor(tids: readonly number[]): Promise<AddSpec[]> {
    const out: AddSpec[] = [];
    for (const tid of tids) {
      const tpl = await this.gameData.template(29, tid);
      if (tpl) out.push({ templateId: tid, itemType: ItemKind.ITEM, bound: false, color: 0, amount: 1, maxStack: maxStack(tpl) });
    }
    return out;
  }

  private async needRoom(cid: number, tids: readonly number[]): Promise<void> {
    if (tids.length > 0 && !(await this.inventory.canFitAll(cid, await this.specsFor(tids)))) throw RpcException.forbidden(T.BAG_FULL);
  }

  /** stoneSealSetStone(equipSid, sealIndex, stoneItemId, tempBagFlag): the stone comes from the bag (a replaced stone goes back). */
  setStone(session: Session, sid: number, idx: number, itemId: number): Promise<StoneSealReply> {
    const cid = session.characterId!;
    return this.run(session, async () => {
      const row = await this.items.findOne({ _id: itemId, characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
      if (!row) throw RpcException.forbidden(T.NO_STONE);
      const tpl = await this.gameData.template(29, row.templateId);
      if (Number(tpl?.type) !== STONE_SEAL.STONE_ITEM_TYPE) throw RpcException.forbidden(T.NOT_STONE);
      const plan = must(planSet(await this.load(cid), sid, idx, row.templateId));
      if (plan.replaced > 0 && row.stackCount > 1) await this.needRoom(cid, [plan.replaced]);
      const taken = await this.forgeItems.consume(cid, [{ id: itemId, count: 1 }]);
      try {
        await this.save(cid, plan.state);
      } catch (e) {
        await this.giveStones(session, [row.templateId]).catch(() => undefined);
        throw e;
      }
      sendPushes(session, taken.pushes);
      if (plan.replaced > 0) await this.giveStones(session, [plan.replaced]);
      return plan.state;
    });
  }

  removeStone(session: Session, sid: number, idx: number): Promise<StoneSealReply> {
    const cid = session.characterId!;
    return this.run(session, async () => {
      const plan = must(planRemove(await this.load(cid), sid, idx));
      await this.needRoom(cid, plan.returned);
      await this.save(cid, plan.state);
      await this.giveStones(session, plan.returned);
      return plan.state;
    });
  }

  removeAll(session: Session, sid: number): Promise<StoneSealReply> {
    const cid = session.characterId!;
    return this.run(session, async () => {
      const plan = must(planRemoveAll(await this.load(cid), sid));
      if (plan.returned.length === 0) return plan.state;
      await this.needRoom(cid, plan.returned);
      await this.save(cid, plan.state);
      await this.giveStones(session, plan.returned);
      return plan.state;
    });
  }

  swap(session: Session, sid: number, a: number, b: number): Promise<StoneSealReply> {
    const cid = session.characterId!;
    return this.run(session, async () => {
      const plan = must(planSwap(await this.load(cid), sid, a, b));
      await this.save(cid, plan.state);
      return plan.state;
    });
  }

  /** Spends gold and / or dust (conditional); returns the refund closure. A failed spend of the second part refunds the first. */
  private async charge(session: Session, cost: Cost): Promise<() => Promise<void>> {
    const cid = session.characterId!;
    let gold: number | null = null;
    if (cost.gold > 0) {
      gold = await this.characters.spendMoney(cid, 'gold', cost.gold);
      if (gold === null) throw RpcException.forbidden(T.NO_GOLD);
      session.callback('onUPP', { gold });
    }
    if (cost.dust > 0) {
      const left = await this.currencies.spend(cid, 'stoneSealPoint', cost.dust);
      if (left === null) throw RpcException.forbidden(T.NO_DUST);
      await this.currencies.push(session);
    }
    return async () => {
      if (cost.gold > 0) session.callback('onUPP', { gold: await this.characters.addMoney(cid, 'gold', cost.gold) });
      if (cost.dust > 0) {
        await this.currencies.credit(cid, 'stoneSealPoint', cost.dust);
        await this.currencies.push(session);
      }
    };
  }

  /** stoneSealBore(equipSid, sealIndex, payMode, diamondItemId): payMode 1 gold, 2 dust + one Kim Cương of the hole's colour. */
  bore(session: Session, sid: number, idx: number, payMode: number, diamondId: number): Promise<StoneSealReply> {
    const cid = session.characterId!;
    return this.run(session, async () => {
      const plan = must(planBore(await this.load(cid), sid, idx, payMode));
      if (plan.cost.diamondColor >= 0) {
        const diamond = await this.items.findOne({
          _id: diamondId, characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.ITEM, templateId: STONE_SEAL.DIAMOND_TEMPLATE,
          colorCode: { $gte: plan.cost.diamondColor }, stackCount: { $gte: 1 },
        }).lean();
        if (!diamond) throw RpcException.forbidden(T.NO_DIAMOND);
      }
      const refund = await this.charge(session, plan.cost);
      let pushes: Push[] = [];
      try {
        if (plan.cost.diamondColor >= 0) pushes = (await this.forgeItems.consume(cid, [{ id: diamondId, count: 1 }])).pushes;
        await this.save(cid, plan.state);
      } catch (e) {
        await refund();
        throw e;
      }
      sendPushes(session, pushes);
      return plan.state;
    });
  }

  succinct(session: Session, sid: number, payMode: number): Promise<StoneSealReply> {
    const cid = session.characterId!;
    return this.run(session, async () => {
      const plan = must(planSuccinct(await this.load(cid), sid, payMode));
      const refund = await this.charge(session, plan.cost);
      try {
        await this.save(cid, plan.state);
      } catch (e) {
        await refund();
        throw e;
      }
      this.logger.debug(`seal level ${sid} -> ${plan.state[sid]?.lvl}`);
      return plan.state;
    });
  }
}
