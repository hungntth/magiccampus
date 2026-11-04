// Tier upgrade, disassembly, binding and the H5 info helper (legacy change_level.go R44, resolve.go R45, bag_manage R46):
// changeLevel turns the equipment into its next-tier template (same row and slot, so worn gear stays worn), paying
// `next.req_level^2 * 10` silver and the next template's materials, and resets stars, holes, gems and rolls; equResolve
// returns the template materials (bound) and deletes the unworn equipment; bindItem binds an owned item.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ItemKind, MAX_HOLES, SlotType, gemRemoveFee, levelCost, sidOf, soulStoneTid, type ChangeLevelReply, type GemInfo, type UpgradeInfo,
  type UpgradeMaterial, type UpgradeRequest,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { int, refuseIf } from './forge-guard';
import { ForgeItemsService, type Take } from './forge-items.service';
import { ForgeMoneyService } from './forge-money.service';
import { gemTemplateIds } from '../inventory/equip-stats';
import { gemAt, holeCapacity } from './gem-rules';
import { currentSoul, soulMaxNum } from './refine-rules';
import type { Out } from './refine.service';
import { equipColor, prefixCost, prefixOfQuality, resolveOutputs, sameColors, tierResetFields } from './upgrade-rules';

@Injectable()
export class TierService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly forgeItems: ForgeItemsService,
    private readonly money: ForgeMoneyService,
  ) {}

  /** getUpgradeInfo (H5): the material and cost lines every upgrade tab needs for one equipment. */
  async info(cid: number, equipId: number): Promise<UpgradeInfo> {
    const equip = await this.forgeItems.equipRow(cid, equipId);
    const tpl = equip ? await this.gameData.template(19, equip.templateId) : undefined;
    if (!equip || !tpl) throw RpcException.notFound('Không tìm thấy trang bị.');
    const nextTpl = int(tpl.next_equ_tid) > 0 ? await this.gameData.template(19, int(tpl.next_equ_tid)) : undefined;
    const color = equipColor(equip.colorCode, int(equip.properties?.quality));
    const out = resolveOutputs(tpl, color, int(equip.properties?.prefix) || prefixOfQuality(int(equip.properties?.quality)));
    const tids = [...this.requirements(tpl), ...(nextTpl ? this.requirements(nextTpl) : []), ...out, { tid: soulStoneTid(int(tpl.req_level)), num: 1 }];
    const gemTids = gemTemplateIds(equip.properties);
    const names = await this.gameData.templatesByIds(29, [...new Set([...tids.map((t) => t.tid), ...gemTids])]);
    const line = (r: { slot: number; tid: number; num: number }): UpgradeMaterial => ({ ...r, name: String(names.get(r.tid)?.name ?? `#${r.tid}`) });
    const soul = currentSoul(equip.properties, tpl);
    const soulTid = soulStoneTid(int(tpl.req_level));
    return {
      id: equipId, tid: equip.templateId, reqLevel: int(tpl.req_level),
      refineMaterials: this.requirements(tpl).map(line),
      soul: { tid: soulTid, name: String(names.get(soulTid)?.name ?? `#${soulTid}`), activeProp: soul.prop, activePropNum: soul.num, maxNum: soulMaxNum(tpl) },
      prefixCost: prefixCost(tpl),
      holeCapacity: holeCapacity(tpl),
      gems: this.gemInfo(equip, names),
      next: nextTpl ? {
        tid: int(nextTpl.id), name: String(nextTpl.name ?? ''), reqLevel: int(nextTpl.req_level),
        iconCode: nextTpl.icon_code ? String(nextTpl.icon_code) : '0',
        cost: levelCost(int(nextTpl.req_level) || int(nextTpl.item_level) || 1), materials: this.requirements(nextTpl).map(line),
      } : null,
      resolve: out.map((o) => ({
        tid: o.tid, name: String(names.get(o.tid)?.name ?? `#${o.tid}`), num: o.num, color: o.color,
        iconCode: names.get(o.tid)?.icon_code ? String(names.get(o.tid)?.icon_code) : '0',
      })),
    };
  }

  private gemInfo(equip: CharacterItem, tpls: ReadonlyMap<number, Row>): GemInfo[] {
    const out: GemInfo[] = [];
    for (let slot = 1; slot <= MAX_HOLES; slot++) {
      const tid = gemAt(equip.properties, slot);
      const t = tpls.get(tid);
      if (tid > 0) {
        out.push({
          slot, tid, name: String(t?.name ?? `#${tid}`), iconCode: t?.icon_code ? String(t.icon_code) : '0',
          propType: int(t?.prop_type), propNum: int(t?.propl_num), fee: gemRemoveFee(int(t?.gold)),
        });
      }
    }
    return out;
  }

  /** require_item1..3 / require_num1..3 of a template (empty slots omitted). */
  private requirements(tpl: Row): { slot: number; tid: number; num: number }[] {
    return [1, 2, 3].filter((k) => int(tpl[`require_item${k}`]) > 0)
      .map((k) => ({ slot: k, tid: int(tpl[`require_item${k}`]), num: Math.max(1, int(tpl[`require_num${k}`])) }));
  }

  changeLevel(cid: number, req: UpgradeRequest): Promise<Out<ChangeLevelReply>> {
    return withCharLock(cid, async () => {
      const equip = await this.forgeItems.equipRow(cid, req.e);
      const tpl = equip ? await this.gameData.template(19, equip.templateId) : undefined;
      if (!equip || !tpl) throw RpcException.forbidden('Vui lòng đặt chính xác trang bị và nguyên liệu!');
      const next = int(tpl.next_equ_tid) > 0 ? await this.gameData.template(19, int(tpl.next_equ_tid)) : undefined;
      if (!next) throw RpcException.forbidden('Trang bị này đã đạt cấp tối đa.');
      const { takes, colors } = await this.materials(cid, next, [req.i1, req.i2, req.i3]);
      refuseIf(!sameColors(colors) && 'Vui lòng đặt nguyên liệu cùng cấp!');
      const charge = await this.money.spend(cid, levelCost(int(next.req_level) || int(next.item_level) || 1));
      if (!charge) throw RpcException.forbidden('Không đủ bạc để thăng cấp!');
      let spent;
      try {
        spent = await this.forgeItems.consume(cid, takes);
      } catch (e) {
        await this.money.refund(cid, charge);
        throw e;
      }
      await this.items.updateOne(
        { _id: equip._id, characterId: cid, templateId: equip.templateId }, { $set: tierResetFields(next, colors) },
      );
      const pushes = [...spent.pushes, ...this.money.pushes(charge), ...(await this.forgeItems.slotPushes(cid, equip._id, true))];
      const n = await this.forgeItems.view(cid, equip._id);
      if (!n) throw RpcException.notFound('Không tìm thấy trang bị.');
      return { reply: { f: true, e: equip._id, i: equip._id, n, sid: n.sid }, pushes };
    });
  }

  /** The next template's requirement stacks matched to the three refs (same position), with the units to take and their colours. */
  private async materials(cid: number, next: Row, refs: readonly { idx: number; flag: boolean }[]): Promise<{ takes: Take[]; colors: number[] }> {
    const reqs = this.requirements(next);
    if (reqs.length === 0) throw RpcException.forbidden('Trang bị này không thể thăng cấp.');
    const need = new Map<number, number>();
    const colors: number[] = [];
    for (const r of reqs) {
      const ref = refs[r.slot - 1];
      const id = Number(ref?.idx);
      const row = ref?.flag === true || !Number.isInteger(id) ? null
        : await this.items.findOne({ _id: id, characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
      if (!row || row.templateId !== r.tid) throw RpcException.forbidden('Vui lòng đặt chính xác trang bị và nguyên liệu!');
      const total = (need.get(id) ?? 0) + r.num;
      need.set(id, total);
      if (row.stackCount < total) throw RpcException.forbidden('Không đủ nguyên liệu.');
      colors.push(Math.max(row.colorCode, int((await this.gameData.template(29, r.tid))?.color), 0));
    }
    return { takes: [...need.entries()].map(([id, count]) => ({ id, count })), colors };
  }

  resolve(cid: number, equipId: number): Promise<Out<boolean>> {
    return withCharLock(cid, async () => {
      const equip = await this.forgeItems.equipRow(cid, equipId);
      if (!equip) throw RpcException.forbidden('Không tìm thấy trang bị.');
      refuseIf(equip.slotType !== SlotType.BAG && 'Hãy tháo trang bị trước khi phân giải.');
      const tpl = await this.gameData.template(19, equip.templateId);
      const quality = int(equip.properties?.quality);
      const color = equipColor(equip.colorCode, quality);
      refuseIf(color < 1 && 'Trang bị phẩm trắng không thể phân giải.');
      const outputs = resolveOutputs(tpl, color, int(equip.properties?.prefix) || (quality > 0 ? prefixOfQuality(quality) : 0));
      refuseIf(outputs.length === 0 && 'Trang bị này không có nguyên liệu để phân giải.');
      const tpls = await this.gameData.templatesByIds(29, outputs.map((o) => o.tid));
      const specs = outputs.map((o) => ({
        templateId: o.tid, itemType: ItemKind.ITEM, bound: true, color: o.color, amount: o.num, maxStack: maxStack(tpls.get(o.tid)),
      }));
      refuseIf(!(await this.inventory.canFitAll(cid, specs)) && 'Túi đồ đã đầy.');
      // The equipment is deleted first, the materials credited afterwards.
      const del = await this.items.deleteOne({ _id: equipId, characterId: cid, slotType: SlotType.BAG });
      if (del.deletedCount !== 1) throw RpcException.forbidden('Túi đồ vừa thay đổi, hãy thử lại');
      const pushes: Push[] = [];
      for (const spec of specs) for (const m of await this.inventory.add(cid, spec)) pushes.push(push('onAddCharactorSlot', m));
      pushes.push(push('onDelCharactorSlot', equipId, sidOf(equip.slotType, equip.slotIndex)));
      return { reply: true, pushes };
    });
  }

  bindItem(cid: number, itemId: number): Promise<Out<{ success: boolean }>> {
    return withCharLock(cid, async () => {
      const row = await this.items.findOneAndUpdate(
        { _id: itemId, characterId: cid, slotType: { $ne: SlotType.PET_EQUIP } }, { $set: { isBound: true } }, { new: true, projection: { _id: 1 } },
      ).lean();
      if (!row) throw RpcException.notFound('Không tìm thấy vật phẩm.');
      return { reply: { success: true }, pushes: await this.forgeItems.slotPushes(cid, itemId, false) };
    });
  }
}
