// Loot of a won battle: rolls every dead creature's rows once for the group (group-loot.ts, per-recipient quest context) and puts the drops into the bags.
// Runs at settle so a disconnect before battlePlayEnd cannot lose them; a full bag skips the drop (onRedMsg at the end).

import { Injectable } from '@nestjs/common';
import { ItemKind, type BagItem, type BattleReport } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { QuestProgressService } from '../quest/quest-progress.service';
import type { BattleLoot, Fighter, Rng } from './battle.types';
import { rollGroupLoot } from './group-loot';
import type { LootDrop } from './loot';

/** A loot recipient with the report its items are listed in. */
export interface LootTarget {
  cid: number;
  report: BattleReport;
}

/** Same item + bound flag merge into one grant. */
export function mergeDrops(drops: readonly LootDrop[]): LootDrop[] {
  const out = new Map<string, LootDrop>();
  for (const d of drops) {
    const key = `${d.itemId}:${d.bound}`;
    const cur = out.get(key);
    if (cur) cur.qty += d.qty;
    else out.set(key, { ...d });
  }
  return [...out.values()];
}

@Injectable()
export class BattleLootService {
  /** Swappable for tests / tools. */
  rng: Rng = Math.random;

  constructor(
    private readonly gameData: GameDataService,
    private readonly inventory: InventoryService,
    private readonly progress: QuestProgressService,
  ) {}

  /**
   * Rolls the dead creatures' loot once for the whole group (round-robin among the eligible recipients, group-loot.ts) and
   * credits each recipient's drops to their bag. A solo battle is a group of one. Returns the loot by character id.
   */
  async grant(recipients: readonly LootTarget[], dead: readonly Fighter[]): Promise<Map<number, BattleLoot>> {
    const ctxs = await Promise.all(recipients.map((r) => this.progress.lootContext(r.cid)));
    const rows = dead.filter((f) => f.kind === 'creature').map((f) => this.gameData.creatureLoot(f.refId));
    const drops = rollGroupLoot(rows, recipients.map((r, i) => ({ cid: r.cid, ctx: ctxs[i] })), this.rng);
    const out = new Map<number, BattleLoot>();
    for (const r of recipients) {
      const mine = drops.filter((d) => d.cid === r.cid).map((d) => d.drop);
      out.set(r.cid, await this.credit(r.cid, mergeDrops(mine), r.report));
    }
    return out;
  }

  private async credit(characterId: number, drops: readonly LootDrop[], report: BattleReport): Promise<BattleLoot> {
    const loot: BattleLoot = { changed: [], notices: [], bagFull: false };
    for (const drop of drops) {
      const tpl = await this.gameData.template(29, drop.itemId);
      if (!tpl) continue;
      const spec = { templateId: drop.itemId, itemType: ItemKind.ITEM, bound: drop.bound, color: 0, amount: drop.qty, maxStack: maxStack(tpl) };
      let changed: BagItem[] = [];
      const fits = await withCharLock(characterId, async () => {
        if (!(await this.inventory.canFit(characterId, spec))) return false;
        changed = await this.inventory.add(characterId, spec);
        return true;
      });
      if (!fits) {
        loot.bagFull = true;
        continue;
      }
      const name = String(tpl.name ?? `#${drop.itemId}`);
      loot.changed.push(...changed);
      loot.notices.push({ i: drop.itemId, q: drop.qty, t: ItemKind.ITEM, n: name });
      report.items.push({ name, count: drop.qty });
    }
    return loot;
  }
}
