// Túi tạm thời (TemporaryBagPanel): the volatile overflow list of one connection (Session.temporaryBag, max 30, gone with the
// session or on character change). Battle loot that does not fit the bag is offered here; addSingleItemToBag(index) / addAllToBag()
// take entries out FIRST and grant them into the bag, restoring the entry when the bag has no room. Legacy: Go temporary_bag.go.

import { Injectable } from '@nestjs/common';
import { ItemKind, TEMP_BAG, TEMP_BAG_TEXT, type AddItemNotice, type TemporaryEntry } from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';

/** Template table of an item entry (equipment entries, table 19, are not produced yet). */
const ITEM_TABLE = 29;

@Injectable()
export class TemporaryBagService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
  ) {}

  /** Adds entries up to the 30-entry limit; returns the ones accepted (the rest are lost). */
  offer(session: Session, entries: readonly TemporaryEntry[]): TemporaryEntry[] {
    const room = Math.max(TEMP_BAG.TEMPORARY_MAX - session.temporaryBag.length, 0);
    const accepted = entries.slice(0, room);
    session.temporaryBag.push(...accepted);
    return accepted;
  }

  /** warnTemporaryBag(list) while entries wait, closeWarnTemporaryBag() once empty. */
  warn(session: Session): Push[] {
    return session.temporaryBag.length > 0
      ? [push('warnTemporaryBag', [...session.temporaryBag])]
      : [push('closeWarnTemporaryBag')];
  }

  /** updateTemporaryBag(list), plus closeWarnTemporaryBag() when empty (Go sendTemporaryBag). */
  private refresh(session: Session): Push[] {
    const out = [push('updateTemporaryBag', [...session.temporaryBag])];
    if (session.temporaryBag.length === 0) out.push(push('closeWarnTemporaryBag'));
    return out;
  }

  /** addSingleItemToBag(index): index = 0-based position in the last list sent. */
  async addSingle(session: Session, index: number): Promise<Push[]> {
    if (!Number.isInteger(index)) throw RpcException.invalidArgs('index');
    const cid = session.characterId!;
    const entry = session.temporaryBag[index];
    if (!entry) return this.refresh(session); // stale click: just resync
    session.temporaryBag.splice(index, 1); // the entry leaves the list before it is granted
    const granted = await this.grant(cid, entry);
    if (!granted.ok) {
      session.temporaryBag.splice(Math.min(index, session.temporaryBag.length), 0, entry);
    }
    return [...granted.pushes, ...this.refresh(session)];
  }

  /** addAllToBag(): grants entries in order until one does not fit (it stays in the list). */
  async addAll(session: Session): Promise<Push[]> {
    const cid = session.characterId!;
    const out: Push[] = [];
    while (session.temporaryBag.length > 0) {
      const entry = session.temporaryBag.shift()!;
      const granted = await this.grant(cid, entry);
      out.push(...granted.pushes);
      if (!granted.ok) {
        session.temporaryBag.unshift(entry);
        break;
      }
    }
    return [...out, ...this.refresh(session)];
  }

  /** Whole entry into the bag (bag checked for the whole amount first); onAddItem notice + the changed slots. */
  private async grant(cid: number, entry: TemporaryEntry): Promise<{ ok: boolean; pushes: Push[] }> {
    if (entry.itemType !== ITEM_TABLE) return { ok: false, pushes: [] }; // only item (29) entries exist today
    const tpl = await this.gameData.template(29, entry.itemId);
    const spec = {
      templateId: entry.itemId, itemType: ItemKind.ITEM, bound: entry.binded === 1, color: 0, amount: entry.stackNum, maxStack: maxStack(tpl),
    };
    return withCharLock(cid, async () => {
      if (!(await this.inventory.canFit(cid, spec))) return { ok: false, pushes: [push('onSystemMidMsgOrNote', TEMP_BAG_TEXT.BAG_FULL)] };
      const changed = await this.inventory.add(cid, spec);
      const notice: AddItemNotice = { i: entry.itemId, q: entry.stackNum, t: ItemKind.ITEM, n: entry.name };
      return { ok: true, pushes: [push('onAddItem', notice), ...changed.map((c) => push('onAddCharactorSlot', c))] };
    });
  }
}
