// Static activity tables read through GameDataService.rows (cached on first use; the tables are immutable at runtime):
// data_tbl_activity (strip rows), data_tbl_diary (task points / caps) and data_daily_signin_lucky_tiers (monthly lucky claim tiers).

import { Injectable } from '@nestjs/common';
import type { ActivityRowLite, DiaryEntry } from '@mc/shared';
import { GameDataService } from '../gamedata/gamedata.service';
import type { DiaryRow } from './diary-rules';

export interface LuckyTier {
  weekIndex: number;
  pointThreshold: number;
  goldAmount: number;
}

@Injectable()
export class ActivityDataService {
  private activity: ActivityRowLite[] | null = null;
  private diary: Map<number, DiaryRow> | null = null;
  private tiers: { year: number; month: number; tier: LuckyTier }[] | null = null;

  constructor(private readonly gameData: GameDataService) {}

  async activityRows(): Promise<readonly ActivityRowLite[]> {
    this.activity ??= (await this.gameData.rows('data_tbl_activity')).map((r) => ({
      id: Number(r.id), type: Number(r.type ?? 0), flag: Number(r.flag ?? 0), sortType: Number(r.sort_type ?? 0), enable: r.enable === true,
    }));
    return this.activity;
  }

  async diaryRow(id: number): Promise<DiaryRow | undefined> {
    if (!this.diary) {
      const rows = await this.gameData.rows('data_tbl_diary');
      this.diary = new Map(rows.map((r) => [Number(r.id), { id: Number(r.id), act: Number(r.act ?? 0), max: Number(r.max ?? -1) }]));
    }
    return this.diary.get(id);
  }

  /** Every diary row sorted by display position (the panel catalog). */
  async diaryList(): Promise<DiaryEntry[]> {
    const rows = await this.gameData.rows('data_tbl_diary');
    return rows
      .map((r) => ({ id: Number(r.id), name: String(r.name ?? ''), info: String(r.info ?? ''), act: Number(r.act ?? 0), max: Number(r.max ?? -1), pos: Number(r.pos ?? 0) }))
      .sort((a, b) => a.pos - b.pos);
  }

  /** Lucky-claim tiers of a month (the seed only has May 2026, so most months are empty). */
  async luckyTiers(year: number, month: number): Promise<LuckyTier[]> {
    this.tiers ??= (await this.gameData.rows('data_daily_signin_lucky_tiers')).map((r) => ({
      year: Number(r.year), month: Number(r.month),
      tier: { weekIndex: Number(r.week_index), pointThreshold: Number(r.point_threshold ?? 0), goldAmount: Number(r.gold_amount ?? 0) },
    }));
    return this.tiers.filter((t) => t.year === year && t.month === month).map((t) => t.tier);
  }
}
