// Prefix / quality change (legacy change_prefix.go R43): changePrefix previews a new quality, element and rolled lines WITHOUT
// charging anything; sureChangePrefix re-validates, then charges silver (selected type) and consumes the three materials,
// binds the item and applies the preview kept in RefinePending (a confirm without a preview answers {f:false}).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ItemKind, SlotType, type ChangePrefixPreview, type EquipProperties, type SurePrefixReply, type UpgradeRequest } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { toBagItem } from '../inventory/bag-mapping';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { colorOfQuality, type Rng } from './craft-rules';
import { refuseIf, int } from './forge-guard';
import { ForgeItemsService, type Take } from './forge-items.service';
import { ForgeMoneyService } from './forge-money.service';
import { levelOfStack } from './material-info';
import { rollCraftedProperties, rollElement } from './quality-roll';
import { RefinePending } from './refine-pending';
import type { Out } from './refine.service';
import {
  equipColor, equipQuality, prefixCost, prefixMaterialRefusal, prefixOfQuality, previewQuality,
} from './upgrade-rules';

const LINE_KEYS = [
  'mainProp1', 'mainPropNum1', 'mainProp2', 'mainPropNum2', 'prop1', 'propNum1', 'prop2', 'propNum2',
  'bindMainPropNum1', 'bindMainPropNum2',
] as const;

interface Resolved {
  equip: CharacterItem;
  tpl: Row;
  color: number;
  quality: number;
  level: number;
  cost: number;
  takes: Take[];
}

@Injectable()
export class PrefixService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly forgeItems: ForgeItemsService,
    private readonly money: ForgeMoneyService,
    private readonly pending: RefinePending,
  ) {}

  preview(cid: number, req: UpgradeRequest, rng: Rng = Math.random): Promise<Out<ChangePrefixPreview>> {
    return withCharLock(cid, async () => {
      const r = await this.resolve(cid, req);
      refuseIf(!(await this.money.canAfford(cid, r.cost)) && 'Không đủ bạc!');
      const curPrefix = prefixOfQuality(r.quality);
      const roll = previewQuality(r.quality, r.color, curPrefix, r.level, rng);
      const star = Math.max(0, r.equip.star + roll.starDelta);
      const element = rollElement(rng);
      const lines = this.rollLines(r.tpl, roll.quality, rng);
      const next = this.merged(r.equip, roll.quality, element, lines);
      this.pending.set(cid, { kind: 'prefix', req, quality: roll.quality, element, star, lines });
      const equIns = toBagItem({ ...r.equip, isBound: true, colorCode: colorOfQuality(roll.quality), star, properties: next }, r.tpl);
      return { reply: { f: true, equIns, oldEquIns: toBagItem(r.equip, r.tpl), sid: equIns.sid, i: r.equip._id }, pushes: [] };
    });
  }

  confirm(cid: number, decision: number): Promise<Out<SurePrefixReply>> {
    return withCharLock(cid, async () => {
      const p = this.pending.take(cid, 'prefix');
      if (!p || decision <= 0) return { reply: { f: false }, pushes: [] };
      const r = await this.resolve(cid, p.req);
      const charge = await this.money.spend(cid, r.cost);
      if (!charge) throw RpcException.forbidden('Không đủ bạc!');
      let spent;
      try {
        spent = await this.forgeItems.consume(cid, r.takes);
      } catch (e) {
        await this.money.refund(cid, charge);
        throw e;
      }
      await this.items.updateOne({ _id: r.equip._id, characterId: cid }, {
        $set: { isBound: true, colorCode: colorOfQuality(p.quality), star: p.star, properties: this.merged(r.equip, p.quality, p.element, p.lines) },
      });
      const pushes = [...spent.pushes, ...this.money.pushes(charge), ...(await this.forgeItems.slotPushes(cid, r.equip._id, true))];
      const n = await this.forgeItems.view(cid, r.equip._id);
      if (!n) return { reply: { f: false }, pushes };
      return { reply: { f: true, e: r.equip._id, i: r.equip._id, n }, pushes };
    });
  }

  /** The instance properties after the change: quality, prefix, element and the re-rolled lines replace the old ones. */
  private merged(equip: CharacterItem, quality: number, element: number, lines: EquipProperties): EquipProperties {
    return { ...equip.properties, ...lines, quality, prefix: prefixOfQuality(quality), element };
  }

  private rollLines(tpl: Row, quality: number, rng: Rng): EquipProperties {
    const rolled = rollCraftedProperties(tpl, quality, prefixOfQuality(quality), '', rng);
    const out: EquipProperties = {};
    for (const k of LINE_KEYS) if (rolled[k] !== undefined) out[k] = rolled[k];
    return out;
  }

  /** Validates equipment, the three requirement materials and their level; nothing is changed. */
  private async resolve(cid: number, req: UpgradeRequest): Promise<Resolved> {
    const equip = await this.forgeItems.equipRow(cid, req.e);
    if (!equip) throw RpcException.forbidden('Không tìm thấy trang bị.');
    const tpl = await this.gameData.template(19, equip.templateId);
    if (!tpl) throw RpcException.forbidden('Không tìm thấy trang bị.');
    const color = equipColor(equip.colorCode, int(equip.properties?.quality));
    refuseIf(color < 4 && 'Chỉ trang bị từ phẩm tím trở lên mới có thể đổi phẩm chất.');
    const refs = [req.i1, req.i2, req.i3];
    const need = new Map<number, number>();
    const levels: number[] = [];
    for (let k = 1; k <= 3; k++) {
      const tid = int(tpl[`require_item${k}`]);
      if (tid <= 0) throw RpcException.forbidden('Trang bị này không thể đổi phẩm chất.');
      const id = Number(refs[k - 1]?.idx);
      const row = refs[k - 1]?.flag === true ? null : await this.items.findOne({ _id: id, characterId: cid, slotType: SlotType.BAG, itemType: ItemKind.ITEM }).lean();
      if (!row || row.templateId !== tid) throw RpcException.forbidden('Vui lòng đặt đúng nguyên liệu!');
      need.set(id, (need.get(id) ?? 0) + Math.max(1, int(tpl[`require_num${k}`])));
      if (row.stackCount < need.get(id)!) throw RpcException.forbidden('Không đủ nguyên liệu.');
      levels.push(levelOfStack(row, await this.gameData.template(29, tid)));
    }
    refuseIf(prefixMaterialRefusal(levels, color));
    return {
      equip, tpl, color, quality: equipQuality(equip.properties, color), level: levels[0], cost: prefixCost(tpl),
      takes: [...need.entries()].map(([id, count]) => ({ id, count })),
    };
  }
}
