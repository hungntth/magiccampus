// Template-id handlers that pay money (Go effect_money_chest.go, effect_kimphieu_scroll.go, effect_mystery_key.go): money chests
// (unbound -> bac `money`, bound -> ngan phieu `moneyBind`), kim phieu scrolls (-> `goldBind`) and the mystery key 1361 (one cheap
// item, room checked first, bind inherited). The unit is consumed first, then the reward is granted (spend before credit).

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ITEM_USE_TEXT, itemUseText } from '@mc/shared';
import type { Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { GrantService, type Grant } from '../rewards/grant.service';
import { ItemUseRegistry } from './item-use.registry';
import { nameOf, note } from './open-helpers';
import { PushCollector } from './push-collector';
import { KIM_PHIEU_SCROLLS, MONEY_CHESTS } from './tables/money-chest';
import { MYSTERY_KEY_ID, rollMysteryKeyPrize } from './tables/mystery-key';

@Injectable()
export class CurrencyItemsService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly grants: GrantService,
  ) {}

  onModuleInit(): void {
    this.registry.addTemplate(Object.keys(MONEY_CHESTS).map(Number), (ctx) => this.moneyChest(ctx));
    this.registry.addTemplate(Object.keys(KIM_PHIEU_SCROLLS).map(Number), (ctx) => this.kimPhieu(ctx));
    this.registry.addTemplate([MYSTERY_KEY_ID], (ctx) => this.mysteryKey(ctx));
  }

  /** Consume the unit, grant, then the note and the grant pushes (legacy: slot update -> onMidNote -> rewards). */
  private async pay(ctx: ItemConsumeCtx, grants: Grant[], message: string): Promise<Push[]> {
    const slot = await ctx.consume();
    const out = new PushCollector(ctx.characterId);
    await this.grants.grant(out, grants);
    return [...slot, note(message), ...out.pushes];
  }

  private moneyChest(ctx: ItemConsumeCtx): Promise<Push[]> {
    const amount = MONEY_CHESTS[ctx.templateId];
    return this.pay(
      ctx, [{ kind: 'money', key: ctx.bound ? 'moneyBind' : 'money', amount }],
      itemUseText(ctx.bound ? ITEM_USE_TEXT.GOT_SILVER_BIND : ITEM_USE_TEXT.GOT_SILVER, amount),
    );
  }

  private kimPhieu(ctx: ItemConsumeCtx): Promise<Push[]> {
    const amount = KIM_PHIEU_SCROLLS[ctx.templateId];
    return this.pay(ctx, [{ kind: 'money', key: 'goldBind', amount }], itemUseText(ITEM_USE_TEXT.GOT_KIM_PHIEU, amount));
  }

  private async mysteryKey(ctx: ItemConsumeCtx): Promise<Push[]> {
    const prize: Grant = { kind: 'item', table: 29, templateId: rollMysteryKeyPrize(Math.random), qty: 1, bound: ctx.bound };
    if (!(await this.grants.fits(ctx.characterId, [prize]))) return [note(ITEM_USE_TEXT.NO_ROOM)];
    return this.pay(ctx, [prize], itemUseText(ITEM_USE_TEXT.OPENED, nameOf(ctx)));
  }
}
