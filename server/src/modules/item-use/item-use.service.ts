// The item-use dispatcher (legacy applyItemEffect, application/item/service.go:1215-1251) behind UseItemService's consume stage: it is
// registered as the consume handler in onModuleInit (the inventory module never imports this one). UseItemService has already run the
// level gate and the use_type 4 refusal. Order: template-id handlers -> for types 508 / 509 / 550 the quest-item chain (registered
// handlers, then award rows, then the description bag, else "cannot use") -> other registered type handlers. Handlers register in
// ItemUseRegistry; nothing here knows the later phases (foods, potions, books ...).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ITEM_USE_TEXT } from '@mc/shared';
import type { Push } from '../inventory/pushes';
import { UseItemService, type ItemConsumeCtx } from '../inventory/use-item.service';
import { AwardBagService } from './award-bag.service';
import { DescBagService } from './desc-bag.service';
import { hasDescBagDescriptionOverride } from './desc-bag/aliases';
import { isDescBagName } from './desc-bag/text';
import { ItemUseRegistry, QUEST_ITEM_TYPES, type ItemUseFn } from './item-use.registry';
import { note } from './open-helpers';

@Injectable()
export class ItemUseService implements OnModuleInit {
  constructor(
    private readonly useItem: UseItemService,
    private readonly registry: ItemUseRegistry,
    private readonly awards: AwardBagService,
    private readonly descBags: DescBagService,
  ) {}

  onModuleInit(): void {
    this.useItem.addConsumeHandler((ctx) => this.dispatch(ctx));
  }

  private async firstOf(handlers: readonly ItemUseFn[], ctx: ItemConsumeCtx): Promise<Push[] | null> {
    for (const fn of handlers) {
      const pushes = await fn(ctx);
      if (pushes) return pushes;
    }
    return null;
  }

  /** Pushes of a handled item, or null to fall through to UseItemService's remaining rules. */
  async dispatch(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    const byTemplate = await this.firstOf(this.registry.templateHandlers(ctx.templateId), ctx);
    if (byTemplate) return byTemplate;
    const type = Number(ctx.tpl.type ?? 0);
    if (QUEST_ITEM_TYPES.has(type)) return this.questItem(ctx);
    return this.firstOf(this.registry.typeHandlers(type), ctx);
  }

  /** Legacy questItemEffectHandler: terminal for its types (nothing falls through to the generic UseItemService rules). */
  private async questItem(ctx: ItemConsumeCtx): Promise<Push[]> {
    const chained = await this.firstOf(this.registry.questItemHandlers(), ctx);
    if (chained) return chained;
    if (this.awards.canHandle(ctx.templateId)) return this.awards.open(ctx);
    const name = String(ctx.tpl.name ?? '');
    if (isDescBagName(name) || hasDescBagDescriptionOverride(ctx.templateId)) return this.descBags.open(ctx);
    return [note(ITEM_USE_TEXT.CANNOT_USE)];
  }
}
