// Generic reward grant for M10 content (dungeon chests, tower first kills, event bags): bag items (item / equipment table,
// bound or not, graded colour), special currencies, exp and bound silver. One bag-space precheck for every item before
// anything is granted (`fits`); gift bags are unpacked into their contents (decision 11). Pushes go to the session in the
// quest-reward order: onAddMoney / onUPP (exp + silver, level-up) -> onAddItem + onAddCharactorSlot -> onUPP {currencies}.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, resolveCurrency, type CurrencyKey, type MoneyKey } from '@mc/shared';
import { Character } from '../character/character.schema';
import { RewardGrantService } from '../activity-rewards/reward-grant.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceDataService } from '../gamedata/instance-data';
import { maxStack, type AddSpec } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';
import { CurrencyService } from '../progression/currency.service';
import { awardColorCode, pickItemAwards, randIntOf, type ItemAwardRow } from './item-award';
import { gradeColor, type PlanDrop } from './plan-roller';
import type { PushSink } from './push-sink';

export type Grant =
  | { kind: 'item'; table: number; templateId: number; qty: number; bound: boolean; color?: number }
  | { kind: 'currency'; key: CurrencyKey; amount: number }
  | { kind: 'exp'; amount: number }
  | { kind: 'silver'; amount: number } // bound silver (moneyBind)
  | { kind: 'money'; key: MoneyKey; amount: number }; // wallet money / gold (award type 30, money chests, kim phieu)

const EQUIP_TABLE = 19;
const ITEM_TABLE = 29;
const CURRENCY_TYPES: ReadonlySet<number> = new Set([30, 35]);
const EXP_TYPE = 31;
/** Award type 30 basic currency ids (Go BasicCurrencyDescriptor) that are wallet fields: 0 bac, 1 vang, 3 kim phieu. 2 (honor) is a special currency. */
const BASIC_MONEY: Readonly<Record<number, MoneyKey>> = { 0: 'money', 1: 'gold', 3: 'goldBind' };

@Injectable()
export class GrantService {
  private readonly logger = new Logger(GrantService.name);

