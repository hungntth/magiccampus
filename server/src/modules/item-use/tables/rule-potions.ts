// Described HP / MP / SP / revive / cleanse consumables (Go application/item/consumable_rules.go, 2026-10-26 food / potion audit).
// Type 501 templates carry no amounts, every rule is read from the template info text in Go and ported here as a table. `env` says
// where the item works: 'battle' items are refused outside battle (kept), 'field' items are refused in battle. Pet-only rules
// (loyalty 425-427, life 1533 / 1534) are listed separately. The flat HP / MP potions of potion.ts are folded in by the pet path.

export type RuleEnv = 'any' | 'battle' | 'field';

export interface ItemEffect {
  hp?: number; mp?: number; hpPercent?: number; mpPercent?: number; hpPerLevel?: number; mpPerLevel?: number;
  hpToMp?: number; mpToHp?: number; sp?: number; revivePct?: number; cleanse?: boolean; skillId?: number; targets?: number;
}

export interface ConsumableRule {
  effect: ItemEffect;
  env: RuleEnv;
  halfInBattle?: boolean;
}

const rule = (effect: ItemEffect, env: RuleEnv = 'any', extra: Partial<ConsumableRule> = {}): ConsumableRule => ({ effect, env, ...extra });

export const CONSUMABLE_RULES: Readonly<Record<number, ConsumableRule>> = {
  1037: rule({ revivePct: 20 }, 'battle'),
  1136: rule({ hpPercent: 30, mpPercent: 30 }),
  1137: rule({ hp: 5000, hpPercent: 30 }),
  1138: rule({ mp: 5000, mpPercent: 30 }),
  1890: rule({ cleanse: true }, 'battle'),
  2075: rule({ hpToMp: 10 }),
  2076: rule({ mpToHp: 10 }),
  2425: rule({ hpPerLevel: 75 }),
  2426: rule({ mpPerLevel: 40 }),
  2427: rule({ sp: 15 }, 'battle'),
  2428: rule({ hpPerLevel: 100 }),
  2429: rule({ mpPerLevel: 60 }),
  2430: rule({ sp: 20 }, 'battle'),
  2431: rule({ sp: 25 }, 'battle'),
  2432: rule({ hpPerLevel: 60, targets: 3 }),
  2433: rule({ mpPerLevel: 30, targets: 3 }),
  2434: rule({ hpPerLevel: 75, targets: 3, skillId: 5071 }),
  2435: rule({ skillId: 5073 }, 'battle'),
  2436: rule({ skillId: 5074, targets: 2 }, 'battle'),
  2437: rule({ hp: 5000, hpPercent: 25 }),
  2438: rule({ skillId: 5076, targets: 2 }, 'battle'),
  2439: rule({ skillId: 5077, targets: 2 }, 'battle'),
  2503: rule({ hpPercent: 100 }),
  2567: rule({ hpPerLevel: 90, targets: 3 }),
  2568: rule({ sp: 35 }, 'battle'),
  2569: rule({ sp: 50 }, 'battle'),
  2570: rule({ hpPerLevel: 100, hpPercent: 10 }),
  2681: rule({ mpPerLevel: 75 }),
  2682: rule({ skillId: 5230, targets: 2 }, 'battle'),
  2683: rule({ skillId: 5231, targets: 2 }, 'battle'),
  2684: rule({ hpPerLevel: 1000, targets: 3 }),
  2685: rule({ hp: 7000, hpPercent: 25 }),
  2686: rule({ skillId: 5234, targets: 2 }, 'battle'),
  2687: rule({ skillId: 5235, targets: 2 }, 'battle'),
  3032: rule({ hpPercent: 100, mpPercent: 100 }),
  3231: rule({ cleanse: true }, 'battle'),
  3297: rule({ mp: 1000 }),
  3299: rule({ hp: 10000 }),
  3438: rule({ hpPercent: 100, mpPercent: 100 }, 'field'),
  3829: rule({ hpPercent: 100, mpPercent: 100 }, 'any', { halfInBattle: true }),
};

/** Huyet / Ma Linh Lung flasks 4015-4018: reusable HP / MP flasks with a pool stored on the item (Go linhLungHandler), not ported: kept, never eaten. */
export const LINH_LUNG_FLASKS: readonly number[] = [4015, 4016, 4017, 4018];

/** Pet-only potions: loyalty (Thuy Duoc 425 / 426 / 427) and the lifespan items (1533 random 500..2000, 1534 fixed 10000). */
export const PET_LOYALTY_ITEMS: Readonly<Record<number, number>> = { 425: 5, 426: 30, 427: 100 };
export const PET_LIFE_ITEMS: Readonly<Record<number, { min: number; max: number }>> = {
  1533: { min: 500, max: 2000 },
  1534: { min: 10000, max: 10000 },
};

/** Rule foods (type 502) answered by the rule handler instead of the buff-food table: 2503 / 3438 (6562 is the Christmas candy). */
export const RULE_FOOD_IDS: readonly number[] = [2503, 3438];
export const CHRISTMAS_CANDY_ID = 6562;
