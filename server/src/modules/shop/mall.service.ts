// Mall (system shop): the slot list of the system shop ids and buySystemItemClient. Prices are gold only (selected gold type),
// point rows are refused; capacity check, charge and refund are the NPC shop pipeline (ShopService.settle).

import { Injectable } from '@nestjs/common';
import { SYSTEM_SHOP_IDS, type MallSlotView, type OpenMall } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterService } from '../character/character.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { isMallSlot, resolveMallPrice } from './mall-rules';
import { SLOT_TYPE_EQUIP } from './shop-mapping';
import { ShopService, type BuyResult } from './shop.service';

const MAX_AMOUNT = 99999;

@Injectable()
export class MallService {
  private cache: OpenMall | null = null;

  constructor(
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly shop: ShopService,
  ) {}

  /** Visible slots of every system shop with their category (shop id); static data, built once. */
  async mall(): Promise<OpenMall> {
    if (this.cache) return this.cache;
    const shops = SYSTEM_SHOP_IDS.flatMap((id) => {
      const row = this.gameData.getShop(id);
      return row ? [{ id, name: String(row.name ?? `#${id}`) }] : [];
    });
    const rows = shops.flatMap((s) => this.gameData.shopSlots(s.id).filter(isMallSlot));
    const views = await this.shop.viewSlots(rows, 1);
    const slots: MallSlotView[] = views.map((v, i) => ({ ...v, sid: Number(rows[i].sid) }));
    this.cache = { shops, slots };
    return this.cache;
  }

  /** buySystemItemClient(slotId, amount): throws RpcException with the reason (refused points, short of gold, full bag). */
  async buy(characterId: number, slotId: number, amount: number): Promise<BuyResult> {
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) throw RpcException.invalidArgs('số lượng không hợp lệ');
    const slot = this.gameData.getShopSlot(slotId);
    if (!slot || !isMallSlot(slot)) throw RpcException.notFound('vật phẩm không tồn tại');
    const equip = Number(slot.type) === SLOT_TYPE_EQUIP;
    const tpl = await this.gameData.template(equip ? SLOT_TYPE_EQUIP : 29, Number(slot.item_id));
    if (!tpl) throw RpcException.notFound('vật phẩm không tồn tại');
    const prefs = await this.characters.paymentPrefs(characterId);
    const price = resolveMallPrice(slot, prefs.gold);
    if ('error' in price) throw RpcException.invalidArgs(price.error);
    return this.shop.settle(characterId, slot, tpl, equip, price, amount);
  }
}
