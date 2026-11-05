// Server-side objective credit (M10 decision 15): kind-6 "use" objectives the Flash client never reports (Lang Huyệt planting /
// totems / witch / wolf) are credited by feature code, and a creature kill credited to a character who was not in the battle
// (Lang Huyệt kill relay). Returns the changed quests as onAddChaQuest payloads for the caller to push.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { ChaQuest } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { allMet, creditObjective, KIND_USE } from './quest-progress';
import { QuestProgressService } from './quest-progress.service';
import { CharacterQuest } from './quest.schema';
import { QuestViewService, type ActiveRow } from './quest-view.service';

export interface CreditedQuest {
  quest: ChaQuest;
  complete: boolean;
}

@Injectable()
export class QuestCreditService {
  constructor(
    @InjectModel(CharacterQuest.name) private readonly quests: Model<CharacterQuest>,
    private readonly gameData: GameDataService,
    private readonly progress: QuestProgressService,
    private readonly views: QuestViewService,
  ) {}

  /** + amount on the first incomplete objective (kind, itemId) of every active quest holding one. */
  async credit(characterId: number, itemId: number, amount: number, kind: number = KIND_USE): Promise<CreditedQuest[]> {
    const rows = await this.quests.find({ characterId, objectives: { $elemMatch: { kind, itemId } } }).lean();
    const moved: ActiveRow[] = [];
    for (const r of rows) {
      const c = creditObjective(r.objectives, kind, itemId, amount);
      if (!c.changed) continue;
      await this.quests.updateOne({ _id: r._id }, { $set: { objectives: c.objectives } });
      moved.push({ questId: r.questId, takeDate: r.takeDate, objectives: c.objectives });
    }
    const out: CreditedQuest[] = [];
    for (const row of await this.progress.syncRows(characterId, moved)) {
      const tpl = this.gameData.getQuest(row.questId);
      if (tpl) out.push({ quest: await this.views.toChaQuest(tpl, row), complete: allMet(row.objectives) });
    }
    return out;
  }
}
