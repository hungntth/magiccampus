// Extension points of the item-use dispatcher (legacy applyItemEffect, application/item/service.go:1215-1251). Later phases and
// other modules register their handlers here from onModuleInit instead of editing the dispatcher or UseItemService:
//   - addTemplate(ids, fn): template-id handlers (checked first; any item type)
//   - addType(types, fn): type handlers (terminal in legacy: a registered type never falls through to the award rows)
//   - addQuestItem(fn): the chain of types 508/509/550, run in registration order before the award rows and description bags
// A handler returns the pushes of a handled item (it consumes through ctx.consume() or refuses with a note) or null to pass.

import { Injectable } from '@nestjs/common';
import type { ItemConsumeCtx } from '../inventory/use-item.service';
import type { Push } from '../inventory/pushes';

export type ItemUseFn = (ctx: ItemConsumeCtx) => Promise<Push[] | null>;

/** Item types whose handler is the legacy quest-item chain. */
export const QUEST_ITEM_TYPES: ReadonlySet<number> = new Set([508, 509, 550]);

@Injectable()
export class ItemUseRegistry {
  private readonly byTemplate = new Map<number, ItemUseFn[]>();
  private readonly byType = new Map<number, ItemUseFn[]>();
  private readonly questChain: ItemUseFn[] = [];

  addTemplate(ids: readonly number[], fn: ItemUseFn): void {
    for (const id of ids) this.byTemplate.set(id, [...(this.byTemplate.get(id) ?? []), fn]);
  }

  addType(types: readonly number[], fn: ItemUseFn): void {
    for (const t of types) this.byType.set(t, [...(this.byType.get(t) ?? []), fn]);
  }

  addQuestItem(fn: ItemUseFn): void {
    this.questChain.push(fn);
  }

  templateHandlers(id: number): readonly ItemUseFn[] {
    return this.byTemplate.get(id) ?? [];
  }

  typeHandlers(type: number): readonly ItemUseFn[] {
    return this.byType.get(type) ?? [];
  }

  questItemHandlers(): readonly ItemUseFn[] {
    return this.questChain;
  }
}
