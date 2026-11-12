// Wing refinements (legacy changeWingPrefix / changeWingBind with sure*, changeWingColor / onSureChangeWingColor, changeWingRes). Prefix and bind
// are previews: the material and silver are spent at the preview (no refund on reject) and the roll waits in RefinePending until sure* confirms it.
// Dye (orange Thiên Sứ / Bích Không / Ác Ma, 10 Lông Vũ Ngũ Sắc) offers two palette series whose art exists; look selection needs the level gate.

import { Injectable } from '@nestjs/common';
import {
  WING_BIND_ITEM_NUM, WING_DYE_ITEM_NUM, WING_ITEM, WING_MONEY, WING_PREFIX_ITEM_NUM, WING_TEXT, isWingSheet, sidOf, wingLookCodes, wingLookIndex,
  wingLookSelectable, wingResFor, type ChangeWingBindReply, type ChangeWingPrefixReply, type ChangeWingResReply, type SureChangeWingBindReply,
  type SureChangeWingPrefixReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Rng } from '../forge/craft-rules';
import { refuseIf } from '../forge/forge-guard';
import type { Out } from '../forge/refine.service';
import { RefinePending } from '../forge/refine-pending';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { WingItemsService } from './wing-items.service';
import { dyeChoices, lineSet, rollWingBind, rollWingLines, wingBindCeiling } from './wing-rules';

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class WingRefineService {
  constructor(
    private readonly wings: WingItemsService,
    private readonly pending: RefinePending,
    private readonly inventory: InventoryService,
  ) {}

  /** Spends `units` of the material stack and the silver (silver refunded when the material cannot be taken). */
  private async pay(cid: number, matId: number, tid: number, units: number, silver: number): Promise<{ left: number; pushes: Push[] }> {
    await this.wings.material(cid, matId, tid, units);
    const charge = await this.wings.charge(cid, silver);
    try {
      const spent = await this.wings.forgeItems.consume(cid, [{ id: matId, count: units }]);
      return { left: spent.left.get(matId) ?? 0, pushes: [...spent.pushes, ...this.wings.money.pushes(charge)] };
    } catch (e) {
      await this.wings.money.refund(cid, charge);
      throw e;
    }
  }

  /** changeWingPrefix({e, i}): bound purple / orange wing, 2937 x {3: 5, 4: 15} + 50 000 silver, paid at the preview. */
  prefix(cid: number, wingId: number, matId: number, rng: Rng = Math.random): Promise<Out<ChangeWingPrefixReply>> {
    return withCharLock(cid, async () => {
      const w = await this.wings.load(cid, wingId);
      refuseIf(!w.row.isBound && WING_TEXT.NEED_BOUND);
      const need = WING_PREFIX_ITEM_NUM[w.colour];
      refuseIf(need === undefined && WING_TEXT.PREFIX_COLOUR);
      const paid = await this.pay(cid, matId, WING_ITEM.PREFIX, need, WING_MONEY.PREFIX);
      const lines = rollWingLines(w.tpl, w.colour, rng);
      this.pending.set(cid, { kind: 'wingPrefix', wingId, lines });
      return { reply: { f: true, sid: sidOf(w.row.slotType, w.row.slotIndex), i: wingId, n: lines, ii: matId, inum: paid.left }, pushes: paid.pushes };
    });
  }

  surePrefix(cid: number, decision: number): Promise<Out<SureChangeWingPrefixReply>> {
    return withCharLock(cid, async () => {
      const p = this.pending.take(cid, 'wingPrefix');
      if (!p || decision <= 0) return { reply: { f: 'false' }, pushes: [] };
      const w = await this.wings.load(cid, p.wingId);
      await this.wings.write(cid, p.wingId, lineSet(p.lines));
      const pushes = [push('onSystemMidMsgOrNote', WING_TEXT.PREFIX_OK), ...(await this.wings.slotPushes(cid, p.wingId))];
      await this.wings.after(cid, w.worn, { look: false });
      const view = await this.wings.forgeItems.view(cid, p.wingId);
      return { reply: { f: 'sure', i: p.wingId, n: view!, e: p.wingId }, pushes };
    });
  }

  /** changeWingBind(wingId, materialId): bound wing of colour >= blue, 2843 x 10 + 30 000 silver, paid at the preview. */
  bind(cid: number, wingId: number, matId: number, rng: Rng = Math.random): Promise<Out<ChangeWingBindReply>> {
    return withCharLock(cid, async () => {
      const w = await this.wings.load(cid, wingId);
      refuseIf(!w.row.isBound && WING_TEXT.NEED_BOUND);
      refuseIf(w.colour < 2 && WING_TEXT.PREFIX_COLOUR);
      const paid = await this.pay(cid, matId, WING_ITEM.BIND, WING_BIND_ITEM_NUM, WING_MONEY.BIND);
      const [b11, b12] = rollWingBind(w.tpl, rng);
      this.pending.set(cid, { kind: 'wingBind', wingId, b1: b11, b2: b12 });
      const ceiling = wingBindCeiling(w.tpl);
      const cur = (n: 1 | 2): number => Math.min(ceiling, Math.max(0, int(w.row.properties?.[`bindMainPropNum${n}`] ?? w.tpl.bind_prop_num)));
      const main = (n: 1 | 2): number => int(w.row.properties?.[`mainProp${n}`]) || int(w.tpl[`main_prop${n}`]);
      return {
        reply: { f: true, ii: matId, n: paid.left, b1: cur(1), b2: cur(2), b11, b12, mainProp1: main(1), mainProp2: main(2) },
        pushes: paid.pushes,
      };
    });
  }

  sureBind(cid: number, decision: number): Promise<Out<SureChangeWingBindReply>> {
    return withCharLock(cid, async () => {
      const p = this.pending.take(cid, 'wingBind');
      if (!p || decision <= 0) return { reply: { f: 'false' }, pushes: [] };
      const w = await this.wings.load(cid, p.wingId);
      await this.wings.write(cid, p.wingId, { 'properties.bindMainPropNum1': p.b1, 'properties.bindMainPropNum2': p.b2 });
      const pushes = [push('onSystemMidMsgOrNote', WING_TEXT.BIND_OK), ...(await this.wings.slotPushes(cid, p.wingId))];
      await this.wings.after(cid, w.worn, { look: false });
      return { reply: { f: 'sure', b1: p.b1, b2: p.b2 }, pushes };
    });
  }

  /** changeWingColor(npcId): spends 10 Lông Vũ Ngũ Sắc and pushes showWingColorPanel with two palette series (art that exists). */
  dye(cid: number, rng: Rng = Math.random): Promise<Out<null>> {
    return withCharLock(cid, async () => {
      const w = await this.wings.worn(cid);
      refuseIf(!w && WING_TEXT.DYE_RULE);
      const worn = w!;
      const look = wingLookIndex(worn.base, worn.colour, worn.wing.level, worn.wing.look, worn.wing.dye);
      const options = dyeChoices(worn.base, worn.colour, look, worn.wing.dye[look], isWingSheet, rng);
      refuseIf(options.length === 0 && (worn.colour >= 4 ? WING_TEXT.NO_DYE_ART : WING_TEXT.DYE_RULE));
      const have = (await this.inventory.countByTemplate(cid, [WING_ITEM.DYE])).get(WING_ITEM.DYE) ?? 0;
      refuseIf(have < WING_DYE_ITEM_NUM && WING_TEXT.DYE_NO_ITEM);
      const taken = await this.inventory.removeByTemplate(cid, WING_ITEM.DYE, WING_DYE_ITEM_NUM);
      this.pending.set(cid, { kind: 'wingDye', wingId: worn.row._id, options });
      const pushes = [
        ...taken.updated.map((u) => push('onAddCharactorSlot', u)), ...taken.deleted.map((d) => push('onDelCharactorSlot', d.id, d.sid)),
        push('showWingColorPanel', options),
      ];
      return { reply: null, pushes };
    });
  }

  /** onSureChangeWingColor(series) -> boolean: applies one of the offered series to the look shown. */
  sureDye(cid: number, series: number): Promise<Out<boolean>> {
    return withCharLock(cid, async () => {
      const p = this.pending.get(cid, 'wingDye');
      const w = await this.wings.worn(cid);
      if (!p || !w || w.row._id !== p.wingId || !p.options.some((o) => o.color === series)) return { reply: false, pushes: [] };
      this.pending.drop(cid, 'wingDye');
      const look = wingLookIndex(w.base, w.colour, w.wing.level, w.wing.look, w.wing.dye);
      const dye = [...w.wing.dye];
      dye[look] = series;
      await this.wings.write(cid, w.row._id, { 'properties.wing': { ...w.wing, dye } });
      await this.wings.after(cid, true, { look: true });
      return { reply: true, pushes: await this.wings.slotPushes(cid, w.row._id) };
    });
  }

  /** changeWingRes(index 0..2): picks the look of the worn wing (level gate + art). */
  look(cid: number, index: number): Promise<Out<ChangeWingResReply>> {
    return withCharLock(cid, async () => {
      const w = await this.wings.worn(cid);
      if (!w || !Number.isInteger(index) || index < 0 || index > 2) return { reply: { flag: false }, pushes: [] };
      const { base, colour, wing } = w;
      const looks = wingLookCodes(base, colour, wing.dye);
      const hasLooks = looks[1] !== looks[0];
      if (index > 0) {
        if (!hasLooks) throw RpcException.forbidden(WING_TEXT.LOOK_COLOUR);
        if (!wingLookSelectable(base, colour, wing.level, wing.dye, index, () => true)) throw RpcException.forbidden(WING_TEXT.LOOK_LEVEL);
        if (!wingLookSelectable(base, colour, wing.level, wing.dye, index, isWingSheet)) throw RpcException.forbidden(WING_TEXT.NO_LOOK_ART);
      }
      await this.wings.write(cid, w.row._id, { 'properties.wing': { ...wing, look: index } });
      await this.wings.after(cid, true, { look: true });
      return { reply: { flag: true, newResCode: wingResFor(base, colour, wing.level, index, wing.dye) }, pushes: await this.wings.slotPushes(cid, w.row._id) };
    });
  }
}
