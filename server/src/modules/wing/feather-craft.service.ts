// Feather upgrade and mix (legacy featherUpdate / featherMix, WingFuncPanel tabs 6 and 7). Upgrade: 5 same feathers per try (lost on failure),
// rate by colour + 5 per luck item (3021), product `next_jewel_tid`. Mix: formula (item type 1400) + its two inputs + optional luck (3017) are
// consumed on both outcomes, 60 % / 30 % by the product's stat count + 10 per luck. Everything is spent before the product is credited, the
// product fits the bag (checked first) and is bound when any input was.

import { Injectable } from '@nestjs/common';
import {
  FEATHER_TYPE, FEATHER_UPDATE_BATCH, ItemKind, WING_ITEM, WING_TEXT, featherMixRate, featherUpgradeRate, type FeatherMixReply, type FeatherUpdateReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { rollAttempts } from '../forge/mix-rules';
import type { Rng } from '../forge/craft-rules';
import { refuseIf } from '../forge/forge-guard';
import type { Out } from '../forge/refine.service';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { WingItemsService } from './wing-items.service';
import { featherOf, featherUpgradeIssue } from './wing-rules';

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class FeatherCraftService {
  constructor(
    private readonly wings: WingItemsService,
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
  ) {}

  /** Product stack spec, checked against the bag before anything is consumed. */
  private async spec(cid: number, tid: number, amount: number, bound: boolean): Promise<{ templateId: number; itemType: number; bound: boolean; color: number; amount: number; maxStack: number }> {
    const tpl = await this.gameData.template(29, tid);
    const spec = { templateId: tid, itemType: ItemKind.ITEM, bound, color: 0, amount, maxStack: tpl ? maxStack(tpl) : 99_999 };
    if (!(await this.inventory.canFit(cid, spec))) throw RpcException.forbidden(WING_TEXT.BAG_FULL);
    return spec;
  }

  private async credit(cid: number, tid: number, amount: number, bound: boolean): Promise<Push[]> {
    const tpl = await this.gameData.template(29, tid);
    const added = await this.inventory.add(cid, { templateId: tid, itemType: ItemKind.ITEM, bound, color: 0, amount, maxStack: tpl ? maxStack(tpl) : 99_999 });
    return [push('onAddItem', { i: tid, q: amount, t: ItemKind.ITEM, n: String(tpl?.name ?? `#${tid}`) }), ...added.map((a) => push('onAddCharactorSlot', a))];
  }

  /** featherUpdate(featherId, luckId | -1, luckCount, once, tempBagFlag). */
  upgrade(cid: number, featherId: number, luckId: number, luckCount: number, once: boolean, rng: Rng = Math.random): Promise<Out<FeatherUpdateReply>> {
    return withCharLock(cid, async () => {
      const st = await this.wings.stackOf(cid, featherId);
      const info = st ? featherOf(st.row.templateId, st.tpl) : null;
      refuseIf(featherUpgradeIssue(info, int(st?.tpl.next_jewel_tid), st?.row.stackCount ?? 0));
      const feather = st!;
      let tries = once ? 1 : Math.floor(feather.row.stackCount / FEATHER_UPDATE_BATCH);
      let luck: Awaited<ReturnType<WingItemsService['stackOf']>> = null;
      let perTry = 0;
      if (luckId > 0 && luckCount > 0) {
        luck = await this.wings.stackOf(cid, luckId);
        if (!luck || luck.row.templateId !== WING_ITEM.FEATHER_LUCK || luck.row.stackCount < luckCount) throw RpcException.forbidden(WING_TEXT.FEATHER_UP_LUCK);
        perTry = luckCount;
        tries = Math.min(tries, Math.floor(luck.row.stackCount / perTry));
      }
      if (tries <= 0) throw RpcException.forbidden(WING_TEXT.FEATHER_UP_LUCK);
      const bound = feather.row.isBound || (luck?.row.isBound ?? false);
      const productTid = int(feather.tpl.next_jewel_tid);
      await this.spec(cid, productTid, tries, bound);

      const takes = [{ id: featherId, count: tries * FEATHER_UPDATE_BATCH }, ...(luck ? [{ id: luckId, count: tries * perTry }] : [])];
      const spent = await this.wings.forgeItems.consume(cid, takes);
      const successes = rollAttempts(tries, featherUpgradeRate(info!.colour, perTry), rng);
      const pushes: Push[] = [...spent.pushes, ...(successes > 0 ? await this.credit(cid, productTid, successes, bound) : [])];
      const reply: FeatherUpdateReply = {
        slotId: featherId, num: spent.left.get(featherId) ?? 0, lSid: luckId, lnum: luck ? (spent.left.get(luckId) ?? 0) : 0, flag: successes > 0, finalNum: successes,
      };
      return { reply, pushes };
    });
  }

  /** featherMix(formulaId, {"1": {idx}, "2": {idx}}, luckId, luckCount, luckBinded). */
  mix(cid: number, formulaId: number, inputs: unknown, luckId: number, luckCount: number, rng: Rng = Math.random): Promise<Out<FeatherMixReply>> {
    const fail = (fid: number, note: string): Out<FeatherMixReply> => ({
      reply: { f: false, fid, fnum: 0, i: {}, lid: luckId, lnum: 0 }, pushes: [push('onSystemMidMsgOrNote', note)],
    });
    return withCharLock(cid, async () => {
      const formula = await this.wings.stackOf(cid, formulaId);
      const productTid = int(formula?.tpl.next_jewel_tid);
      const product = featherOf(productTid, await this.gameData.template(29, productTid));
      if (!formula || int(formula.tpl.kind) !== 14 || int(formula.tpl.type) !== FEATHER_TYPE.MIX || !product) return fail(-1, WING_TEXT.FEATHER_BAD);
      const refs = typeof inputs === 'object' && inputs !== null ? (inputs as Record<string, unknown>) : {};
      const takes = new Map<number, number>([[formulaId, 1]]);
      const keyOf = new Map<string, number>();
      let bound = formula.row.isBound;
      for (const [n, key] of [[1, '1'], [2, '2']] as const) {
        const tid = int(formula.tpl[`i${n}`]);
        if (tid <= 0) continue;
        const need = Math.max(1, int(formula.tpl[`n${n}`]));
        const id = int((refs[key] as { idx?: unknown } | undefined)?.idx);
        const st = await this.wings.stackOf(cid, id);
        takes.set(id, (takes.get(id) ?? 0) + need);
        if (!st || st.row.templateId !== tid || st.row.stackCount < (takes.get(id) ?? 0)) return fail(-1, WING_TEXT.FEATHER_BAD);
        bound ||= st.row.isBound;
        keyOf.set(key, id);
      }
      if (keyOf.size === 0) return fail(-1, WING_TEXT.FEATHER_BAD);
      let luckUsed = 0;
      if (luckId > 0 && luckCount > 0) {
        const luck = await this.wings.stackOf(cid, luckId);
        if (!luck || luck.row.templateId !== WING_ITEM.FEATHER_MIX_LUCK || luck.row.stackCount < luckCount) return fail(-2, WING_TEXT.NO_MATERIAL);
        takes.set(luckId, luckCount);
        luckUsed = luckCount;
        bound ||= luck.row.isBound;
      }
      await this.spec(cid, productTid, 1, bound);

      const spent = await this.wings.forgeItems.consume(cid, [...takes].map(([id, count]) => ({ id, count })));
      const success = rng() * 100 < featherMixRate(product.stats.length, luckUsed);
      const pushes: Push[] = [...spent.pushes, ...(success ? await this.credit(cid, productTid, 1, bound) : [])];
      const left = (id: number): number => spent.left.get(id) ?? 0;
      return {
        reply: {
          f: success, fid: formulaId, fnum: left(formulaId), i: Object.fromEntries([...keyOf].map(([k, id]) => [k, { id, num: left(id) }])),
          lid: luckId, lnum: luckUsed > 0 ? left(luckId) : 0,
        },
        pushes,
      };
    });
  }
}
