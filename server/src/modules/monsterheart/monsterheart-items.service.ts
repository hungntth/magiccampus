// Ma Tâm item effects (Go application/item/effect_matam_item.go): a double click on a Ma Tâm item (template 5375-5697 / 5770-5841, type 550, `propl_num` =
// creatureh_heart id) adds the heart to the bag of its type; Tâm Tinh Thạch 5884 gives 1 mhjingshi; Ma Năng stones 5877-5879 give 3000 / 5000 / 1000 points
// (currency monsterHeart); the temp-bag "Mở nhanh" (oneKeyOpenAllMXTemp) opens every Ma Tâm item of the Ma Tâm temp bag in one write. Handlers run inside
// useItem's character lock, so they use grantLocked (no lock) and return Push[].

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MA_NANG_STONES, MONSTER_HEART, MONSTER_HEART_TEXT as T, SlotType, itemUseText, tempPos } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterItem } from '../inventory/character-item.schema';
import type { Push } from '../inventory/pushes';
import { ItemUseRegistry } from '../item-use/item-use.registry';
import { note } from '../item-use/open-helpers';
import { PushCollector } from '../item-use/push-collector';
import { GrantService } from '../rewards/grant.service';
import { MxOpenRegistry } from '../tempbag/mx-open.registry';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { MonsterHeartService } from './monsterheart.service';

/** Ma Tâm item ids: colour-0 range and the Tím / Cam / Đỏ range (Go IsMxTempTemplate, without the type 506 skill books). */
export const isMaTamItemId = (id: number): boolean => (id >= 5375 && id <= 5697) || (id >= 5770 && id <= 5841);

@Injectable()
export class MonsterHeartItemsService implements OnModuleInit {
  private readonly logger = new Logger(MonsterHeartItemsService.name);

  constructor(
    @InjectModel(CharacterItem.name) private readonly items: Model<CharacterItem>,
    private readonly registry: ItemUseRegistry,
    private readonly mxOpen: MxOpenRegistry,
    private readonly hearts: MonsterHeartService,
    private readonly grants: GrantService,
    private readonly gameData: GameDataService,
  ) {}

  onModuleInit(): void {
    this.registry.addQuestItem((ctx) => this.useMaTam(ctx));
    this.registry.addQuestItem((ctx) => this.useStone(ctx));
    this.mxOpen.register((session) => this.openAllInTempBag(session));
  }

  /** Heart id of a Ma Tâm item template row, or 0. */
  private heartOf(templateId: number, tpl: Record<string, unknown>): number {
    const id = Number(tpl.propl_num);
    return Number(tpl.type) === 550 && isMaTamItemId(templateId) && this.gameData.heart(id) ? id : 0;
  }

  private async useMaTam(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const heartId = this.heartOf(ctx.templateId, ctx.tpl);
    if (!heartId) return null;
    const slot = await ctx.consume(); // spend first
    const out = new PushCollector(ctx.characterId);
    await this.hearts.grantLocked(ctx.characterId, new Map([[heartId, 1]]), out);
    return [...slot, note(itemUseText(T.OPENED, this.gameData.heart(heartId)!.name)), ...out.pushes];
  }

  private async useStone(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const points = MA_NANG_STONES[ctx.templateId];
    const grant = ctx.templateId === MONSTER_HEART.STONE_ITEM
      ? ({ kind: 'currency', key: 'mhjingshi', amount: 1 } as const)
      : points ? ({ kind: 'currency', key: 'monsterHeart', amount: points } as const) : null;
    if (!grant) return null;
    const slot = await ctx.consume();
    const out = new PushCollector(ctx.characterId);
    await this.grants.grant(out, [grant]);
    return [...slot, ...out.pushes];
  }

  /** oneKeyOpenAllMXTemp: every Ma Tâm item of the Ma Tâm temp bag opens at once; the rows are removed first, restored when the hearts cannot be saved. */
  openAllInTempBag(session: Session): Promise<void> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      const rows = (await this.items.find({ characterId: cid, slotType: SlotType.TEMP_BAG }).lean()).filter((r) => tempPos(r.slotIndex)?.mx);
      const tpls = await this.gameData.templatesByIds(29, [...new Set(rows.map((r) => r.templateId))]);
      const eligible = rows.filter((r) => { const t = tpls.get(r.templateId); return !!t && this.heartOf(r.templateId, t) > 0; });
      if (eligible.length === 0) throw RpcException.forbidden(T.NO_QUICK);
      const grants = new Map<number, number>();
      for (const r of eligible) {
        const id = this.heartOf(r.templateId, tpls.get(r.templateId)!);
        grants.set(id, (grants.get(id) ?? 0) + r.stackCount);
      }
      await this.items.deleteMany({ _id: { $in: eligible.map((r) => r._id) }, characterId: cid });
      try {
        await this.hearts.grantLocked(cid, grants, session);
      } catch (e) {
        await this.items.insertMany(eligible).catch((err) => this.logger.error(`restore of ${eligible.length} Ma Tam rows failed for char ${cid}: ${String(err)}`));
        throw e;
      }
      session.callback('updateMonsterHeartBagByOneKey', eligible.length);
    });
  }
}
