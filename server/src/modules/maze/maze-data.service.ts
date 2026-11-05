// Mê Trận static data (cached at boot): TBL_MAZE event names + generation weights, the lottery card pool (TBL_PLAN 3-1260 item rows),
// quiz questions (TBL_ANSWER through InstanceDataService) and item name / icon lookups for the shop and lottery panels.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MAZE_EVENT_NAME, type MazeLotteryCard, type MazeQuizText } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import { InstanceDataService } from '../gamedata/instance-data';
import type { PlanRow } from '../rewards/plan-roller';
import { DEFAULT_EVENT_WEIGHTS, MAZE } from './maze-config';

const ITEM_TABLE = 29;

@Injectable()
export class MazeDataService implements OnModuleInit {
  private readonly logger = new Logger(MazeDataService.name);
  private names = new Map<number, string>();
  private rates: Record<number, number> = { ...DEFAULT_EVENT_WEIGHTS };

  constructor(private readonly gameData: GameDataService, private readonly instance: InstanceDataService) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.gameData.rows('data_tbl_maze');
    const names = new Map<number, string>();
    const rates: Record<number, number> = {};
    for (const r of rows) {
      const id = Number(r.id);
      if (id < 1 || id > 14) continue;
      if (r.name) names.set(id, String(r.name));
      if (Number(r.rate) > 0) rates[id] = Number(r.rate);
    }
    this.names = names;
    this.rates = Object.keys(rates).length === 14 ? rates : { ...DEFAULT_EVENT_WEIGHTS };
    this.logger.log(`Loaded ${rows.length} data_tbl_maze rows`);
  }

  eventName(event: number): string {
    return this.names.get(event) ?? MAZE_EVENT_NAME[event] ?? '';
  }

  weights(): Readonly<Record<number, number>> {
    return this.rates;
  }

  /** Lottery pool: the item rows of plan 3-1260. */
  lotteryCards(): PlanRow[] {
    return this.instance.planRows(MAZE.LOTTERY_PLAN).filter((p) => p.ti === ITEM_TABLE && p.ii > 0);
  }

  planRow(id: number): PlanRow | undefined {
    return this.lotteryCards().find((p) => p.id === id);
  }

  quizIds(): number[] {
    return this.instance.answers().map((a) => a.id);
  }

  quizTexts(ids: readonly number[]): Record<string, MazeQuizText> {
    const out: Record<string, MazeQuizText> = {};
    for (const id of ids) {
      const a = this.instance.answer(id);
      if (a) out[String(id)] = { t: a.t, a: a.a, b: a.b, c: a.c, d: a.d };
    }
    return out;
  }

  /** The letter of the right option, '' for an unknown id. */
  rightLetter(id: number): string {
    return this.instance.answer(id)?.r ?? '';
  }

  async itemInfo(itemId: number): Promise<{ name: string; iconCode: string }> {
    const row = await this.gameData.template(ITEM_TABLE, itemId);
    return { name: String(row?.name ?? `#${itemId}`), iconCode: String(row?.icon_code ?? 0) };
  }

  async lotteryCardsOf(planIds: readonly number[]): Promise<Record<string, MazeLotteryCard>> {
    const out: Record<string, MazeLotteryCard> = {};
    for (let i = 0; i < planIds.length; i++) {
      const row = this.planRow(planIds[i]);
      if (row) out[String(i + 1)] = { itemId: row.ii, n: row.n, ...(await this.itemInfo(row.ii)) };
    }
    return out;
  }
}
