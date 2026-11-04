// Loot of a won battle: rolls every dead creature's rows (loot.ts) with the quest context and puts the drops into the bag.
// Runs at settle so a disconnect before battlePlayEnd cannot lose them; a full bag skips the drop (onRedMsg at the end).

import { Injectable } from '@nestjs/common';
import { ItemKind, type BagItem, type BattleReport } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { maxStack } from '../inventory/bag-rules';
import { withCharLock } from '../inventory/char-lock';
import { InventoryService } from '../inventory/inventory.service';
import { QuestProgressService } from '../quest/quest-progress.service';
import type { BattleLoot, Fighter, Rng } from './battle.types';
import { rollLoot, type LootDrop } from './loot';

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

  async grant(characterId: number, dead: readonly Fighter[], report: BattleReport): Promise<BattleLoot> {
    const loot: BattleLoot = { changed: [], notices: [], bagFull: false };
    const ctx = await this.progress.lootContext(characterId);
    const drops: LootDrop[] = [];
    for (const f of dead) if (f.kind === 'creature') drops.push(...rollLoot(this.gameData.creatureLoot(f.refId), ctx, this.rng));
    for (const drop of mergeDrops(drops)) {
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
