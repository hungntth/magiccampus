// Shop logic: builds the onOpenShop payload (slot list with resolved names/icons/prices) and runs buy / sell.
// Buy order: validate -> capacity check -> charge (conditional $inc) -> add to bag (refund on failure).

import { Injectable } from '@nestjs/common';
import { ItemKind, type AddItemNotice, type BagItem, type MoneyKey, type OpenShop } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterService } from '../character/character.service';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';
import { boughtColor, resolvePrice } from './shop-buy';
import { SLOT_TYPE_EQUIP, isVisibleSlot, toShopSlotView } from './shop-mapping';

const MAX_AMOUNT = 99999;

export interface BuyResult {
  amount: number;
  cost: number;
  currencyName: string;
  key: MoneyKey;
  total: number;
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

@Injectable()
export class ShopService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
  ) {}

  /** null when the shop id is unknown. */
  async buildOpenShop(shopId: number, npcId: number): Promise<OpenShop | null> {
    const shop = this.gameData.getShop(shopId);
    if (!shop) return null;
    const shopType = Number(shop.type ?? 0);
    const slots = this.gameData.shopSlots(shopId).filter((s) => isVisibleSlot(Number(s.st ?? 0)));
    const idsFor = (equip: boolean): number[] => [
      ...new Set(slots.filter((s) => (Number(s.type) === SLOT_TYPE_EQUIP) === equip).map((s) => Number(s.item_id))),
    ];
    const [equips, items] = await Promise.all([
      this.gameData.templatesByIds(SLOT_TYPE_EQUIP, idsFor(true)),
      this.gameData.templatesByIds(29, idsFor(false)),
    ]);
    const tplOf = (s: Row): Row | undefined => (Number(s.type) === SLOT_TYPE_EQUIP ? equips : items).get(Number(s.item_id));
    return { shopId, npcId, shopType, slots: slots.map((s) => toShopSlotView(s, tplOf(s), shopType)) };
  }

  /** Buys `amount` of a shop slot for the character standing on `mapId`; throws RpcException with the reason. */
  async buy(characterId: number, mapId: number, slotId: number, amount: number): Promise<BuyResult> {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) throw RpcException.invalidArgs('số lượng không hợp lệ');
    const slot = this.gameData.getShopSlot(slotId);
    if (!slot || !isVisibleSlot(Number(slot.st ?? 0))) throw RpcException.notFound('vật phẩm không tồn tại');
    // H5 hardening (legacy trusts the client): the shop must belong to an NPC on the caller's map.
    const shopId = Number(slot.sid);
    if (!this.gameData.npcsOnMap(mapId).some((n) => Number(n.shop_id ?? 0) === shopId)) {
      throw RpcException.forbidden('cửa hàng không ở gần bạn');
    }
    const equip = Number(slot.type) === SLOT_TYPE_EQUIP;
    const tpl = await this.gameData.template(equip ? SLOT_TYPE_EQUIP : 29, Number(slot.item_id));
    if (!tpl) throw RpcException.notFound('vật phẩm không tồn tại');
    const prefs = await this.characters.paymentPrefs(characterId);
    const price = resolvePrice(slot, tpl, prefs.money, prefs.gold);
    if ('error' in price) throw RpcException.invalidArgs(price.error);
    const cost = price.unit * amount;
    const spec = {
      templateId: Number(slot.item_id),
      itemType: equip ? ItemKind.EQUIP : ItemKind.ITEM,
      bound: price.bound,
      color: boughtColor(slot, tpl, equip),
      amount,
      maxStack: maxStack(tpl),
    };
    if (!(await this.inventory.canFit(characterId, spec))) throw RpcException.invalidArgs('Túi đồ đã đầy');
    const total = await this.characters.spendMoney(characterId, price.key, cost);
    if (total === null) throw RpcException.invalidArgs(price.key.startsWith('gold') ? 'Không đủ vàng' : 'Không đủ bạc');
    let changed: BagItem[];
    try {
      changed = await this.inventory.add(characterId, spec, equip ? Number(tpl.endure_max ?? 0) || 0 : 0);
    } catch (e) {
      await this.characters.addMoney(characterId, price.key, cost);
      throw e;
    }
    const notice: AddItemNotice = { i: spec.templateId, q: amount, t: spec.itemType, n: String(tpl.name ?? `#${spec.templateId}`) };
    return { amount, cost, currencyName: price.currencyName, key: price.key, total, notice, changed };
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
