// Template-id items with their own effect (Go effect_attr_reset.go, effect_catch_potion.go, effect_pet_aptitude_fruit.go,
// effect_mount_dress.go).

/** Attribute reset items: template id -> highest character level allowed (0 = any level). 1475 is the beginner version (levels 1 - 39). */
export const ATTR_RESET_ITEMS: Readonly<Record<number, number>> = { 995: 0, 1475: 39 };

/** Luyen Thu Don: buff 565 (prop 27 = +4 catch points) for 30 minutes. */
export const CATCH_POTION = { itemId: 1581, buffId: 565, seconds: 30 * 60 } as const;

/** Tinh Hon Chi Thuc: +1 aptitude of the active pet. */
export const FRUIT_ITEM_ID = 3984;

/** Mount dress bags: bag template id -> TBL_MOUNT_DRESS id (30 days each). */
export const MOUNT_DRESS_BAGS: Readonly<Record<number, number>> = {
  7254: 6, 6636: 7, 7255: 8, 4803: 9, 4804: 10, 4805: 11, 7256: 19, 6492: 20, 7258: 21, 7259: 22, 7260: 23,
};
