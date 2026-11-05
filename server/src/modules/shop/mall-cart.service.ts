// Mall trolley (buySystemItemMulti, SystemShopTrolleyPanel): the whole cart is priced and capacity-checked first, each currency is
// spent once, then the items are added one by one; a failure part way refunds only the lines not yet added (Go service.go
// BuySystemItemMulti). Mall prices as buySystemItemClient: gold only, point rows refused. One cart at a time per character.

import { Injectable } from '@nestjs/common';
import { ItemKind, type AddItemNotice, type BagItem, type MoneyKey, type PlayerUpdate } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterService } from '../character/character.service';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { maxStack, type AddSpec } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { cartTotals, isMallSlot, parseCart, resolveMallPrice } from './mall-rules';
import { boughtColor, type Price } from './shop-buy';
import { SLOT_TYPE_EQUIP } from './shop-mapping';

interface Line {
  slot: Row;
  tpl: Row;
  equip: boolean;
  price: Price;
  amount: number;
  cost: number;
  spec: AddSpec;
}

export interface CartResult {
  success: boolean;
  items: AddItemNotice[];
  changed: BagItem[];
  update: PlayerUpdate;
  /** Refusal text when `success` is false (nothing charged, or the unadded remainder refunded). */
  failure?: string;
}

@Injectable()
export class MallCartService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
    private readonly inventory: InventoryService,
  ) {}

  buy(characterId: number, rawList: unknown): Promise<CartResult> {
    const rows = parseCart(rawList);
    if ('error' in rows) throw RpcException.invalidArgs(rows.error);
    return withCharLock(characterId, () => this.run(characterId, rows));
  }

  private async run(cid: number, rows: { slotId: number; amount: number }[]): Promise<CartResult> {
    const prefs = await this.characters.paymentPrefs(cid);
    const lines: Line[] = [];
    for (const r of rows) lines.push(await this.line(r.slotId, r.amount, prefs.gold));
    if (!(await this.inventory.canFitAll(cid, lines.map((l) => l.spec)))) throw RpcException.invalidArgs('Túi đồ đã đầy');

    const totals = new Map<MoneyKey, number>(); // balance after the spend of every currency
    const spent: [MoneyKey, number][] = [];
    for (const [key, cost] of cartTotals(lines.map((l) => ({ key: l.price.key, cost: l.cost })))) {
      const left = await this.characters.spendMoney(cid, key, cost);
      if (left === null) {
        for (const [k, c] of spent) await this.characters.addMoney(cid, k, c);
        throw RpcException.invalidArgs('Không đủ vàng');
      }
      spent.push([key, cost]);
      totals.set(key, left);
    }

    const items: AddItemNotice[] = [];
    const changed: BagItem[] = [];
    for (const [i, l] of lines.entries()) {
      try {
        changed.push(...(await this.inventory.add(cid, l.spec, l.equip ? Number(l.tpl.endure_max ?? 0) || 0 : 0)));
        items.push({ i: l.spec.templateId, q: l.amount, t: l.spec.itemType, n: String(l.tpl.name ?? `#${l.spec.templateId}`) });
      } catch (e) {
        // refund the unpaid remainder (this line and the rest), keep what was added
        for (const [key, cost] of cartTotals(lines.slice(i).map((x) => ({ key: x.price.key, cost: x.cost })))) {
          totals.set(key, await this.characters.addMoney(cid, key, cost));
        }
        const failure = e instanceof RpcException ? e.message : 'Lỗi hệ thống';
        return { success: false, items, changed, update: this.update(totals), failure };
      }
    }
    return { success: true, items, changed, update: this.update(totals) };
  }

  private update(totals: Map<MoneyKey, number>): PlayerUpdate {
    return Object.fromEntries(totals) as PlayerUpdate;
  }

  private async line(slotId: number, amount: number, gold: MoneyKey): Promise<Line> {
    const slot = this.gameData.getShopSlot(slotId);
    if (!slot || !isMallSlot(slot)) throw RpcException.notFound('vật phẩm không tồn tại');
    const equip = Number(slot.type) === SLOT_TYPE_EQUIP;
    const tpl = await this.gameData.template(equip ? SLOT_TYPE_EQUIP : 29, Number(slot.item_id));
    if (!tpl) throw RpcException.notFound('vật phẩm không tồn tại');
    const price = resolveMallPrice(slot, gold);
    if ('error' in price) throw RpcException.invalidArgs(price.error);
    const spec: AddSpec = {
      templateId: Number(slot.item_id), itemType: equip ? ItemKind.EQUIP : ItemKind.ITEM, bound: price.bound,
      color: boughtColor(slot, tpl, equip), amount, maxStack: maxStack(tpl),
    };
    return { slot, tpl, equip, price, amount, cost: price.unit * amount, spec };
  }
}
