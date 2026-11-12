// Feathers on the wing (legacy addWingFeather / featherDel / getFeatherData, WingFuncPanel tabs 5 and 6). Inlay: every placement is validated
// (hole open and empty, feather colour <= wing colour, per-parity budget A/B/C one and D two, no repeated stat), the feathers are consumed, then the
// holes are written (a bound feather binds the wing). Remove: the feather returns BOUND and the wing becomes bound, for the silver fee of its colour.

import { Injectable } from '@nestjs/common';
import { ItemKind, MAX_WING_HOLES, WING_TEXT, FEATHER_DEL_MONEY, type BagItem } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { refuseIf } from '../forge/forge-guard';
import type { Out } from '../forge/refine.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { WingItemsService } from './wing-items.service';
import { featherOf, inlayIssue, type FeatherInfo } from './wing-rules';

const itemIdOf = (ref: unknown): number => {
  const r = typeof ref === 'object' && ref !== null ? (ref as { idx?: unknown }) : {};
  return Number.isInteger(Number(r.idx)) ? Number(r.idx) : 0;
};

@Injectable()
export class FeatherService {
  constructor(
    private readonly wings: WingItemsService,
    private readonly inventory: InventoryService,
  ) {}

  /** getFeatherData(wingId): the wing's wire view (the panel hole grid). Null for anything else. */
  async data(cid: number, wingId: number): Promise<BagItem | null> {
    try {
      await this.wings.load(cid, wingId);
    } catch {
      return null;
    }
    return this.wings.forgeItems.view(cid, wingId);
  }

  /** addWingFeather(wingId, {"1".."10": {idx, flag}}) -> number of feathers inlaid. */
  inlay(cid: number, wingId: number, raw: unknown): Promise<Out<number>> {
    return withCharLock(cid, async () => {
      const w = await this.wings.load(cid, wingId);
      const entries = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const placements = new Map<number, FeatherInfo>();
      const stacks = new Map<number, { count: number; bound: boolean; have: number }>();
      for (let slot = 1; slot <= MAX_WING_HOLES; slot++) {
        const ref = entries[String(slot)];
        if (ref === undefined || ref === null) continue;
        const id = itemIdOf(ref);
        const st = await this.wings.stackOf(cid, id);
        const info = st ? featherOf(st.row.templateId, st.tpl) : null;
        if (!st || !info) throw RpcException.forbidden(WING_TEXT.FEATHER_BAD);
        const used = (stacks.get(id)?.count ?? 0) + 1;
        if (used > st.row.stackCount) throw RpcException.forbidden(WING_TEXT.FEATHER_BAD);
        stacks.set(id, { count: used, bound: st.row.isBound, have: st.row.stackCount });
        placements.set(slot, info);
      }
      const lookup = async (): Promise<Map<number, FeatherInfo>> => {
        const ids = [...new Set(w.wing.holes.filter((t) => t > 0))];
        const tpls = await this.wings.gameData.templatesByIds(29, ids);
        return new Map(ids.flatMap((id): [number, FeatherInfo][] => { const f = featherOf(id, tpls.get(id)); return f ? [[id, f]] : []; }));
      };
      const known = await lookup();
      refuseIf(inlayIssue(w.wing.holes, w.colour, placements, (tid) => known.get(tid) ?? null));

      const spent = await this.wings.forgeItems.consume(cid, [...stacks].map(([id, s]) => ({ id, count: s.count })));
      const holes = [...w.wing.holes];
      for (const [slot, f] of placements) holes[slot - 1] = f.id;
      const binds = [...stacks.values()].some((s) => s.bound) && !w.row.isBound;
      await this.wings.write(cid, wingId, { 'properties.wing': { ...w.wing, holes }, ...(binds ? { isBound: true } : {}) });
      const pushes: Push[] = [...spent.pushes, ...(await this.wings.slotPushes(cid, wingId))];
      await this.wings.after(cid, w.worn, { pets: true });
      return { reply: placements.size, pushes };
    });
  }

  /** featherDel(wingId, index 1..10) -> boolean. */
  remove(cid: number, wingId: number, index: number): Promise<Out<boolean>> {
    return withCharLock(cid, async () => {
      const w = await this.wings.load(cid, wingId);
      const tid = Number.isInteger(index) && index >= 1 && index <= MAX_WING_HOLES ? w.wing.holes[index - 1] : 0;
      if (!(tid > 0)) throw RpcException.forbidden(WING_TEXT.FEATHER_BAD);
      const tpl = await this.wings.gameData.template(29, tid);
      const colour = Math.min(FEATHER_DEL_MONEY.length - 1, Math.max(0, Number(tpl?.color ?? 0) || 0));
      const spec = { templateId: tid, itemType: ItemKind.ITEM, bound: true, color: 0, amount: 1, maxStack: tpl ? maxStack(tpl) : 99_999 };
      if (!(await this.inventory.canFit(cid, spec))) throw RpcException.forbidden(WING_TEXT.FEATHER_DEL_BAG);
      const charge = await this.wings.charge(cid, FEATHER_DEL_MONEY[colour]);
      const holes = [...w.wing.holes];
      holes[index - 1] = 0;
      try {
        const cleared = await this.wings.items.updateOne(
          { _id: wingId, characterId: cid, [`properties.wing.holes.${index - 1}`]: tid }, { $set: { 'properties.wing': { ...w.wing, holes }, isBound: true } },
        );
        if (cleared.modifiedCount !== 1) throw RpcException.forbidden('Cánh vừa thay đổi, hãy thử lại');
        let added;
        try {
          added = await this.inventory.add(cid, spec);
        } catch (e) {
          await this.wings.write(cid, wingId, { 'properties.wing': w.wing, isBound: w.row.isBound });
          throw e;
        }
        const pushes: Push[] = [
          ...this.wings.money.pushes(charge), push('onAddItem', { i: tid, q: 1, t: ItemKind.ITEM, n: String(tpl?.name ?? `#${tid}`) }),
          ...added.map((a) => push('onAddCharactorSlot', a)), ...(await this.wings.slotPushes(cid, wingId)),
        ];
        await this.wings.after(cid, w.worn, { pets: true });
        return { reply: true, pushes };
      } catch (e) {
        await this.wings.money.refund(cid, charge);
        throw e;
      }
    });
  }
}
