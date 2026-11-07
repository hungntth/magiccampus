// Hook and context types of UseItemService (split out to keep the service file small): the pet / loop-boss hooks, the use hooks that claim
// an item by template before the level gate (M10 phase H: Mat Dao books, title medals) and the consume handlers of the item template
// stage (item-use module).

import type { Push } from './pushes';

/** Implemented by PetService (registered at startup: PetModule imports this module, not the reverse). */
export interface PetItemHook {
  /** Why the life item cannot be used on this pet, or null. */
  restoreBlocker(characterId: number, petId: number, reqLevel: number): Promise<string | null>;
  restoreLife(characterId: number, petId: number): Promise<Push[]>;
}
/** Implemented by LoopBossService (M9): pushes when `tid` is a loop-boss order item, else null. The item is not consumed. */
export type OrderItemHook = (characterId: number, templateId: number) => Promise<Push[] | null>;
/** M10 phase H: a hook claiming a consumable by template (Mật Đạo books). Runs before the level gate; `consume` spends one unit and returns the slot pushes. */
export interface ItemUseCtx {
  characterId: number;
  itemId: number;
  templateId: number;
  level: number;
  reqLevel: number;
  consume(): Promise<Push[]>;
  /** The template row (type, use_type, name, description, ...) and whether this stack is bound. */
  tpl: Record<string, unknown>;
  bound: boolean;
}
/** ItemUseCtx for consume handlers; `classId` is the opener's class (class-gated award rows). */
export interface ItemConsumeCtx extends ItemUseCtx {
  classId: number;
}
/** ItemConsumeCtx of useItem(2, petId, itemId): the pet the item is used on. */
export interface PetUseCtx extends ItemConsumeCtx {
  petId: number;
}
/** Pet-target handler (item-use module): pushes when it claims the item (consume through ctx.consume()), null to pass. */
export type PetUseHandler = (ctx: PetUseCtx) => Promise<Push[] | null>;
/** Pushes when the hook handled the item (it consumes by itself), null to fall through. */
export type ItemUseHook = (ctx: ItemUseCtx) => Promise<Push[] | null>;
/**
 * Item template stage (legacy applyItemEffect after the use_type 4 refusal: template-id handlers, then the type handlers). The
 * first handler that returns pushes claims the item; a handler must either consume through `ctx.consume()` or refuse with a note.
 * Registered by ItemUseModule (the inventory module never imports it).
 */
export type ItemConsumeHandler = (ctx: ItemConsumeCtx) => Promise<Push[] | null>;
