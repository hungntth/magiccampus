// Bag-backed quest progress: syncs collect objectives from the bag (Go syncCollectObjectives), builds the loot context
// (active quests + still-needed items) and consumes the collected items when a quest is finished (Go consumeCollectObjectiveItems).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GameDataService } from '../gamedata/gamedata.service';
import type { LootContext } from '../combat/loot';
import { InventoryService } from '../inventory/inventory.service';
import { push, type Push } from '../inventory/pushes';
import { collectConsumption, collectItemIds, lootNeeds, syncCollect } from './quest-progress';
import { CharacterQuest, type QuestObjective } from './quest.schema';
import type { QuestTemplate } from '../gamedata/quest-data';

interface RowLike {
  questId: number;
  objectives: QuestObjective[];
}

@Injectable()
export class QuestProgressService {
  constructor(
    @InjectModel(CharacterQuest.name) private readonly quests: Model<CharacterQuest>,
    private readonly inventory: InventoryService,
    private readonly gameData: GameDataService,
  ) {}

  /** Returns the rows with collect objectives set from the bag; one bag query serves every row. */
  async syncRows<T extends RowLike>(characterId: number, rows: readonly T[]): Promise<T[]> {
    const ids = new Set<number>();
    for (const r of rows) {
      const tpl = this.gameData.getQuest(r.questId);
      if (tpl) collectItemIds(tpl, r.objectives).forEach((id) => ids.add(id));
    }
    if (ids.size === 0) return [...rows];
    const bag = await this.inventory.countByTemplate(characterId, [...ids]);
    return rows.map((r) => {
      const tpl = this.gameData.getQuest(r.questId);
      return tpl ? { ...r, objectives: syncCollect(tpl, r.objectives, bag) } : r;
    });
  }

  async syncObjectives(characterId: number, tpl: QuestTemplate, objectives: QuestObjective[]): Promise<QuestObjective[]> {
    const [row] = await this.syncRows(characterId, [{ questId: tpl.id, objectives }]);
    return row.objectives;
  }

  /** Loot rule inputs: the active quest ids and the collect objectives that still need items (x5 rate). */
  async lootContext(characterId: number): Promise<LootContext> {
    const rows = await this.quests.find({ characterId }).lean();
    const ids = new Set<number>();
    const active: { tpl: QuestTemplate; objectives: QuestObjective[] }[] = [];
    for (const r of rows) {
      const tpl = this.gameData.getQuest(r.questId);
      if (!tpl) continue;
      active.push({ tpl, objectives: r.objectives });
      collectItemIds(tpl, r.objectives).forEach((id) => ids.add(id));
    }
    const bag = await this.inventory.countByTemplate(characterId, [...ids]);
    return { activeQuests: new Set(rows.map((r) => r.questId)), needs: lootNeeds(active, bag) };
  }

  /** Takes the quest's collected items out of the bag (call under the character lock, before crediting the reward). */
  async consumeCollected(characterId: number, tpl: QuestTemplate, objectives: readonly QuestObjective[]): Promise<Push[]> {
    const pushes: Push[] = [];
    for (const [itemId, count] of collectConsumption(tpl, objectives)) {
      const r = await this.inventory.removeByTemplate(characterId, itemId, count);
      for (const d of r.deleted) pushes.push(push('onDelCharactorSlot', d.id, d.sid));
      for (const item of r.updated) pushes.push(push('onAddCharactorSlot', item));
    }
    return pushes;
  }
}
