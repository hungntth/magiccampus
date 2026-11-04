// VIP shop service over shop 99: the member's slot list (shared 4-hour rotation, personal refresh), discounted gold prices and
// buying through the shop pipeline (ShopService.settle). Purchase is marked per slot (compare-and-set) BEFORE the charge and
// unmarked when the pipeline fails; the refresh spends its gold first and refunds when the state write loses a race.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  PM_MAX_LEVEL, ShopCurrency, VIP_SHOP_DISCOUNT, VIP_SHOP_ID, vipShopPrice,
  type BuyVipShopItemReply, type VipShopConfigReply, type VipShopSlotView,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { pushBuy } from '../shop/buy-pushes';
import { CURRENCY_NAMES } from '../shop/shop-buy';
import { SLOT_TYPE_EQUIP, isVisibleSlot } from '../shop/shop-mapping';
import { ShopService } from '../shop/shop.service';
import { PmStateService } from './pm-state.service';
import {
  buyError, currentState, nextRotationMs, refreshCost, refreshed, refreshesLeft, type PoolSlot, type Rng, type ShopState,
} from './vip-shop-rules';
import { CharacterVipShop } from './vip-shop.schema';

const NOT_VIP = 'Chỉ có VIP mới có thể sử dụng Shop VIP!';
const BUSY = 'Hệ thống bận, vui lòng thử lại';

@Injectable()
export class VipShopService {
  constructor(
    @InjectModel(CharacterVipShop.name) private readonly shops: Model<CharacterVipShop>,
    private readonly gameData: GameDataService,
    private readonly shop: ShopService,
    private readonly characters: CharacterService,
    private readonly pm: PmStateService,
  ) {}

  private slotRows(): Row[] {
    return this.gameData.shopSlots(VIP_SHOP_ID).filter((s) => isVisibleSlot(Number(s.st ?? 0)));
  }

  private pool(): PoolSlot[] {
    return this.slotRows().map((s) => ({ id: Number(s.id), weight: Number(s.r ?? 0) }));
  }

  private async level(characterId: number): Promise<number> {
    const level = await this.pm.levelOf(characterId);
    if (level < 1) throw RpcException.forbidden(NOT_VIP);
    return level;
  }

  /** Saved state brought up to `now` (new rotation / new day) and persisted when it changed. */
  private async stateOf(characterId: number, now: number): Promise<ShopState> {
    const saved = await this.shops.findOne({ characterId }).lean<ShopState | null>();
    const before = saved ? pickState(saved) : null;
    const state = currentState(before, this.pool(), now);
    if (!before || JSON.stringify(before) !== JSON.stringify(state)) {
      await this.shops.updateOne({ characterId }, { $set: state, $setOnInsert: { characterId } }, { upsert: true }).catch((e: { code?: number }) => {
        if (e.code !== 11000) throw e;
      });
    }
    return state;
  }

  /** getVipShopConfig: the member's current slot list with discounted prices. */
  async config(characterId: number, now = Date.now()): Promise<VipShopConfigReply> {
    const level = await this.level(characterId);
    return this.build(await this.stateOf(characterId, now), level, now);
  }

  private async build(state: ShopState, level: number, now: number): Promise<VipShopConfigReply> {
    const rows = state.slotIds.flatMap((id) => {
      const r = this.gameData.getShopSlot(id);
      return r ? [r] : [];
    });
    const views = await this.shop.viewSlots(rows, 1);
    const vipShop: Record<string, VipShopSlotView> = {};
    views.forEach((v, i) => {
      const base = Number(rows[i].gold ?? 0);
      const gold = vipShopPrice(base, level);
      vipShop[String(i)] = {
        ...v, idx: i, baseGold: base, gold, bought: state.purchased.includes(v.slotId), prices: [{ currency: ShopCurrency.GOLD, cost: gold }],
      };
    });
    const plan = refreshCost(state);
    return {
      flag: true, vipShop, reflashTime: nextRotationMs(now), shopDynamic: [], refreshLeft: refreshesLeft(state),
      refreshCost: 'cost' in plan ? plan.cost : 0, discount: VIP_SHOP_DISCOUNT[Math.min(level, PM_MAX_LEVEL)] ?? 0,
    };
  }

  /** getVipShopCharConfig: personal refresh (the first of the day is free, then 20 gold, 5 a day). */
  async refresh(session: Session, rng: Rng = Math.random, now = Date.now()): Promise<VipShopConfigReply> {
    const cid = session.characterId!;
    const level = await this.level(cid);
    const state = await this.stateOf(cid, now);
    const plan = refreshCost(state);
    if ('error' in plan) throw RpcException.forbidden(plan.error);
    let total: number | null = null;
    if (plan.cost > 0) {
      total = await this.characters.spendMoney(cid, 'gold', plan.cost);
      if (total === null) throw RpcException.invalidArgs('Không đủ vàng');
    }
    const next = refreshed(state, this.pool(), rng);
    const ok = await this.shops.updateOne(
      { characterId: cid, epoch: state.epoch, refreshCount: state.refreshCount },
      { $set: { slotIds: next.slotIds, refreshCount: next.refreshCount, refreshDay: next.refreshDay } },
    );
    if (ok.modifiedCount !== 1) {
      if (plan.cost > 0) await this.characters.addMoney(cid, 'gold', plan.cost);
      throw RpcException.invalidArgs(BUSY);
    }
    if (total !== null) session.callback('onUPP', { gold: total });
    return this.build(next, level, now);
  }

  /** buyVipShopItem(slotId, num): one unit per slot per rotation (num is ignored, like Go), gold only, item unbound. */
  async buy(session: Session, slotId: number, now = Date.now()): Promise<BuyVipShopItemReply> {
    const cid = session.characterId!;
    const level = await this.level(cid);
    const state = await this.stateOf(cid, now);
    const err = buyError(state, slotId);
    if (err) throw RpcException.forbidden(err);
    const slot = this.gameData.getShopSlot(slotId);
    if (!slot || Number(slot.sid) !== VIP_SHOP_ID) throw RpcException.notFound('vật phẩm không tồn tại');
    const equip = Number(slot.type) === SLOT_TYPE_EQUIP;
    const tpl = await this.gameData.template(equip ? SLOT_TYPE_EQUIP : 29, Number(slot.item_id));
    if (!tpl) throw RpcException.notFound('vật phẩm không tồn tại');
    const marked = await this.shops.updateOne(
      { characterId: cid, epoch: state.epoch, slotIds: slotId, purchased: { $ne: slotId } }, { $addToSet: { purchased: slotId } },
    );
    if (marked.modifiedCount !== 1) throw RpcException.forbidden('Vật phẩm này đã mua trong lượt này');
    try {
      const unit = vipShopPrice(Number(slot.gold ?? 0), level);
      const result = await this.shop.settle(cid, slot, tpl, equip, { key: 'gold', unit, currencyName: CURRENCY_NAMES.gold, bound: false }, 1);
      pushBuy(session, result);
    } catch (e) {
      await this.shops.updateOne({ characterId: cid, epoch: state.epoch }, { $pull: { purchased: slotId } });
      throw e;
    }
    return { flag: true, shopDynamic: [] };
  }
}

const pickState = (s: ShopState): ShopState => ({
  epoch: s.epoch, slotIds: s.slotIds, purchased: s.purchased, refreshDay: s.refreshDay, refreshCount: s.refreshCount,
});
