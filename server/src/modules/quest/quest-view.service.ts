// Quest DTOs (split out of quest.service.ts in M10): QuestView for NPC lists / the quest panel (require names, award slots,
// questKill, start / finish NPC positions) and the ChaQuest of an active row.

import { Injectable } from '@nestjs/common';
import { loopIdOfSubType, QuestState, QuestType } from '@mc/shared';
import type { ChaQuest, QuestRequire, QuestView } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import type { QuestTemplate } from '../gamedata/quest-data';
import { allMet, initialObjectives, questKillOf } from './quest-progress';
import { QuestRewardService } from './quest-reward.service';
import type { QuestObjective } from './quest.schema';

export interface ActiveRow {
  questId: number;
  takeDate: Date;
  objectives: QuestObjective[];
}

@Injectable()
export class QuestViewService {
  constructor(
    private readonly gameData: GameDataService,
    private readonly rewards: QuestRewardService,
  ) {}

  /** `objectives` = the active row (for questKill); omitted for a quest not taken yet (every kill still remaining). */
  async toView(tpl: QuestTemplate, state: number, objectives?: readonly QuestObjective[]): Promise<QuestView> {
    const rows = this.gameData.questRequire(tpl.id);
    const require: QuestRequire[] = await Promise.all(
      rows.map(async (r) => ({
        kind: r.kind, type: r.type, itemId: r.itemId, num: r.num, q: r.q, name: await this.requireName(r.kind, r.type, r.itemId),
      })),
    );
    const start = this.gameData.getNpc(tpl.startNpc);
    const finish = this.gameData.getNpc(tpl.finishNpc);
    const finishMap = finish ? this.gameData.getMap(Number(finish.pos_map_id)) : undefined;
    const startMap = start ? this.gameData.getMap(Number(start.pos_map_id)) : undefined;
    return {
      qid: tpl.id,
      state,
      data: {
        id: tpl.id, name: tpl.name, info: tpl.info, type: tpl.type, startText: tpl.startText,
        completeText: tpl.completeText, awardExp: tpl.awardExp, moneyNum: tpl.moneyNum, moneyType: tpl.moneyType,
        startNpc: tpl.startNpc, finishNpc: tpl.finishNpc, minLevel: tpl.minLevel, color: tpl.color, at: tpl.at,
        ...(tpl.type === QuestType.LOOP ? { loopId: loopIdOfSubType(tpl.subType ?? '') } : {}),
      },
      require,
      award: await this.rewards.views(tpl.id),
      questKill: questKillOf(objectives ?? initialObjectives(tpl, rows)),
      sName: String(start?.name ?? ''),
      sMid: Number(start?.pos_map_id ?? 0),
      sMap: String(startMap?.name ?? ''),
      fName: String(finish?.name ?? ''),
      pos: finish
        ? {
            map: Number(finish.pos_map_id ?? 0),
            x: Number(finish.pos_x ?? 0),
            y: Number(finish.pos_y ?? 0),
            name: String(finishMap?.name ?? ''),
          }
        : null,
    };
  }

  async toChaQuest(tpl: QuestTemplate, row: ActiveRow): Promise<ChaQuest> {
    const state = allMet(row.objectives) ? QuestState.CAN_FINISH : QuestState.TAKEN;
    return { ...(await this.toView(tpl, state, row.objectives)), takeDate: row.takeDate.getTime() };
  }

  private requireName(kind: number, type: number, id: number): Promise<string> | string {
    if (kind === 1) return this.gameData.templateName(type, id);
    return kind === 2 || kind === 3 ? (this.gameData.creature(id)?.name ?? `#${id}`) : `#${id}`;
  }
}
