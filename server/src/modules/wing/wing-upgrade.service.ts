// Wing stars and holes (legacy addWingStar / addWingHole, WingFuncPanel tabs 3 and 4). Stars: 1..5 Lông Vũ Thăng Tinh per try, rate by star,
// a failure follows the level-dependent rule (wingStarAfterFail); `upToNum` > 0 repeats until the star is reached or the stones run out; stones
// are spent before the star is credited and a bound stone binds the wing. Holes: new wings start with all 10 open (owner rule 2026-11-09), so
// addWingHole only serves wings with a stored shorter hole list.

import { Injectable } from '@nestjs/common';
import {
  WING_ITEM, WING_MONEY, WING_STAR_MAX, WING_TEXT, holeNumCode, nextWingHole, wingHoleCapacity, type AddWingHoleReply, type WingStarReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Rng } from '../forge/craft-rules';
import { refuseIf } from '../forge/forge-guard';
import type { Out } from '../forge/refine.service';
import { withCharLock } from '../inventory/char-lock';
import type { Push } from '../inventory/pushes';
import { WingItemsService } from './wing-items.service';
import { planWingStars } from './wing-rules';

@Injectable()
export class WingUpgradeService {
  constructor(private readonly wings: WingItemsService) {}

  star(cid: number, count: number, wingId: number, stoneId: number, upTo: number, rng: Rng = Math.random): Promise<Out<WingStarReply>> {
    return withCharLock(cid, async () => {
      if (!Number.isInteger(count) || count < 1 || count > 5) throw RpcException.invalidArgs('count');
      const w = await this.wings.load(cid, wingId);
      const star = Math.max(0, w.row.star ?? 0);
      refuseIf(star >= WING_STAR_MAX && WING_TEXT.STAR_MAX);
      refuseIf(upTo > 0 && star >= upTo && `Cánh đã có ${star} sao.`);
      const stone = await this.wings.material(cid, stoneId, WING_ITEM.STAR, count);
      const plan = planWingStars(star, stone.stackCount, count, upTo > 0 ? Math.min(upTo, WING_STAR_MAX) : 0, rng);
      // The stones are spent first; the star is credited afterwards (conditional on the level we read).
      const spent = await this.wings.forgeItems.consume(cid, [{ id: stoneId, count: plan.attempts * count }]);
      const pushes: Push[] = [...spent.pushes];
      const binds = stone.isBound && !w.row.isBound;
      if (plan.star !== star || binds) {
        const r = await this.wings.items.updateOne({ _id: wingId, characterId: cid, star: w.row.star }, { $set: { star: plan.star, ...(binds ? { isBound: true } : {}) } });
        if (r.modifiedCount !== 1) throw RpcException.forbidden('Cánh vừa thay đổi, hãy thử lại');
        pushes.push(...(await this.wings.slotPushes(cid, wingId)));
      }
      return {
        reply: { equSlotId: wingId, itemSlotId: stoneId, num: spent.left.get(stoneId) ?? 0, upgradeNum: plan.star, flag: upTo > 0 ? plan.star > star : plan.lastSuccess },
        pushes,
      };
    });
  }

  hole(cid: number, wingId: number, materialId: number): Promise<Out<AddWingHoleReply>> {
    return withCharLock(cid, async () => {
      const w = await this.wings.load(cid, wingId);
      refuseIf(!w.row.isBound && WING_TEXT.NEED_BOUND);
      const next = nextWingHole(w.wing.holes);
      refuseIf(!next && WING_TEXT.HOLE_ALL_OPEN);
      refuseIf(holeNumCode(w.wing.holes) >= wingHoleCapacity(w.colour) && WING_TEXT.HOLE_MAX);
      const { slot, cost } = next!;
      await this.wings.material(cid, materialId, WING_ITEM.HOLE, cost);
      const charge = await this.wings.charge(cid, WING_MONEY.HOLE);
      try {
        const spent = await this.wings.forgeItems.consume(cid, [{ id: materialId, count: cost }]);
        const holes = [...w.wing.holes];
        holes[slot - 1] = 0;
        await this.wings.write(cid, wingId, { 'properties.wing': { ...w.wing, holes } });
        const pushes = [...spent.pushes, ...this.wings.money.pushes(charge), ...(await this.wings.slotPushes(cid, wingId))];
        return { reply: { f: true, i: wingId, h: holeNumCode(holes), ii: materialId, n: spent.left.get(materialId) ?? 0 }, pushes };
      } catch (e) {
        await this.wings.money.refund(cid, charge);
        throw e;
      }
    });
  }
}
