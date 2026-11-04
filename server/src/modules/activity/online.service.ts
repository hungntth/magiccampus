// Online time and the online gift: tracks the open play segment of every online character, flushes it into today's
// character_daily.onlineMs once a minute and on disconnect / back to char select, derives the 30-minute diary ticks (task 33)
// and serves getTodayOnlineTime / getDailyOnlineAct (gift every 30 minutes of the day, exp + bound silver by level).

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { DiaryTask, dayKey, onlineGiftStatus, scaledReward, splitByDay, type TodayOnlineTime } from '@mc/shared';
import { GameGateway } from '../../gateway/game.gateway';
import type { Session } from '../../gateway/session';
import { RewardGrantService } from '../activity-rewards/reward-grant.service';
import { withCharLock } from '../inventory/char-lock';
import { CharacterDaily } from './daily.schema';
import { DiaryEvents } from './diary-events.service';
import { onlineMinutes, onlineTicks, openMsToday } from './online-rules';

const TICK_MS = 60_000;

@Injectable()
export class OnlineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnlineService.name);
  private readonly open = new Map<number, number>(); // characterId -> start of the unflushed segment (ms)
  private timer: NodeJS.Timeout | null = null;
  now = (): number => Date.now();

  constructor(
    @InjectModel(CharacterDaily.name) private readonly days: Model<CharacterDaily>,
    private readonly diary: DiaryEvents,
    private readonly rewards: RewardGrantService,
    private readonly gateway: GameGateway,
  ) {}

  onModuleInit(): void {
    const stop = (s: Session): Promise<void> => this.stop(s.characterId);
    this.gateway.onDisconnect(stop);
    this.gateway.onCharacterLeave(stop);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  start(characterId: number): void {
    if (!this.open.has(characterId)) this.open.set(characterId, this.now());
  }

  async stop(characterId: number | null): Promise<void> {
    if (characterId === null || !this.open.has(characterId)) return;
    try {
      await this.flush(characterId);
    } finally {
      this.open.delete(characterId);
    }
  }

  /** Moves the open segment into the day documents (split at midnight UTC+7) and restarts it at `now`. */
  async flush(characterId: number): Promise<void> {
    const since = this.open.get(characterId);
    if (since === undefined) return;
    const now = this.now();
    this.open.set(characterId, now);
    for (const part of splitByDay(since, now)) await this.diary.incDay(characterId, part.day, { onlineMs: part.ms });
  }

  /** Minutes online today (persisted plus the open segment). */
  async minutesToday(characterId: number): Promise<{ minutes: number; gifts: number }> {
    const now = this.now();
    const today = dayKey(now);
    const doc = await this.days.findOne({ characterId, day: today }, { onlineMs: 1, giftsClaimed: 1 }).lean();
    const since = this.open.get(characterId);
    const openMs = since === undefined ? 0 : openMsToday(since, now, today);
    return { minutes: onlineMinutes(doc?.onlineMs ?? 0, openMs), gifts: doc?.giftsClaimed ?? 0 };
  }

  async today(characterId: number): Promise<TodayOnlineTime> {
    const { minutes, gifts } = await this.minutesToday(characterId);
    return { t: minutes, f: gifts };
  }

  /**
   * getDailyOnlineAct: -1 gift taken (client re-initialises its timer), > 0 minutes until the next gift, 0 nothing more today.
   * The claim counter moves first (compare-and-set), then the reward is credited.
   */
  claimGift(session: Session): Promise<number> {
    const cid = session.characterId!;
    return withCharLock(cid, async () => {
      await this.flush(cid); // makes sure today's document exists and holds the elapsed time
      const { minutes, gifts } = await this.minutesToday(cid);
      const status = onlineGiftStatus(minutes, gifts);
      if (status.exhausted) return 0;
      if (!status.due) return status.minutesLeft;
      const at = gifts === 0 ? { $or: [{ giftsClaimed: 0 }, { giftsClaimed: { $exists: false } }] } : { giftsClaimed: gifts };
      const marked = await this.days.updateOne({ characterId: cid, day: dayKey(this.now()), ...at }, { $inc: { giftsClaimed: 1 } });
      if (marked.modifiedCount !== 1) return -1;
      const r = scaledReward('online', await this.rewards.levelOf(cid));
      await this.rewards.grantExpSilver(session, r.exp, r.silver);
      session.callback('onBlueMsg', 'Nhận thưởng online thành công!');
      return -1;
    });
  }

  private async tick(): Promise<void> {
    for (const cid of [...this.open.keys()]) {
      try {
        await this.flush(cid);
        const { minutes } = await this.minutesToday(cid);
        const ticks = onlineTicks(minutes);
        if (ticks > 0) await this.diary.raiseTo(cid, DiaryTask.ONLINE_30, ticks);
      } catch (e) {
        this.logger.warn(`online tick for ${cid}: ${(e as Error).message}`);
      }
    }
  }
}
