// 3v3 persistence (M14 phase H): run points and ranking on event_progress, the settlement payout of Huy Chương Dũng Sĩ (currency 225),
// the offline claim and the monthly title claim at NPC 1860. A payout is a guarded claim (tier 1 added only when absent) followed by the
// credit; a failed credit rolls the claim back. Pushes: showPVPGroupResultAlert, onAddMoney, onUPP {currencies}, onRedMsg (summary).

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { medalsFor, monthKey, THREE_PVP, titleTierFor, type LastPvpRankRow, type PvpGroupResultAlert } from '@mc/shared';
import { SceneManager } from '../../gateway/scene.manager';
import { CharacterService } from '../character/character.service';
import { CurrencyService } from '../progression/currency.service';
import { TitleService } from '../title/title.service';
import { EventProgress } from './event-progress.schema';
import { ThreePvpState, type ThreePvpRun } from './threepvp-state';

const MEDAL_TIER = 1;

interface Row {
  characterId: number;
  periodKey: string;
  total: number;
  updatedAt?: Date;
}

export interface ClaimOutcome {
  medals: number;
  runs: number;
}

@Injectable()
export class ThreePvpProgressService {
  private readonly logger = new Logger(ThreePvpProgressService.name);

  constructor(
    @InjectModel(EventProgress.name) private readonly rows: Model<EventProgress>,
    private readonly state: ThreePvpState,
    private readonly characters: CharacterService,
    private readonly currencies: CurrencyService,
    private readonly titles: TitleService,
    private readonly scenes: SceneManager,
  ) {}

  /** Fills the run's in-memory points from event_progress (a restart in the middle of a run keeps its scores). */
  async loadRun(run: ThreePvpRun): Promise<void> {
    const rows = await this.rows.find({ event: THREE_PVP.EVENT, periodKey: run.key, total: { $gt: 0 } }).lean();
    for (const r of rows) run.points.set(r.characterId, { total: r.total, at: (r as Row).updatedAt?.getTime() ?? Date.now() });
  }

  /** Adds points of one counted match; returns the totals before and after (memory is updated after the write). */
  async addPoints(run: ThreePvpRun, cid: number, points: number): Promise<{ old: number; total: number }> {
    const doc = await this.rows.findOneAndUpdate(
      { characterId: cid, event: THREE_PVP.EVENT, periodKey: run.key }, { $inc: { total: points } }, { upsert: true, new: true },
    ).lean();
    const total = doc?.total ?? points;
    run.points.set(cid, { total, at: Date.now() });
    return { old: total - points, total };
  }

  /** 1-based rank of a character in the run (total desc, the earlier last update first); 0 without points. */
  rankOf(run: ThreePvpRun, cid: number): number {
    const mine = run.points.get(cid);
    if (!mine || mine.total <= 0) return 0;
    let better = 0;
    for (const [other, p] of run.points) {
      if (other !== cid && (p.total > mine.total || (p.total === mine.total && p.at < mine.at))) better++;
    }
    return better + 1;
  }

  private async rankedRows(key: string, limit: number): Promise<Row[]> {
    return (await this.rows.find({ event: THREE_PVP.EVENT, periodKey: key, total: { $gt: 0 } }).sort({ total: -1, updatedAt: 1 }).limit(limit).lean()) as Row[];
  }

  /** getLastPVPRank: the latest settled run's top list (memory, else the newest run in the database). */
  async lastRank(): Promise<LastPvpRankRow[]> {
    if (this.state.lastRank.length > 0) return this.state.lastRank;
    const newest = await this.rows.findOne({ event: THREE_PVP.EVENT, total: { $gt: 0 } }).sort({ updatedAt: -1 }).lean();
    return newest ? this.topList(newest.periodKey) : [];
  }

  async topList(key: string): Promise<LastPvpRankRow[]> {
    const top = await this.rankedRows(key, THREE_PVP.TOP_N);
    const names = new Map((await this.characters.findByIds(top.map((r) => r.characterId))).map((d) => [d._id, d.name]));
    return top.map((r, i) => ({ name: names.get(r.characterId) ?? '?', rank: i + 1, pnt: r.total }));
  }

