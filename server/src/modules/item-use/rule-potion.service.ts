// Rule potions on the character (Go effect_consumable.go applyDescribedConsumable / restoreCharacterVitals): the table of
// tables/rule-potions.ts registered by template id (so rule foods 2503 / 3438 win over the buff-food type handler), plus the terminal
// type 501 handler (a potion without a rule is kept with FOOD_NO_EFFECT; the flat HP / MP potions fall through to UseItemService).
// Battle-only items (revive, cleanse, SP, skill shields) are refused outside battle and kept; pet-only items (loyalty, life) answer
// PET_NO_EFFECT on a character. A full target keeps the item; otherwise the unit is consumed first, then HP / MP are written.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ITEM_USE_TEXT } from '@mc/shared';
import { Character } from '../character/character.schema';
import { HP_POTION, ITEM_TYPE_POTION, MP_POTION } from '../inventory/potion';
import { push, type Push } from '../inventory/pushes';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import { CharacterStatsService } from '../stats/character-stats.service';
import { ItemUseRegistry } from './item-use.registry';
import { note } from './open-helpers';
import { applyVitals, restoresVitals } from './rule-potion';
import { CONSUMABLE_RULES, LINH_LUNG_FLASKS, PET_LIFE_ITEMS, PET_LOYALTY_ITEMS } from './tables/rule-potions';

@Injectable()
export class RulePotionService implements OnModuleInit {
  constructor(
    private readonly registry: ItemUseRegistry,
    private readonly stats: CharacterStatsService,
    @InjectModel(Character.name) private readonly chars: Model<Character>,
  ) {}

  onModuleInit(): void {
    this.registry.addTemplate(Object.keys(CONSUMABLE_RULES).map(Number), (ctx) => this.rulePotion(ctx));
    this.registry.addTemplate([...Object.keys(PET_LOYALTY_ITEMS), ...Object.keys(PET_LIFE_ITEMS)].map(Number), async () => [note(ITEM_USE_TEXT.PET_NO_EFFECT)]);
    this.registry.addTemplate(LINH_LUNG_FLASKS, async () => [note(ITEM_USE_TEXT.CANNOT_USE)]);
    this.registry.addType([ITEM_TYPE_POTION], (ctx) => this.potionType(ctx));
  }

  /** Terminal type 501 handler: flat HP / MP potions pass (UseItemService heals them), everything else has no effect. */
  private async potionType(ctx: ItemConsumeCtx): Promise<Push[] | null> {
    if (HP_POTION[ctx.templateId] !== undefined || MP_POTION[ctx.templateId] !== undefined) return null;
    return [note(ITEM_USE_TEXT.FOOD_NO_EFFECT)];
  }

  private async rulePotion(ctx: ItemConsumeCtx): Promise<Push[]> {
    const rule = CONSUMABLE_RULES[ctx.templateId];
    if (rule.env === 'battle') return [note(ITEM_USE_TEXT.BATTLE_ONLY)];
    if (!restoresVitals(rule.effect)) return [note(ITEM_USE_TEXT.FOOD_NO_EFFECT)];
    const cid = ctx.characterId;
    const st = await this.stats.compute(cid);
    const res = applyVitals(
      { hp: st.doc.currentHp, maxHp: st.maxHp, mp: st.doc.currentMp, maxMp: st.maxMp }, rule.effect, Math.max(st.doc.level, 1),
    );
    if (res.healed === 0 && res.restored === 0) return [note(ITEM_USE_TEXT.HP_MP_FULL)];
    const slot = await ctx.consume(); // spend before credit
    await this.chars.updateOne({ _id: cid }, { $set: { currentHp: res.vitals.hp, currentMp: res.vitals.mp } });
    return [...slot, push('onUPP', { currentHp: res.vitals.hp, currentMp: res.vitals.mp })];
  }
}
