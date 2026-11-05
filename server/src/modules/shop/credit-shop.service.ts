// Credit point shops (TBL_CREDIT, NPCs like 2318 -> shop 2): the openShopById payload, updateLimit counters and exchangeItem.
// Order (Go credit.go): bag fits the whole amount -> balances checked -> limit reserved (conditional upsert) -> points spent ->
// item granted; a failure gives the points back and releases the limit. Balances live in Character.currencies (CurrencyService).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  CREDIT_SHOPS, CreditLimitType, creditLimitDictKey, creditPeriodKey, emptyCreditLimits, ItemKind,
  type AddItemNotice, type BagItem, type CreditLimits, type CurrencyKey, type OpenCreditShop,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { CurrencyService } from '../progression/currency.service';
import { CreditPurchase } from './credit-shop.schema';
import {
  CREDIT_TABLE_EQUIP, CREDIT_TABLE_ITEM, creditColor, creditCosts, exchangeAmount, isLimited, toCreditSlot, withinLimit,
  type CreditCost,
} from './credit-shop-rules';

const isDuplicate = (e: unknown): boolean => (e as { code?: number }).code === 11000;
const LIMIT_REACHED = 'đã đạt giới hạn đổi';

export interface ExchangeResult {
  costs: (CreditCost & { total: number })[];
  notice: AddItemNotice;
  changed: BagItem[];
  /** Counter dict of the credit's limit type (the exchangeItem reply); {} when the credit is unlimited. */
  limitDict: Record<string, number>;
  balances: Partial<Record<CurrencyKey, number>>;
}

@Injectable()
export class CreditShopService {
  constructor(
    @InjectModel(CreditPurchase.name) private readonly purchases: Model<CreditPurchase>,
    private readonly gameData: GameDataService,
    private readonly currencies: CurrencyService,
    private readonly inventory: InventoryService,
  ) {}

  /** The openShopById payload, or null for an unknown shop id (rows with is_sell = 0 are hidden like the Flash panel does). */
  async buildOpen(characterId: number, shopId: number): Promise<OpenCreditShop | null> {
    const def = CREDIT_SHOPS[shopId];
    if (!def) return null;
    const rows = this.gameData.creditRows(shopId).filter((r) => Number(r.is_sell ?? 0) !== 0);
    const [equips, items] = await Promise.all([
      this.gameData.templatesByIds(CREDIT_TABLE_EQUIP, [...new Set(rows.filter((r) => Number(r.type) === CREDIT_TABLE_EQUIP).map((r) => Number(r.item_id)))]),
      this.gameData.templatesByIds(CREDIT_TABLE_ITEM, [...new Set(rows.filter((r) => Number(r.type) !== CREDIT_TABLE_EQUIP).map((r) => Number(r.item_id)))]),
    ]);
    const slots = rows.map((r) => toCreditSlot(r, (Number(r.type) === CREDIT_TABLE_EQUIP ? equips : items).get(Number(r.item_id))));
    const balances = await this.currencies.balances(characterId);
    const balance = new Map<string, number | undefined>(Object.entries(balances)).get(def.prop) ?? 0;
    return { shopId, name: def.name, prop: def.prop, score: def.score, unit: def.unit, hint: def.hint, balance, tabs: def.tabs, slots };
  }

  /** updateLimit(): the counters of the current day / week / month / lifetime buckets. */
  async limits(characterId: number, now = Date.now()): Promise<CreditLimits> {
    const out = emptyCreditLimits();
    const periods = [CreditLimitType.DAY, CreditLimitType.WEEK, CreditLimitType.MONTH, CreditLimitType.TOTAL].map((t) => creditPeriodKey(t, now));
    const docs = await this.purchases.find({ characterId, period: { $in: periods } }).lean();
    for (const d of docs) {
      const limitType = Number(this.gameData.credit(d.creditId)?.limit_type ?? 0);
      const key = creditLimitDictKey(limitType);
      // a Monday's week key equals its day key: the credit's own limit type decides which bucket counts
      if (key && creditPeriodKey(limitType, now) === d.period && d.count > 0) out[key][String(d.creditId)] = d.count;
    }
    return out;
  }

