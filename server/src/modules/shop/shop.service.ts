// Shop logic: builds the onOpenShop payload (slot list with resolved names/icons/prices) and runs buy / sell.
// Buy order: validate -> capacity check -> charge (conditional $inc / guild contribution update) -> add to bag (refund on failure).

import { Injectable } from '@nestjs/common';
import {
  GUILD_PRICE_NAMES, GUILD_SHOP_ID, ItemKind, SHOP_DIRECT_IDS,
  type AddItemNotice, type BagItem, type MoneyKey, type OpenShop, type PlayerUpdate, type ShopSlotView,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterService } from '../character/character.service';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { GUILD_SHOP_TEXT, GuildShopService } from '../guild/guild-shop.service';
import { maxStack } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';
import { CurrencyService } from '../progression/currency.service';
import { boughtColor, resolvePrice, type ContribPrice, type PointPrice, type Price } from './shop-buy';
import { SLOT_TYPE_EQUIP, isVisibleSlot, toShopSlotView } from './shop-mapping';

const MAX_AMOUNT = 99999;

export interface BuyResult {
  amount: number;
  cost: number;
  currencyName: string;
  /** Cost part of the success note when the price has two currencies; default `cost currencyName`. */
  costText?: string;
  /** onUPP payload with the new balance(s). */
  update: PlayerUpdate;
  notice: AddItemNotice;
  changed: BagItem[];
}

export interface SellResult {
  item: BagItem;
  gain: number;
  key: MoneyKey;
  total: number;
  currencyName: string;
}

/** A paid charge: what to push and how to give it back. */
interface Charge {
  update: PlayerUpdate;
  cost: number;
  costText?: string;
  refund(): Promise<void>;
}

