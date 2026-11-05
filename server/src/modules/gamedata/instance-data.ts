// M10 instance data (cached at boot, seed overlays applied): TBL_PLAN packages by `st` (t = 3 rows only) and gift-bag
// contents by bag item id. Later phases add their tables here (answers, maze events, war maps, schedule bosses, boss loot).

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { toAnswerRow, usableAnswer, type AnswerRow } from './answer-quiz';
import { toBossLootRow, toScheduleBossRow, type BossLootRow, type ScheduleBossRow } from './boss-loot';
import { toItemAwardRow, type ItemAwardRow } from '../rewards/item-award';
import { toPlanRow, type PlanRow } from '../rewards/plan-roller';
import { GameDataService } from './gamedata.service';

@Injectable()
export class InstanceDataService implements OnModuleInit {
  private readonly logger = new Logger(InstanceDataService.name);
  private plans = new Map<string, PlanRow[]>();
  private awards = new Map<number, ItemAwardRow[]>();
  private quiz: AnswerRow[] = [];
  private quizById = new Map<number, AnswerRow>();
  private bossLoots = new Map<number, BossLootRow[]>();
  private bosses = new Map<number, ScheduleBossRow>();
  private dailyToNid = new Map<number, number>();

  constructor(private readonly gameData: GameDataService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    const plans = new Map<string, PlanRow[]>();
    for (const raw of await this.gameData.rowsWithOverlays('data_tbl_plan', { t: 3 })) {
      const row = toPlanRow(raw);
      const list = plans.get(row.st) ?? [];
      list.push(row);
      plans.set(row.st, list);
    }
    for (const list of plans.values()) list.sort((a, b) => a.id - b.id);
    const awards = new Map<number, ItemAwardRow[]>();
    for (const raw of await this.gameData.rowsWithOverlays('data_tbl_item_award')) {
      const row = toItemAwardRow(raw);
      const list = awards.get(row.bagId) ?? [];
      list.push(row);
      awards.set(row.bagId, list);
    }
    for (const list of awards.values()) list.sort((a, b) => a.id - b.id);
    this.plans = plans;
    this.awards = awards;
    this.quiz = (await this.gameData.rows('data_tbl_answer')).map(toAnswerRow).filter(usableAnswer).sort((a, b) => a.id - b.id);
    this.quizById = new Map(this.quiz.map((r) => [r.id, r]));
    await this.reloadBosses();
    this.logger.log(`Loaded ${plans.size} plans (t = 3), ${awards.size} gift bags, ${this.quiz.length} quiz questions`);
  }

  private async reloadBosses(): Promise<void> {
    const bosses = new Map<number, ScheduleBossRow>();
    const dailyToNid = new Map<number, number>();
    for (const raw of await this.gameData.rows('data_tbl_schedule_boss')) {
      const row = toScheduleBossRow(raw);
      bosses.set(row.nid, row);
      if (row.dailyBossId !== null) dailyToNid.set(row.dailyBossId, row.nid);
    }
    const loots = new Map<number, BossLootRow[]>();
    for (const raw of await this.gameData.rowsWithOverlays('data_tbl_boss_loot')) {
      const row = toBossLootRow(raw);
      const list = loots.get(row.bossNid) ?? [];
      list.push(row);
      loots.set(row.bossNid, list);
    }
    for (const list of loots.values()) list.sort((a, b) => a.id - b.id);
    this.bosses = bosses;
    this.dailyToNid = dailyToNid;
    this.bossLoots = loots;
  }

  /** Boss registry row (data_tbl_schedule_boss) by canonical nid. */
  scheduleBoss(nid: number): ScheduleBossRow | undefined {
    return this.bosses.get(nid);
  }

  /** Every active registry row (schedule bosses, flying twins, daily-only rows). */
  scheduleBosses(): readonly ScheduleBossRow[] {
    return [...this.bosses.values()].filter((b) => b.active);
  }

  /** Canonical boss nid of a Sổ Tay (daily) boss id through daily_boss_id; undefined when the daily boss has no registry row. */
  bossNidOfDaily(dailyId: number): number | undefined {
    return this.dailyToNid.get(dailyId);
  }

  /** data_tbl_boss_loot rows of a canonical boss nid (overlays applied), row id order. */
  bossLoot(nid: number): readonly BossLootRow[] {
    return this.bossLoots.get(nid) ?? [];
  }

  /** Usable TBL_ANSWER questions (a text and a right option naming a non-empty option), id order. */
  answers(): readonly AnswerRow[] {
    return this.quiz;
  }

  answer(id: number): AnswerRow | undefined {
    return this.quizById.get(id);
  }

  /** TBL_PLAN rows of one package (`st`, e.g. "3-90001"), row id order. */
  planRows(st: string): readonly PlanRow[] {
    return this.plans.get(st) ?? [];
  }

  /** data_tbl_item_award rows of a bag (its item template id), row id order. */
  itemAwardRows(bagId: number): readonly ItemAwardRow[] {
    return this.awards.get(bagId) ?? [];
  }
}