  /** exchangeItem: throws RpcException with the refusal text; one exchange at a time per character. */
  exchange(characterId: number, creditId: number, requested: number, now = Date.now()): Promise<ExchangeResult> {
    return withCharLock(characterId, () => this.run(characterId, creditId, requested, now));
  }

  private async run(cid: number, creditId: number, requested: number, now: number): Promise<ExchangeResult> {
    const row = this.gameData.credit(creditId);
    if (!row) throw RpcException.notFound('vật phẩm không tồn tại');
    const tableType = Number(row.type);
    if (tableType !== CREDIT_TABLE_EQUIP && tableType !== CREDIT_TABLE_ITEM) throw RpcException.invalidArgs(`loại vật phẩm ${tableType} chưa được hỗ trợ`);
    const amount = exchangeAmount(row, requested);
    const tpl = await this.gameData.template(tableType, Number(row.item_id));
    if (!tpl) throw RpcException.notFound('vật phẩm không tồn tại');
    const costs = creditCosts(row, amount);
    if ('error' in costs) throw RpcException.invalidArgs(costs.error);
    const balances = await this.currencies.balances(cid);
    for (const c of costs) if ((balances[c.key] ?? 0) < c.amount) throw RpcException.invalidArgs(`không đủ ${c.unit}`);
    const equip = tableType === CREDIT_TABLE_EQUIP;
    const spec = {
      templateId: Number(row.item_id), itemType: equip ? ItemKind.EQUIP : ItemKind.ITEM, bound: Number(row.bind) > 0,
      color: creditColor(row), amount, maxStack: maxStack(tpl),
    };
    if (!(await this.inventory.canFit(cid, spec))) throw RpcException.invalidArgs('Túi đồ đã đầy');

    const release = await this.reserve(cid, row, amount, now);
    const spent: (CreditCost & { total: number })[] = [];
    const undo = async (): Promise<void> => {
      for (const s of spent) await this.currencies.credit(cid, s.key, s.amount);
      await release();
    };
    let changed: BagItem[];
    try {
      for (const c of costs) {
        const total = await this.currencies.spend(cid, c.key, c.amount);
        if (total === null) throw RpcException.invalidArgs(`không đủ ${c.unit}`);
        spent.push({ ...c, total });
      }
      changed = await this.inventory.add(cid, spec, equip ? Number(tpl.endure_max ?? 0) || 0 : 0);
    } catch (e) {
      await undo();
      throw e;
    }
    const notice: AddItemNotice = { i: spec.templateId, q: amount, t: spec.itemType, n: String(tpl.name ?? `#${spec.templateId}`) };
    return { costs: spent, notice, changed, limitDict: await this.dictOf(cid, row, now), balances: await this.currencies.balances(cid) };
  }

  /** Reserves `amount` units of the credit's limit (conditional upsert); returns the release function (no-op when unlimited). */
  private async reserve(cid: number, row: Row, amount: number, now: number): Promise<() => Promise<void>> {
    if (!isLimited(row)) return async () => undefined;
    const limitNum = Number(row.limit_num ?? 0);
    if (!withinLimit(limitNum, 0, amount)) throw RpcException.forbidden(LIMIT_REACHED);
    const id = Number(row.id);
    const period = creditPeriodKey(Number(row.limit_type), now);
    const key = { characterId: cid, creditId: id, period };
    try {
      const hit = await this.purchases.findOneAndUpdate(
        { ...key, count: { $lte: limitNum - amount } }, { $inc: { count: amount } }, { upsert: true, new: true },
      );
      if (!hit) throw RpcException.forbidden(LIMIT_REACHED);
    } catch (e) {
      // the filter missed (count too high) and the upsert then collided with the unique key
      if (isDuplicate(e)) throw RpcException.forbidden(LIMIT_REACHED);
      throw e;
    }
    return async () => void (await this.purchases.updateOne(key, { $inc: { count: -amount } }));
  }

  /** The reply dict: counts of the credit's limit type in the current period, for every limited credit of that type. */
  private async dictOf(cid: number, row: Row, now: number): Promise<Record<string, number>> {
    if (!isLimited(row)) return {};
    const key = creditLimitDictKey(Number(row.limit_type))!;
    return (await this.limits(cid, now))[key];
  }
}
