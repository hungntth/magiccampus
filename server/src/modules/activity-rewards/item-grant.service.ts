// Grants bag items named by text (sign-in cards, chest descriptions): exact-name lookup through GameDataService, a dry-run
// fit check before anything is spent, then InventoryService.add with onAddItem + onAddCharactorSlot pushes (quest reward order).

import { Injectable, Logger } from '@nestjs/common';
import { ItemKind } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack, type AddSpec } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';

export interface NamedItem {
  name: string;
  qty: number;
}

export interface GrantItem extends NamedItem {
  templateId: number;
  maxStack: number;
}

export interface ResolvedItems {
  items: GrantItem[];
  /** Names with no template (logged only: the text may mention items the data lacks). */
  skipped: string[];
}

@Injectable()
export class ItemGrantService {
  private readonly logger = new Logger(ItemGrantService.name);

  constructor(
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
  ) {}

  async resolve(list: readonly NamedItem[]): Promise<ResolvedItems> {
    const out: ResolvedItems = { items: [], skipped: [] };
    for (const it of list) {
      const id = await this.gameData.itemIdByName(it.name);
      const tpl = id !== undefined ? await this.gameData.template(29, id) : undefined;
      if (id === undefined || !tpl) out.skipped.push(it.name);
      else out.items.push({ name: it.name, qty: it.qty, templateId: id, maxStack: maxStack(tpl) });
    }
    if (out.skipped.length > 0) this.logger.warn(`reward items without template: ${out.skipped.join(', ')}`);
    return out;
  }

  private specs(items: readonly GrantItem[]): AddSpec[] {
    return items.map((i) => ({ templateId: i.templateId, itemType: ItemKind.ITEM, bound: true, color: 0, amount: i.qty, maxStack: i.maxStack }));
  }

  fits(characterId: number, items: readonly GrantItem[]): Promise<boolean> {
    return this.inventory.canFitAll(characterId, this.specs(items));
  }

  /** Adds every item (bound) and pushes the notices; the caller already checked `fits` and marked its claim. */
  async grant(session: Session, items: readonly GrantItem[]): Promise<void> {
    const cid = session.characterId!;
    for (const [i, spec] of this.specs(items).entries()) {
      const changed = await this.inventory.add(cid, spec);
      session.callback('onAddItem', { i: spec.templateId, q: spec.amount, t: ItemKind.ITEM, n: items[i].name });
      for (const slot of changed) session.callback('onAddCharactorSlot', slot);
    }
  }
}