  /** Settlement: online ranked players are paid at once and see the result popup; the rest claim at NPC 1860. */
  async settle(run: ThreePvpRun): Promise<void> {
    const ranked = await this.rankedRows(run.key, THREE_PVP.MAX_RANKED);
    this.state.lastRank = await this.topList(run.key);
    let paid = 0;
    for (const [i, row] of ranked.entries()) {
      const session = this.scenes.findByCharacter(row.characterId);
      if (!session) continue;
      const rank = i + 1;
      const medals = medalsFor(row.total, rank);
      if (medals <= 0 || !(await this.pay(row.characterId, run.key, medals))) continue;
      paid++;
      const alert: PvpGroupResultAlert = { rank, point: medals, pvpPoint: medals };
      session.callback('showPVPGroupResultAlert', alert);
      await this.currencies.push(session);
    }
    const top = this.state.lastRank[0];
    this.scenes.broadcastAll('onRedMsg', [top
      ? `[Chiến Trường Dũng Sĩ] Kết thúc! Hạng nhất: ${top.name} (${top.pnt} điểm). ${paid} dũng sĩ đã nhận Huy Chương.`
      : '[Chiến Trường Dũng Sĩ] Kết thúc! Chưa có ai ghi điểm.']);
    this.logger.log(`3v3 run ${run.key} settled: ${ranked.length} ranked, ${paid} paid online`);
  }

  /** Claim tier 1 of a run row, credit the medals, add them to the lifetime total; the claim is rolled back when the credit fails. */
  private async pay(cid: number, key: string, medals: number): Promise<boolean> {
    const claimed = await this.rows.updateOne(
      { characterId: cid, event: THREE_PVP.EVENT, periodKey: key, claimedTiers: { $ne: MEDAL_TIER } }, { $addToSet: { claimedTiers: MEDAL_TIER } },
    );
    if (claimed.modifiedCount !== 1) return false;
    try {
      await this.currencies.credit(cid, 'threePvpPnt', medals);
      await this.rows.updateOne({ characterId: cid, event: THREE_PVP.EVENT_MEDAL, periodKey: 'all' }, { $inc: { total: medals } }, { upsert: true });
      return true;
    } catch (e) {
      await this.rows.updateOne({ characterId: cid, event: THREE_PVP.EVENT, periodKey: key }, { $pull: { claimedTiers: MEDAL_TIER } });
      this.logger.error(`3v3 medal credit failed for ${cid} (run ${key}): ${(e as Error).message}`);
      return false;
    }
  }

  /** NPC 1860 "battlefield_extra_reward": pays every older unclaimed run of the character (rank re-derived from the stored totals). */
  async claimExtra(cid: number, skipKey: string | null): Promise<ClaimOutcome> {
    const mine = (await this.rows.find({
      characterId: cid, event: THREE_PVP.EVENT, total: { $gt: 0 }, claimedTiers: { $ne: MEDAL_TIER },
      ...(skipKey ? { periodKey: { $ne: skipKey } } : {}),
    }).lean()) as Row[];
    const out: ClaimOutcome = { medals: 0, runs: 0 };
    for (const row of mine) {
      const better = await this.rows.countDocuments({
        event: THREE_PVP.EVENT, periodKey: row.periodKey,
        $or: [{ total: { $gt: row.total } }, { total: row.total, updatedAt: { $lt: row.updatedAt ?? new Date() } }],
      });
      const medals = medalsFor(row.total, better + 1);
      if (medals > 0 && (await this.pay(cid, row.periodKey, medals))) {
        out.medals += medals;
        out.runs++;
      }
    }
    if (out.medals > 0) {
      const session = this.scenes.findByCharacter(cid);
      if (session) await this.currencies.push(session);
    }
    return out;
  }

  async lifetimeMedals(cid: number): Promise<number> {
    const row = await this.rows.findOne({ characterId: cid, event: THREE_PVP.EVENT_MEDAL, periodKey: 'all' }, { total: 1 }).lean();
    return row?.total ?? 0;
  }

  /**
   * NPC 1860 "battlefield_get_title": the highest title tier the lifetime medals reach, 30 days, once per UTC+7 month. The month is
   * claimed first (unique row), the grant follows and the claim is released when it fails.
   */
  async claimTitle(cid: number, now: number): Promise<{ status: 'none' | 'claimed' | 'done'; titleId?: number }> {
    const tier = titleTierFor(await this.lifetimeMedals(cid));
    if (!tier) return { status: 'none' };
    const period = monthKey(now);
    const filter = { characterId: cid, event: THREE_PVP.EVENT_TITLE, periodKey: period };
    try {
      await this.rows.updateOne({ ...filter, claimedTiers: { $ne: MEDAL_TIER } }, { $addToSet: { claimedTiers: MEDAL_TIER } }, { upsert: true });
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return { status: 'claimed', titleId: tier.titleId };
      throw e;
    }
    try {
      await this.titles.grant(cid, tier.titleId, THREE_PVP.TITLE_DAYS * 86_400);
    } catch (e) {
      await this.rows.updateOne(filter, { $pull: { claimedTiers: MEDAL_TIER } });
      throw e;
    }
    return { status: 'done', titleId: tier.titleId };
  }
}
