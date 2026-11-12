// Ky Linh (updateQiLingProp) and Trung Chu (updateChongZhu) on character gear above level 150 (kind 1-4) and the line reads
// getQiLingProp / getChongZhuProp. Lines live on `properties.qiling` ({t, v, max} x3). Stones 5974 are consumed by template, the missing ones
// are bought with plain gold when the client sends "auto". Validate, then spend, then write, all under the character lock. The result goes
// out as a push (onQiLingRes(lines) / onChongZhuRes({use, cz})), the RPC itself only answers true. Legacy application/item/qiling.go.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  QILING_STONE, SlotType, parseQilingLines, qilingEligibleSlot, qilingLinesWire, type ChongZhuResPush, type QilingLine, type QilingLinesWire,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { GameDataService, type Row } from '../gamedata/gamedata.service';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import { push, type Push } from '../inventory/pushes';
import { PetMaterialService } from '../pet/pet-materials.service';
import type { Rng } from './craft-rules';
import { ForgeItemsService } from './forge-items.service';
import { ForgeMoneyService } from './forge-money.service';
import { planQiling, rerollQilingValues, rollQilingLines, type QilingLocks } from './qiling-rules';
import type { Out } from './refine.service';

export const QILING_TEXT = {
  invalid: 'Trang bị không phù hợp',
  noStone: 'Không đủ Kỳ Linh Thạch',
  noGold: 'Không đủ vàng',
  noLines: 'Trang bị chưa có thuộc tính Kỳ Linh',
  allLocked: 'Phải để lại ít nhất 1 dòng thuộc tính chưa khóa',
} as const;

const int = (v: unknown): number => {
  const n = Math.trunc(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class QilingService {
  private readonly logger = new Logger(QilingService.name);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly gameData: GameDataService,
    private readonly forgeItems: ForgeItemsService,
    private readonly money: ForgeMoneyService,
    private readonly mats: PetMaterialService,
  ) {}

  /** Random source (tests replace it); a field because Nest cannot inject a function parameter. */
  rng: Rng = Math.random;

  /** The stored lines for getQiLingProp / getChongZhuProp, or false when the piece is unsuitable or has none (never null: the Flash button waits for the reply). */
  async lines(characterId: number, equipId: number): Promise<QilingLinesWire | false> {
    const row = await this.forgeItems.equipRow(characterId, equipId, true, false);
    const tpl = row ? await this.gameData.template(19, row.templateId) : undefined;
    if (!row || !tpl || this.slotOf(tpl) < 0) return false;
    const lines = parseQilingLines(row.properties?.qiling);
    return lines.length === 0 ? false : qilingLinesWire(lines);
  }

  /** Ky Linh (`rebuild` false: three new props) or Trung Chu (`rebuild` true: same props, new values for the unlocked lines). */
  roll(characterId: number, equipId: number, rebuild: boolean, locks: QilingLocks, autoBuy: boolean): Promise<Out<true>> {
    return withCharLock(characterId, async () => {
      const row = await this.forgeItems.equipRow(characterId, equipId);
      const tpl = row ? await this.gameData.template(19, row.templateId) : undefined;
      const slot = tpl ? this.slotOf(tpl) : -1;
      if (!row || !tpl || slot < 0) throw RpcException.forbidden(QILING_TEXT.invalid);
      const current = parseQilingLines(row.properties?.qiling);
      if (rebuild && current.length === 0) throw RpcException.forbidden(QILING_TEXT.noLines);
      const noLocks: QilingLocks = [false, false, false];
      const plan = planQiling(rebuild, rebuild ? locks : noLocks, await this.mats.countTemplate(characterId, QILING_STONE));
      if (!plan) throw RpcException.forbidden(QILING_TEXT.allLocked);
      if (plan.missing > 0 && !autoBuy) throw RpcException.forbidden(QILING_TEXT.noStone);
      const lines = rebuild ? rerollQilingValues(this.rng, current, locks) : rollQilingLines(this.rng, slot, current);
      if (lines.length === 0) throw RpcException.forbidden(QILING_TEXT.invalid);
      const gold = await this.money.spend(characterId, plan.gold, 'gold');
      if (!gold) throw RpcException.forbidden(QILING_TEXT.noGold);
      const use = Math.min(plan.have, plan.need);
      let spent: Push[] = [];
      try {
        if (use > 0) spent = await this.mats.consumeTemplate(characterId, QILING_STONE, use);
      } catch (e) {
        await this.money.refund(characterId, gold);
        throw e;
      }
      const written = await this.items.updateOne({ _id: equipId, characterId }, { $set: { 'properties.qiling': lines } });
      if (written.matchedCount !== 1) throw RpcException.forbidden('Trang bị vừa thay đổi, hãy thử lại');
      this.logger.log(`${rebuild ? 'chongzhu' : 'qiling'} char ${characterId} item ${equipId} stones ${use} gold ${plan.gold} locks ${locks.join(',')} lines ${JSON.stringify(lines)}`);
      return {
        reply: true,
        pushes: [
          ...spent, ...this.money.pushes(gold), ...(await this.forgeItems.slotPushes(characterId, equipId, row.slotType === SlotType.EQUIP)),
          this.resultPush(rebuild, lines),
        ],
      };
    });
  }

  private resultPush(rebuild: boolean, lines: readonly QilingLine[]): Push {
    const wire = qilingLinesWire(lines);
    return rebuild ? push('onChongZhuRes', { use: wire, cz: wire } satisfies ChongZhuResPush) : push('onQiLingRes', wire);
  }

  private slotOf(tpl: Row): number {
    return qilingEligibleSlot(int(tpl.kind), int(tpl.type), int(tpl.req_level));
  }
}
