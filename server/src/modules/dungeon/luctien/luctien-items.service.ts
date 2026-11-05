// Lục Tiên item helpers (Go dungeon_luctien.go lucTienGrantItem / lucTienHeld / lucTienSpend): carried count, one bound unit
// granted with the bag-full note, one unit spent with the slot sync, and the key the character carries (master key last).

import { Injectable } from '@nestjs/common';
import type { Session } from '../../../gateway/session';
import { InventoryService } from '../../inventory/inventory.service';
import { midNote } from '../../npcscript/menu';
import { GrantService, type Grant } from '../../rewards/grant.service';
import { LT, LT_KEYS } from './luctien-layout';

export const BAG_FULL = 'Túi đồ đã đầy, không thể nhận thêm vật phẩm.';

@Injectable()
export class LucTienItems {
  constructor(
    private readonly inventory: InventoryService,
    private readonly grants: GrantService,
  ) {}

  async held(characterId: number, templateId: number): Promise<number> {
    return (await this.inventory.countByTemplate(characterId, [templateId])).get(templateId) ?? 0;
  }

  /** The carried key item (a colour key first, then the master key), 0 when none. */
  async carriedKey(characterId: number): Promise<number> {
    const counts = await this.inventory.countByTemplate(characterId, [...LT_KEYS, LT.MASTER_KEY]);
    return [...LT_KEYS, LT.MASTER_KEY].find((k) => (counts.get(k) ?? 0) > 0) ?? 0;
  }

  /** One bound unit to the session's character; false (with the bag-full note when `note`) when it does not fit. */
  async give(session: Session, templateId: number, note = true): Promise<boolean> {
    const g: Grant[] = [{ kind: 'item', table: 29, templateId, qty: 1, bound: true }];
    if (!(await this.grants.fits(session.characterId!, g))) {
      if (note) midNote(session, BAG_FULL);
      return false;
    }
    return this.grants.grant(session, g);
  }

  /** Spends one carried unit (slot sync to the owner). False when none could be taken. */
  async spend(session: Session, templateId: number): Promise<boolean> {
    try {
      const spent = await this.inventory.removeByTemplate(session.characterId!, templateId, 1);
      for (const item of spent.updated) session.callback('onAddCharactorSlot', item);
      for (const gone of spent.deleted) session.callback('onDelCharactorSlot', gone.id, gone.sid);
      return true;
    } catch {
      return false;
    }
  }
}
