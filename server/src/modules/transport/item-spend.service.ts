// Consumes one unit of a consumable item template (transport scroll, rename card) with its slot pushes, and puts it back when
// the action it paid for fails afterwards ("spend before you credit", but never keep the payment of a failed action).

import { Injectable, Logger } from '@nestjs/common';
import { ItemKind } from '@mc/shared';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class ItemSpendService {
  private readonly logger = new Logger(ItemSpendService.name);

  constructor(
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
  ) {}

  /** Units owned per template id (bag + quest page). */
  owned(characterId: number, templateIds: readonly number[]): Promise<Map<number, number>> {
    return this.inventory.countByTemplate(characterId, templateIds);
  }

  /** Takes one unit and pushes the slot change. Caller holds the character lock. */
  async take(session: Session, templateId: number): Promise<void> {
    const spent = await this.inventory.removeByTemplate(session.characterId!, templateId, 1);
    for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
    for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
  }

  /** Gives the unit back (bound = false); a full bag only logs, the failure that triggered this is reported anyway. */
  async giveBack(session: Session, templateId: number): Promise<void> {
    try {
      const row = await this.gameData.template(29, templateId);
      const changed = await this.inventory.add(session.characterId!, {
        templateId, itemType: ItemKind.ITEM, bound: false, color: 0, amount: 1, maxStack: maxStack(row),
      });
      for (const item of changed) session.callback('onAddCharactorSlot', item);
    } catch (e) {
      this.logger.error(`refund of item ${templateId} to character ${session.characterId} failed: ${(e as Error).message}`);
    }
  }
}