@Injectable()
export class ShopService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
    private readonly guildShop: GuildShopService,
    private readonly currencies: CurrencyService,
  ) {}

  /** null when the shop id is unknown. */
  async buildOpenShop(shopId: number, npcId: number): Promise<OpenShop | null> {
    const shop = this.gameData.getShop(shopId);
    if (!shop) return null;
    const shopType = Number(shop.type ?? 0);
    const slots = this.gameData.shopSlots(shopId).filter((s) => isVisibleSlot(Number(s.st ?? 0)));
    return { shopId, npcId, shopType, slots: await this.viewSlots(slots, shopType) };
  }

  /** Wire views of shop slots (template names, icons, price lines), in input order. */
  async viewSlots(slots: Row[], shopType: number): Promise<ShopSlotView[]> {
    const idsFor = (equip: boolean): number[] => [
      ...new Set(slots.filter((s) => (Number(s.type) === SLOT_TYPE_EQUIP) === equip).map((s) => Number(s.item_id))),
    ];
    const [equips, items] = await Promise.all([
      this.gameData.templatesByIds(SLOT_TYPE_EQUIP, idsFor(true)),
      this.gameData.templatesByIds(29, idsFor(false)),
    ]);
    const tplOf = (s: Row): Row | undefined => (Number(s.type) === SLOT_TYPE_EQUIP ? equips : items).get(Number(s.item_id));
    return slots.map((s) => toShopSlotView(s, tplOf(s), shopType));
  }

  /** Buys `amount` of a shop slot for the character standing on `mapId`; throws RpcException with the reason. */
  async buy(characterId: number, mapId: number, slotId: number, amount: number): Promise<BuyResult> {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) throw RpcException.invalidArgs('số lượng không hợp lệ');
    const slot = this.gameData.getShopSlot(slotId);
    if (!slot || !isVisibleSlot(Number(slot.st ?? 0))) throw RpcException.notFound('vật phẩm không tồn tại');
    // H5 hardening (legacy trusts the client): the shop must belong to an NPC on the caller's map (openShopDirect shops excepted).
    const shopId = Number(slot.sid);
    if (!SHOP_DIRECT_IDS.includes(shopId) && !this.gameData.npcsOnMap(mapId).some((n) => Number(n.shop_id ?? 0) === shopId)) {
      throw RpcException.forbidden('cửa hàng không ở gần bạn');
    }
    if (shopId === GUILD_SHOP_ID) {
      const note = await this.guildShop.gate(characterId); // Go gates only the open; H5 gates the buy too
      if (note) throw RpcException.forbidden(note);
    }
    const equip = Number(slot.type) === SLOT_TYPE_EQUIP;
    const tpl = await this.gameData.template(equip ? SLOT_TYPE_EQUIP : 29, Number(slot.item_id));
    if (!tpl) throw RpcException.notFound('vật phẩm không tồn tại');
    const prefs = await this.characters.paymentPrefs(characterId);
    const price = resolvePrice(slot, tpl, prefs.money, prefs.gold);
    if ('error' in price) throw RpcException.invalidArgs(price.error);
    return this.settle(characterId, slot, tpl, equip, price, amount);
  }

  /** Shared buy pipeline of NPC and mall shops: capacity check -> conditional charge -> add to the bag (refund on failure). */
  async settle(characterId: number, slot: Row, tpl: Row, equip: boolean, price: Price | ContribPrice | PointPrice, amount: number): Promise<BuyResult> {
    const spec = {
      templateId: Number(slot.item_id),
      itemType: equip ? ItemKind.EQUIP : ItemKind.ITEM,
      bound: price.bound,
      color: boughtColor(slot, tpl, equip),
      amount,
      maxStack: maxStack(tpl),
    };
    if (!(await this.inventory.canFit(characterId, spec))) throw RpcException.invalidArgs('Túi đồ đã đầy');
    const charge = 'contrib' in price ? await this.chargeContrib(characterId, price, amount)
      : 'points' in price ? await this.chargePoints(characterId, price, amount)
        : await this.chargeMoney(characterId, price, amount);
    let changed: BagItem[];
    try {
      changed = await this.inventory.add(characterId, spec, equip ? Number(tpl.endure_max ?? 0) || 0 : 0);
    } catch (e) {
      await charge.refund();
      throw e;
    }
    const notice: AddItemNotice = { i: spec.templateId, q: amount, t: spec.itemType, n: String(tpl.name ?? `#${spec.templateId}`) };
    return { amount, cost: charge.cost, currencyName: price.currencyName, costText: charge.costText, update: charge.update, notice, changed };
  }

  private async chargeMoney(characterId: number, price: Price, amount: number): Promise<Charge> {
    const cost = price.unit * amount;
    const total = await this.characters.spendMoney(characterId, price.key, cost);
    if (total === null) throw RpcException.invalidArgs(price.key.startsWith('gold') ? 'Không đủ vàng' : 'Không đủ bạc');
    return {
      update: { [price.key]: total }, cost,
      refund: async () => void (await this.characters.addMoney(characterId, price.key, cost)),
    };
  }

  /** M14 H: price type 7 pays Huy Chương Dũng Sĩ (Character.currencies), one conditional spend. */
  private async chargePoints(characterId: number, price: PointPrice, amount: number): Promise<Charge> {
    const cost = price.points.unit * amount;
    const left = await this.currencies.spend(characterId, price.points.key, cost);
    if (left === null) throw RpcException.invalidArgs(`Không đủ ${price.currencyName}`);
    return {
      update: { currencies: { [price.points.key]: left } }, cost,
      refund: async () => void (await this.currencies.credit(characterId, price.points.key, cost)),
    };
  }

  /** Shop 83: one conditional update spends the normal and the donate contribution together. */
  private async chargeContrib(characterId: number, price: ContribPrice, amount: number): Promise<Charge> {
    const cost = { normal: price.contrib.normal * amount, donate: price.contrib.donate * amount };
    const left = await this.guildShop.spend(characterId, cost);
    if (!left) {
      const have = await this.guildShop.balance(characterId);
      if (!have) throw RpcException.forbidden(GUILD_SHOP_TEXT.NOT_MEMBER);
      throw RpcException.invalidArgs(`Không đủ ${GUILD_PRICE_NAMES[have.normal < cost.normal ? 20 : 21]}`);
    }
    const parts = [
      ...(cost.normal > 0 ? [`${cost.normal} ${GUILD_PRICE_NAMES[20]}`] : []),
      ...(cost.donate > 0 ? [`${cost.donate} ${GUILD_PRICE_NAMES[21]}`] : []),
    ];
    return {
      update: { guildContrib: left.normal, donateContrib: left.donate }, cost: cost.normal || cost.donate, costText: parts.join(' + '),
      refund: async () => void (await this.guildShop.refund(characterId, cost)),
    };
  }

  /** Sells a whole bag stack for floor(price / 4) per unit; bound items pay Bạc khóa, others Bạc. */
  async sell(characterId: number, itemId: number): Promise<SellResult> {
    const { item, unit } = await this.inventory.removeForSale(characterId, itemId);
    const key: MoneyKey = item.binded ? 'moneyBind' : 'money';
    const gain = unit * item.stackNum;
    const total = await this.characters.addMoney(characterId, key, gain);
    return { item, gain, key, total, currencyName: key === 'moneyBind' ? 'Bạc khóa' : 'Bạc' };
  }
}
