// Wing level-up (legacy newWingAdvanced / showNewWingPro / buyCritItem, WingFuncPanel tab 8). Only the WORN, bound wing of colour >= purple
// levels up: each Linh Vũ (3627) is 10 exp, a crit charm (3628) multiplies it x2 / x5 / x10, mode 2 runs until the next level. The state travels
// as the onShowNewWingPro push (no responder); buyCritItem buys charms at their template gold price (unbound gold only) and also pushes
// updateCritItemNum. Items are consumed before the level is written.

import { Injectable } from '@nestjs/common';
import {
  ItemKind, WING_CRIT_BUY_MAX, WING_ITEM, WING_LEVEL_MAX, WING_TEXT, starMultiplier, wingLevelExpFor, wingLevelPercent, wingLookCodes, wingResFor,
  type CritItemNum, type NewWingProState, type WingProKeys,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterService } from '../character/character.service';
import type { Rng } from '../forge/craft-rules';
import { refuseIf } from '../forge/forge-guard';
import type { Out } from '../forge/refine.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { WingItemsService, type WingRow } from './wing-items.service';
import { planAdvance } from './wing-rules';

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const keys = (a: number, b: number, c: number, d: number): WingProKeys => ({ mainPropNum1: a, mainPropNum2: b, propNum1: c, propNum2: d });

@Injectable()
export class WingAdvanceService {
  constructor(
    private readonly wings: WingItemsService,
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
    private readonly characters: CharacterService,
  ) {}

  private async counts(cid: number): Promise<CritItemNum> {
    const m = await this.inventory.countByTemplate(cid, [WING_ITEM.EXP, WING_ITEM.CRIT]);
    return { num1: m.get(WING_ITEM.EXP) ?? 0, num2: m.get(WING_ITEM.CRIT) ?? 0 };
  }

  /** The onShowNewWingPro payload (zeros without a worn wing). */
  async state(cid: number, worn?: WingRow | null): Promise<NewWingProState> {
    const w = worn === undefined ? await this.wings.worn(cid) : worn;
    const c = await this.counts(cid);
    if (!w) return { ...c, level: 0, curExp: 0, nextExp: 0, curAdd: keys(0, 0, 0, 0), nextAdd: keys(0, 0, 0, 0), basicPro: keys(0, 0, 0, 0), arr: ['0', '0', '0'], curRescode: '0', eid: 0 };
    const { level } = w.wing;
    const cur = wingLevelPercent(level);
    const next = level < WING_LEVEL_MAX ? wingLevelPercent(level + 1) : 0;
    const p = w.row.properties ?? {};
    const line = (n: 'mainPropNum1' | 'mainPropNum2' | 'propNum1' | 'propNum2', tpl: string): number => (p[n] !== undefined ? int(p[n]) : int(w.tpl[tpl]));
    const mult = starMultiplier(w.row.star ?? 0);
    return {
      ...c, level, curExp: w.wing.exp, nextExp: wingLevelExpFor(level, w.row.templateId), curAdd: keys(cur, cur, cur, cur), nextAdd: keys(next, next, next, next),
      basicPro: keys(Math.floor(line('mainPropNum1', 'main_prop_num1') * mult), Math.floor(line('mainPropNum2', 'main_prop_num2') * mult), line('propNum1', 'prop_num1'), line('propNum2', 'prop_num2')),
      arr: wingLookCodes(w.base, w.colour, w.wing.dye).map(String), curRescode: wingResFor(w.base, w.colour, level, w.wing.look, w.wing.dye), eid: w.row._id,
    };
  }

  /** showNewWingPro: the state push only. */
  async show(cid: number): Promise<Out<null>> {
    return { reply: null, pushes: [push('onShowNewWingPro', await this.state(cid))] };
  }

  /** newWingAdvanced(useCrit, mode): throws a refusal (the RPC shows it and still pushes the state). */
  advance(cid: number, useCrit: boolean, mode: number, rng: Rng = Math.random): Promise<Out<null>> {
    return withCharLock(cid, async () => {
      const w = await this.wings.worn(cid);
      refuseIf((!w || !w.row.isBound || w.colour < 3) && WING_TEXT.ADVANCE_RULE);
      const worn = w!;
      refuseIf(worn.wing.level >= WING_LEVEL_MAX && WING_TEXT.MAX_LEVEL);
      const c = await this.counts(cid);
      refuseIf(c.num1 <= 0 && WING_TEXT.NO_MATERIAL);
      const plan = planAdvance(worn.wing.level, worn.wing.exp, worn.row.templateId, c.num1, useCrit ? c.num2 : 0, useCrit, mode, rng);
      const pushes: Push[] = [];
      for (const [tid, n] of [[WING_ITEM.EXP, plan.used], [WING_ITEM.CRIT, plan.critUsed]] as const) {
        if (n <= 0) continue;
        const taken = await this.inventory.removeByTemplate(cid, tid, n);
        pushes.push(...taken.updated.map((u) => push('onAddCharactorSlot', u)), ...taken.deleted.map((d) => push('onDelCharactorSlot', d.id, d.sid)));
      }
      await this.wings.write(cid, worn.row._id, { 'properties.wing': { ...worn.wing, level: plan.level, exp: plan.exp } });
      pushes.push(...(await this.wings.slotPushes(cid, worn.row._id)));
      await this.wings.after(cid, true, { look: plan.level !== worn.wing.level });
      pushes.push(push('onShowNewWingPro', await this.state(cid)));
      return { reply: null, pushes };
    });
  }

  /** buyCritItem(n): unbound gold at the template price; pushes the item, the gold, updateCritItemNum and the state. */
  buyCrit(cid: number, n: number): Promise<Out<null>> {
    return withCharLock(cid, async () => {
      if (!Number.isInteger(n) || n < 1 || n > WING_CRIT_BUY_MAX) throw RpcException.invalidArgs('n');
      const tpl = await this.gameData.template(29, WING_ITEM.CRIT);
      const price = int(tpl?.gold);
      if (!tpl || price <= 0) throw RpcException.forbidden(WING_TEXT.NO_GOLD);
      const spec = { templateId: WING_ITEM.CRIT, itemType: ItemKind.ITEM, bound: false, color: 0, amount: n, maxStack: maxStack(tpl) };
      if (!(await this.inventory.canFit(cid, spec))) throw RpcException.forbidden(WING_TEXT.BAG_FULL);
      const cost = price * n;
      const total = await this.characters.spendMoney(cid, 'gold', cost);
      if (total === null) throw RpcException.forbidden(WING_TEXT.NO_GOLD);
      let added;
      try {
        added = await this.inventory.add(cid, spec);
      } catch (e) {
        await this.characters.addMoney(cid, 'gold', cost);
        throw e;
      }
      const pushes = [
        push('onUPP', { gold: total }), push('onAddItem', { i: WING_ITEM.CRIT, q: n, t: ItemKind.ITEM, n: String(tpl.name ?? '') }),
        ...added.map((a) => push('onAddCharactorSlot', a)), push('updateCritItemNum', await this.counts(cid)), push('onShowNewWingPro', await this.state(cid)),
      ];
      return { reply: null, pushes };
    });
  }
}
