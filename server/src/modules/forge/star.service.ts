// Equipment stars (legacy star.go R30-R33, H5 rules): starOne / starAll spend star stones (item 5, no money) before rolling;
// a failed roll keeps the star. Worn equipment refreshes the character stats. getStarNum reads the level.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MAX_STAR, STAR_STONE_TID, type StarReply } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import { CharacterItem } from '../inventory/character-item.schema';
import { withCharLock } from '../inventory/char-lock';
import type { Push } from '../inventory/pushes';
import type { Rng } from './craft-rules';
import { refuseIf } from './forge-guard';
import { ForgeItemsService } from './forge-items.service';
import { planStars, starOf, validStarTarget, validStoneCount } from './star-rules';

export interface StarResult {
  reply: StarReply;
  pushes: Push[];
}

@Injectable()
export class StarService {
  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly forgeItems: ForgeItemsService,
  ) {}

  async starNum(characterId: number, equipId: number): Promise<number> {
    const row = await this.forgeItems.equipRow(characterId, equipId, true, false);
    return row ? starOf(row) : 0;
  }

  /** `target` = star to reach for starAll (1..10), or null for a single attempt. */
  run(characterId: number, count: number, equipId: number, stoneId: number, target: number | null, rng: Rng = Math.random): Promise<StarResult> {
    return withCharLock(characterId, () => this.doRun(characterId, count, equipId, stoneId, target, rng));
  }

  private async doRun(
    characterId: number, count: number, equipId: number, stoneId: number, target: number | null, rng: Rng,
  ): Promise<StarResult> {
    if (!validStoneCount(count) || (target !== null && !validStarTarget(target))) throw RpcException.invalidArgs('count');
    const equip = await this.forgeItems.equipRow(characterId, equipId);
    if (!equip) throw RpcException.forbidden('Không tìm thấy trang bị.');
    const star = starOf(equip);
    refuseIf(star >= MAX_STAR && 'Trang bị đã đạt 10 sao.');
    refuseIf(target !== null && target <= star && `Trang bị đã có ${star} sao.`);
    const stone = await this.forgeItems.stack(characterId, stoneId, STAR_STONE_TID, count);
    if (!stone) throw RpcException.forbidden('Không đủ Thăng Tinh Thạch.');
    const plan = planStars(star, stone.stackCount, count, target ?? star + 1, target === null ? 1 : Infinity, rng);
    // The stones are spent first; the star is credited afterwards (conditional on the level we read).
    const spent = await this.forgeItems.consume(characterId, [{ id: stoneId, count: plan.attempts * count }]);
    const pushes = [...spent.pushes];
    if (plan.star !== star) {
      const r = await this.items.updateOne({ _id: equipId, characterId, star }, { $set: { star: plan.star } });
      if (r.modifiedCount !== 1) throw RpcException.forbidden('Trang bị vừa thay đổi, hãy thử lại');
      pushes.push(...(await this.forgeItems.slotPushes(characterId, equipId, true)));
    }
    return {
      reply: { equSlotId: equipId, starSlotId: stoneId, num: spent.left.get(stoneId) ?? 0, starNum: plan.star, flag: plan.lastSuccess },
      pushes,
    };
  }
}