  constructor(
    private readonly gameData: GameDataService,
    private readonly instanceData: InstanceDataService,
    private readonly inventory: InventoryService,
    private readonly currencies: CurrencyService,
    private readonly expSilver: RewardGrantService,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  /** Plan drops as grants; medal rows (ti 98) and unknown tables are skipped with a log line (decision 12). */
  fromPlan(drops: readonly PlanDrop[]): Grant[] {
    const out: Grant[] = [];
    for (const d of drops) {
      if (d.table !== ITEM_TABLE && d.table !== EQUIP_TABLE) {
        this.logger.log(`plan row ${d.rowId}: table ${d.table} (${d.templateId}) has no H5 system, skipped`);
        continue;
      }
      const color = gradeColor(d.grade);
      out.push({ kind: 'item', table: d.table, templateId: d.templateId, qty: d.qty, bound: d.bound, ...(color >= 0 ? { color } : {}) });
    }
    return out;
  }

  /**
   * A gift bag's contents (one Go award-picker draw), as grants. Bags inside bags are unpacked once more. `bound` is the bind of
   * the opened bag (dungeon chests are always bound). Pets (12) and titles (33) are not grants: the item-use AwardBagService
   * handles them, other callers skip them with a log line.
   */
  unpack(bagId: number, rng: () => number, depth = 0, bound = true): Grant[] {
    const out: Grant[] = [];
    for (const r of pickItemAwards(this.instanceData.itemAwardRows(bagId), randIntOf(rng))) {
      out.push(...this.fromAwardRow(r, rng, { depth, bound }));
    }
    return out;
  }

  /**
   * One picked award row as grants (empty when the row type has no grant here). `nested` (default on) unpacks an item row that is
   * itself a bag (dungeon chests); opening a bag by hand (item-use) passes false and grants the inner bag as an item, like Go.
   */
  fromAwardRow(r: ItemAwardRow, rng: () => number, opts: { depth?: number; bound?: boolean; nested?: boolean } = {}): Grant[] {
    const { depth = 0, bound = true, nested = true } = opts;
    if (r.type === 30 && BASIC_MONEY[r.awardId]) return [{ kind: 'money', key: BASIC_MONEY[r.awardId], amount: r.count }];
    if (CURRENCY_TYPES.has(r.type)) {
      const key = resolveCurrency(r.awardId);
      if (key) return [{ kind: 'currency', key, amount: r.count }];
      this.logger.log(`bag ${r.bagId}: currency ${r.awardId} has no H5 key, skipped`);
      return [];
    }
    if (r.type === EXP_TYPE) return [{ kind: 'exp', amount: r.count }];
    if (nested && r.type === ITEM_TABLE && depth < 2 && this.instanceData.itemAwardRows(r.awardId).length > 0) {
      const out: Grant[] = [];
      for (let i = 0; i < r.count; i++) out.push(...this.unpack(r.awardId, rng, depth + 1, bound));
      return out;
    }
    if (r.type === ITEM_TABLE || r.type === EQUIP_TABLE) {
      const q = awardColorCode(r.quality);
      return [{ kind: 'item', table: r.type, templateId: r.awardId, qty: r.count, bound, ...(q > 0 ? { color: q } : {}) }];
    }
    this.logger.log(`bag ${r.bagId}: award type ${r.type} (${r.awardId}) not granted`);
    return [];
  }

  private async specs(grants: readonly Grant[]): Promise<{ spec: AddSpec; durability: number; name: string }[]> {
    const out: { spec: AddSpec; durability: number; name: string }[] = [];
    for (const g of grants) {
      if (g.kind !== 'item' || g.qty <= 0) continue;
      const tpl = await this.gameData.template(g.table, g.templateId);
      if (!tpl) {
        this.logger.warn(`grant: template ${g.table}/${g.templateId} not found, skipped`);
        continue;
      }
      const equip = g.table === EQUIP_TABLE;
      const color = g.color ?? (equip ? Number(tpl.color_code ?? 0) : 0);
      const spec: AddSpec = {
        templateId: g.templateId, itemType: equip ? ItemKind.EQUIP : ItemKind.ITEM, bound: g.bound, color, amount: g.qty,
        maxStack: maxStack(tpl),
      };
      out.push({ spec, durability: equip ? Number(tpl.endure_max ?? 0) : 0, name: String(tpl.name ?? `#${g.templateId}`) });
    }
    return out;
  }

  /** Whether every item grant fits the bag at once. */
  async fits(characterId: number, grants: readonly Grant[]): Promise<boolean> {
    return this.inventory.canFitAll(characterId, (await this.specs(grants)).map((s) => s.spec));
  }

  /** Grants everything (call `fits` first when a full bag must refuse). Returns false when an item could not be added. */
  async grant(session: PushSink, grants: readonly Grant[]): Promise<boolean> {
    const cid = session.characterId!;
    const exp = grants.reduce((s, g) => s + (g.kind === 'exp' ? g.amount : 0), 0);
    const silver = grants.reduce((s, g) => s + (g.kind === 'silver' ? g.amount : 0), 0);
    if (exp > 0 || silver > 0) await this.expSilver.grantExpSilver(session, exp, silver);
    let complete = true;
    for (const s of await this.specs(grants)) {
      try {
        const changed = await this.inventory.add(cid, s.spec, s.durability);
        session.callback('onAddItem', { i: s.spec.templateId, q: s.spec.amount, t: s.spec.itemType, n: s.name });
        for (const slot of changed) session.callback('onAddCharactorSlot', slot);
      } catch (e) {
        complete = false;
        this.logger.warn(`character ${cid}: grant ${s.spec.templateId} x${s.spec.amount} failed: ${(e as Error).message}`);
      }
    }
    const wallet: Partial<Record<MoneyKey, number>> = {};
    for (const g of grants) {
      if (g.kind !== 'money' || g.amount <= 0) continue;
      const saved = await this.chars.findByIdAndUpdate(cid, { $inc: { [g.key]: g.amount } }, { new: true, projection: { [g.key]: 1 } }).lean();
      if (!saved) continue;
      wallet[g.key] = saved[g.key] ?? 0;
      session.callback('onAddMoney', cid, g.key, g.amount, saved[g.key] ?? 0);
    }
    if (Object.keys(wallet).length > 0) session.callback('onUPP', wallet);
    const cur = grants.filter((g): g is Extract<Grant, { kind: 'currency' }> => g.kind === 'currency' && g.amount > 0);
    for (const g of cur) await this.currencies.credit(cid, g.key, g.amount);
    if (cur.length > 0) await this.currencies.push(session);
    return complete;
  }
}
