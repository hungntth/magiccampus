// Refinements of equipment (legacy change_element / change_bind / change_soul / maker, R39-R42). Element, bind and full soul
// re-rolls are two-step: the preview charges silver and consumes the material at once (no refund on reject) and keeps the roll
// in RefinePending; sureChange* applies it (a confirm without a preview just answers "false"). Partial soul and the maker
// signature apply immediately. Prefix has its own service.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  ChangeBindPreview, ChangeElementPreview, ChangeNameReply, ChangeSoulReply, SureBindReply, SureElementReply, SureSoulReply,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import type { Push } from '../inventory/pushes';
import type { Rng } from './craft-rules';
import { int, refuseIf } from './forge-guard';
import { ForgeItemsService } from './forge-items.service';
import { ForgeMoneyService, type Charge } from './forge-money.service';
import { RefinePending } from './refine-pending';
import {
  currentBind, currentSoul, materialTid, nameRefusal, refineCost, rollBindValues, rollNewElement, rollSoulFull, rollSoulValue,
  soulMaxNum, type RefineKind,
} from './refine-rules';

export interface Out<R> {
  reply: R;
  pushes: Push[];
}

interface Prepared {
  equip: CharacterItem;
  tpl: Row;
  matId: number;
}

@Injectable()
export class RefineService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly forgeItems: ForgeItemsService,
    private readonly money: ForgeMoneyService,
    private readonly pending: RefinePending,
  ) {}

  element(cid: number, equipId: number, matId: number, rng: Rng = Math.random): Promise<Out<ChangeElementPreview>> {
    return withCharLock(cid, async () => {
      const p = await this.prepare(cid, equipId, matId, 'element', 1);
      const cur = int(p.equip.properties?.element);
      const next = rollNewElement(cur, rng);
      const paid = await this.pay(cid, 'element', 1, p.matId, 1);
      this.pending.set(cid, { kind: 'element', equipId, element: next });
      return { reply: { f: true, ii: matId, n: paid.left, e: next, b: cur, ei: next }, pushes: paid.pushes };
    });
  }

  sureElement(cid: number, decision: number): Promise<Out<SureElementReply>> {
    return withCharLock(cid, async () => {
      const p = this.pending.take(cid, 'element');
      if (!p || decision <= 0 || !(await this.forgeItems.equipRow(cid, p.equipId))) return { reply: { f: 'false' }, pushes: [] };
      await this.items.updateOne({ _id: p.equipId, characterId: cid }, { $set: { 'properties.element': p.element } });
      return { reply: { f: 'true', e: p.element }, pushes: await this.forgeItems.slotPushes(cid, p.equipId, false) };
    });
  }

  bind(cid: number, equipId: number, matId: number, rng: Rng = Math.random): Promise<Out<ChangeBindPreview>> {
    return withCharLock(cid, async () => {
      const p = await this.prepare(cid, equipId, matId, 'bind', 1);
      const [b11, b12] = rollBindValues(p.tpl, rng);
      const paid = await this.pay(cid, 'bind', 1, p.matId, 1);
      this.pending.set(cid, { kind: 'bind', equipId, b1: b11, b2: b12 });
      const props = p.equip.properties;
      return {
        reply: {
          f: true, ii: matId, n: paid.left, b1: currentBind(props, p.tpl, 1), b11, b2: currentBind(props, p.tpl, 2), b12,
          mainProp1: int(p.tpl.main_prop1), mainProp2: int(p.tpl.main_prop2),
        },
        pushes: paid.pushes,
      };
    });
  }

  sureBind(cid: number, decision: number): Promise<Out<SureBindReply>> {
    return withCharLock(cid, async () => {
      const p = this.pending.take(cid, 'bind');
      if (!p || decision <= 0 || !(await this.forgeItems.equipRow(cid, p.equipId))) return { reply: { f: 'false' }, pushes: [] };
      await this.items.updateOne(
        { _id: p.equipId, characterId: cid },
        { $set: { 'properties.bindMainPropNum1': p.b1, 'properties.bindMainPropNum2': p.b2 } },
      );
      return { reply: { f: 'sure', b1: p.b1, b2: p.b2 }, pushes: await this.forgeItems.slotPushes(cid, p.equipId, true) };
    });
  }

  /** mode 1 = full re-roll (needs sureChangeSoul), mode 2 = new value of the current prop, applied at once. */
  soul(cid: number, equipId: number, matId: number, mode: number, rng: Rng = Math.random): Promise<Out<ChangeSoulReply>> {
    return withCharLock(cid, async () => {
      if (mode !== 1 && mode !== 2) throw RpcException.invalidArgs('mode');
      const p = await this.prepare(cid, equipId, matId, 'soul', mode);
      const cur = currentSoul(p.equip.properties, p.tpl);
      const max = soulMaxNum(p.tpl);
      const paid = await this.pay(cid, 'soul', mode, p.matId, mode);
      if (mode === 2 && cur.prop > 0) {
        const num = rollSoulValue(max, rng);
        await this.items.updateOne({ _id: equipId, characterId: cid }, { $set: { 'properties.activeProp': cur.prop, 'properties.activePropNum': num } });
        const pushes = [...paid.pushes, ...(await this.forgeItems.slotPushes(cid, equipId, false))];
        return { reply: { f: true, type: '2', ii: matId, n: paid.left, ap: cur.prop, apn: num, apro: num, apropnum: cur.num, apropnu: cur.num }, pushes };
      }
      const roll = rollSoulFull(max, rng);
      this.pending.set(cid, { kind: 'soul', equipId, prop: roll.prop, num: roll.num });
      return {
        reply: { f: true, type: '1', ii: matId, n: paid.left, ap: cur.prop, apn: cur.num, apro: roll.prop, apropnum: roll.num },
        pushes: paid.pushes,
      };
    });
  }

  sureSoul(cid: number, decision: number): Promise<Out<SureSoulReply>> {
    return withCharLock(cid, async () => {
      const p = this.pending.take(cid, 'soul');
      if (!p || decision <= 0 || !(await this.forgeItems.equipRow(cid, p.equipId))) return { reply: { f: 'false' }, pushes: [] };
      await this.items.updateOne(
        { _id: p.equipId, characterId: cid },
        { $set: { 'properties.activeProp': p.prop, 'properties.activePropNum': p.num } },
      );
      return { reply: { f: 'true', activeProp: p.prop, activePropNum: p.num }, pushes: await this.forgeItems.slotPushes(cid, p.equipId, false) };
    });
  }

  /** Maker signature: bound equipment of colour >= 4, material require_item3, 10000 unbound silver; applied at once. */
  name(cid: number, equipId: number, matId: number, maker: string): Promise<Out<ChangeNameReply>> {
    return withCharLock(cid, async () => {
      const p = await this.prepare(cid, equipId, matId, 'name', 1);
      refuseIf(nameRefusal(p.equip.isBound, p.equip.colorCode, int(p.equip.properties?.quality)));
      const paid = await this.pay(cid, 'name', 1, p.matId, 1);
      await this.items.updateOne({ _id: equipId, characterId: cid }, { $set: { 'properties.makerName': maker } });
      const pushes = [...paid.pushes, ...(await this.forgeItems.slotPushes(cid, equipId, false))];
      return { reply: { f: true, ii: matId, n: paid.left }, pushes };
    });
  }

  /** Loads the equipment and checks the material stack (template and units); no state is changed. */
  private async prepare(cid: number, equipId: number, matId: number, kind: RefineKind, units: number): Promise<Prepared> {
    const equip = await this.forgeItems.equipRow(cid, equipId);
    if (!equip) throw RpcException.forbidden('Không tìm thấy trang bị.');
    const tpl = await this.gameData.template(19, equip.templateId);
    if (!tpl) throw RpcException.forbidden('Không tìm thấy trang bị.');
    const tid = materialTid(kind, tpl);
    if (tid <= 0) throw RpcException.forbidden('Trang bị này không thể tinh luyện.');
    if (!(await this.forgeItems.stack(cid, matId, tid, units))) throw RpcException.forbidden('Thiếu nguyên liệu tinh luyện phù hợp.');
    return { equip, tpl, matId };
  }

  /** Charges the silver, then consumes the material (refunding the silver when that fails). */
  private async pay(cid: number, kind: RefineKind, mode: number, matId: number, units: number): Promise<{ left: number; pushes: Push[] }> {
    const charge: Charge | null = await this.money.spend(cid, refineCost(kind, mode), kind === 'name' ? 'unbound' : 'selected');
    if (!charge) throw RpcException.forbidden('Không đủ bạc!');
    try {
      const spent = await this.forgeItems.consume(cid, [{ id: matId, count: units }]);
      return { left: spent.left.get(matId) ?? 0, pushes: [...spent.pushes, ...this.money.pushes(charge)] };
    } catch (e) {
      await this.money.refund(cid, charge);
      throw e;
    }
  }
}
