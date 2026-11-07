// Template-id items with their own effect (Go effect_attr_reset.go, effect_catch_potion.go, effect_pet_aptitude_fruit.go, effect_christmas.go
// candy, effect_mount_dress.go): Quy Nguyen Chau 995 / Quy Nguyen Don 1475 (refund the distributed attribute points), Luyen Thu Don 1581
// (catch buff 565, 30 min, adds to the remaining time), Tinh Hon Chi Thuc 3984 (+1 aptitude of the active pet), Christmas candy 6562 (+1 Keo
// Giang Sinh) and the mount dress bags (30 days of a dress, reborn characters only). Every handler consumes the unit before it credits.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ITEM_USE_TEXT, itemUseText } from '@mc/shared';
import { BuffService } from '../buff/buff.service';
import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { MountService } from '../mount/mount.service';
import { PetItemService } from '../pet/pet-item.service';
import { GrantService } from '../rewards/grant.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { ItemUseRegistry } from './item-use.registry';
import { nameOf, note } from './open-helpers';
import { PushCollector } from './push-collector';
import { ATTR_RESET_ITEMS, CATCH_POTION, FRUIT_ITEM_ID, MOUNT_DRESS_BAGS } from './tables/special-items';
import { CHRISTMAS_CANDY_ID } from './tables/rule-potions';

@Injectable()
export class SpecialItemsService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly stats: CharacterStatsService,
    private readonly buffs: BuffService,
    private readonly petItems: PetItemService,
    private readonly grants: GrantService,
    private readonly mounts: MountService,
  ) {}

  onModuleInit(): void {
    this.registry.addTemplate(Object.keys(ATTR_RESET_ITEMS).map(Number), (ctx) => this.attrReset(ctx));
    this.registry.addTemplate([CATCH_POTION.itemId], (ctx) => this.catchPotion(ctx));
    this.registry.addTemplate([FRUIT_ITEM_ID], (ctx) => this.aptitudeFruit(ctx));
    this.registry.addTemplate([CHRISTMAS_CANDY_ID], (ctx) => this.candy(ctx));
    this.registry.addTemplate(Object.keys(MOUNT_DRESS_BAGS).map(Number), (ctx) => this.dressBag(ctx));
  }

  private async attrReset(ctx: ItemConsumeCtx): Promise<Push[]> {
    const maxLevel = ATTR_RESET_ITEMS[ctx.templateId];
    if (maxLevel > 0 && ctx.level > maxLevel) return [note(itemUseText(ITEM_USE_TEXT.ATTR_RESET_LEVEL, maxLevel))];
    if ((await this.stats.allocatedPoints(ctx.characterId)) <= 0) return [note(ITEM_USE_TEXT.ATTR_RESET_NONE)];
    const slot = await ctx.consume();
    const refund = await this.stats.resetAllocated(ctx.characterId);
    return [...slot, note(itemUseText(ITEM_USE_TEXT.ATTR_RESET_DONE, refund)), push('onUPP', await this.stats.refreshPayload(ctx.characterId))];
  }

  private async catchPotion(ctx: ItemConsumeCtx): Promise<Push[]> {
    const slot = await ctx.consume();
    const buff = await this.buffs.grant(ctx.characterId, CATCH_POTION.buffId, CATCH_POTION.seconds, { addRemaining: true });
    return [...slot, note(itemUseText(ITEM_USE_TEXT.USED, nameOf(ctx))), push('upLongBuff', buff)];
  }

  /** use_type 1: the client sends the character target, the fruit goes to the active pet (battle pet, else the following one). */
  private async aptitudeFruit(ctx: ItemConsumeCtx): Promise<Push[]> {
    const plan = await this.petItems.planAptitudeFruit(ctx.characterId, null);
    if ('refuse' in plan) return [note(plan.refuse)];
    const slot = await ctx.consume();
    return [...slot, ...(await plan.apply())];
  }

  private async candy(ctx: ItemConsumeCtx): Promise<Push[]> {
    const slot = await ctx.consume();
    const out = new PushCollector(ctx.characterId);
    await this.grants.grant(out, [{ kind: 'currency', key: 'xmCandy24', amount: 1 }]);
    return [...slot, note(itemUseText(ITEM_USE_TEXT.GOT_CANDY, 1)), ...out.pushes];
  }

  private async dressBag(ctx: ItemConsumeCtx): Promise<Push[]> {
    const plan = await this.mounts.dressBagPlan(ctx.characterId, MOUNT_DRESS_BAGS[ctx.templateId]);
    if ('apply' in plan) {
      const slot = await ctx.consume();
      return [...slot, note(itemUseText(ITEM_USE_TEXT.USED, nameOf(ctx))), ...(await plan.apply())];
    }
    if (plan.refuse === 'reborn') return [note(ITEM_USE_TEXT.MOUNT_REBORN)];
    if (plan.refuse === 'permanent') return [note(itemUseText(ITEM_USE_TEXT.MOUNT_PERMANENT, plan.name))];
    return [note(ITEM_USE_TEXT.CANNOT_USE)];
  }
}
