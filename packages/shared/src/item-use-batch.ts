// Batch item use contract (useMultiItem) and the pet grow potion table shared by server and client: the Flash Player.useItem quantity
// dialog (ids 5375-5697, BATCH_ITEM_LIST, wallets, pet grow potions), the PLAYER_S refusal strings and the pet grow cap formula.

import { PetLimits, petExpOfLevel } from './pet.js';

/** useMultiItem(targetType, petId, slotId, n) wire args (positional). */
export interface UseMultiItemArgs {
  targetType: 1 | 2;
  petId: number;
  slotId: number;
  count: number;
}

/** useMultiItem reply: units really consumed (the loop stops at the first refusal) and what is left of the stack. */
export interface UseMultiItemReply {
  consumed: number;
  remaining: number;
}

/** Upper bound of one useMultiItem call (a stack never exceeds it). */
export const USE_MULTI_MAX = 9999;

/** Legacy Language.PLAYER_S used by the client use gate (Player.useItem). */
export const PLAYER_USE_TEXT = {
  NOT_FOR_CHAR: 'Vật phẩm này bạn không dùng được!',
  LEVEL: 'Cấp độ bạn chưa đủ!',
  CLASS: 'Nghề nghiệp bạn không phù hợp!',
  NOT_FOR_PET: 'Vật phẩm này pet không dùng được!',
  PET_LEVEL: 'Pet không đủ cấp độ!',
  BAG_FULL: 'Bạn không có đủ chỗ trống trong túi đồ!',
  QTY_TITLE: 'Dùng',
  QTY_PROMPT: 'Nhập số lượng dùng：',
  PET_GROW_CAP: 'Cấp độ pet vượt quá giới hạn, cấm dùng thuốc',
} as const;

/** Pet grow potions: template id -> exp added per unit (Go effect_pet_grow.go petGrowItemExp, Flash PET_GROW_ITEM_ADD_EXP). */
export const PET_GROW_ITEM_EXP: Readonly<Record<number, number>> = {
  961: 30000, 962: 150000, 964: 300000, 1139: 300000, 1173: 3000000, 1451: 100000000, 1585: 300000, 1586: 2000000,
  1587: 6400000, 1836: 12500000, 3339: 100000000,
};

/** Flash ItemConfig.BATCH_ITEM_LIST. */
export const BATCH_ITEM_LIST: readonly number[] = [6232, 6286, 2336, 5354, 4884, 6515, 6562, 6733];

/** Wallets / point items / packages whose quantity dialog starts at 1 (Player.useItem second group). */
export const BATCH_PACKAGE_ITEMS: readonly number[] = [
  643, 1076, 2908, 5343, 3815, 4591, 5256, 4839, 3816, 4905, 4906,
  ...Array.from({ length: 17 }, (_, i) => 4196 + i * 5), // Thien Phu Thach bags 4196 .. 4276
  4551, 4571, 4838, 4886, 4724, 5968, 5967, 5948, 5949, 5215, 5216, 4673,
];

/** Where the client asks for a quantity before useMultiItem: default amount of the dialog (the stack for ids 5375-5697 / BATCH_ITEM_LIST, else 1). */
export function batchUseKind(templateId: number): 'stack' | 'one' | 'petGrow' | null {
  if (templateId in PET_GROW_ITEM_EXP) return 'petGrow';
  if ((templateId >= 5375 && templateId <= 5697) || BATCH_ITEM_LIST.includes(templateId)) return 'stack';
  return BATCH_PACKAGE_ITEMS.includes(templateId) ? 'one' : null;
}

/** Exp a pet can still take from grow items: up to the start of level min(ownerLevel + 5, max) (the Go / Flash owner-level cap). */
export function petGrowExpRoom(petExp: number, ownerLevel: number): number {
  const cap = Math.max(1, Math.min(PetLimits.maxLevel, Math.floor(ownerLevel) + 5));
  return Math.max(0, petExpOfLevel(cap) - petExp);
}

/** Units of a grow potion that still add exp (Flash getMaxPetGrowItemCanUse); 0 when the pet is at the cap or the id is not a grow item. */
export function petGrowMaxUnits(templateId: number, petExp: number, ownerLevel: number): number {
  const amount = PET_GROW_ITEM_EXP[templateId] ?? 0;
  return amount > 0 ? Math.ceil(petGrowExpRoom(petExp, ownerLevel) / amount) : 0;
}

/** Units a batch really uses: the request capped by the stack; non-positive or non-integer requests use nothing. */
export function capUseCount(requested: number, stack: number): number {
  if (!Number.isInteger(requested) || requested <= 0 || !(stack > 0)) return 0;
  return Math.min(requested, Math.floor(stack), USE_MULTI_MAX);
}
