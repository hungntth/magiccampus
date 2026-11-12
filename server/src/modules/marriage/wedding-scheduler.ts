// Wedding hall scheduler (M14 phase E; Go ceremony.go Tick): every 10 s, from the persisted bookings only (a restart loses nothing):
// a due booking opens (conditional `started` flip, world `onSysEvent {t:117}`, each partner gets the tier gift bag + a line, the vow
// prompt when both stand in the hall), a hall past its close time (60 min, or 10 min after the rings) is dropped and its guests
// leave, and a booking that never opened (server down for over an hour) is refunded to the booker. The tick never overlaps itself
// and the timer is cleared on module destroy.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WEDDING_TEXT, weddingTier } from '@mc/shared';
import { CharacterService } from '../character/character.service';
import { MarriagePush } from './marriage-push.service';
import { WeddingHall } from './wedding-hall.service';
import { WeddingItems } from './wedding-items.service';
import { schedulerAction, type Booking } from './wedding-rules';
import { WeddingService } from './wedding.service';
import { WeddingStore } from './wedding.store';

export const WEDDING_TICK_MS = 10_000;

@Injectable()
export class WeddingScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeddingScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly store: WeddingStore,
    private readonly service: WeddingService,
    private readonly hall: WeddingHall,
    private readonly items: WeddingItems,
    private readonly characters: CharacterService,
    private readonly push: MarriagePush,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), WEDDING_TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass (public for the smoke / tests); never throws, never overlaps. */
  async tick(now = Date.now()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const b of await this.store.list()) {
        try {
          const action = schedulerAction(b, now);
          if (action === 'open') await this.open(b);
          else if (action === 'close') await this.close(b);
          else if (action === 'missed') await this.missed(b);
        } catch (e) {
          this.logger.error(`wedding booking ${b.id} step failed: ${(e as Error).message}`); // the next tick retries what is still pending
        }
      }
      await this.hall.sweep(); // also catches strays: a login inside a closed hall, a failed exit
    } catch (e) {
      this.logger.error(`wedding tick failed: ${(e as Error).message}`);
    } finally {
      this.ticking = false;
    }
  }

  private async open(b: Booking): Promise<void> {
    const opened = await this.store.markStarted(b.id);
    if (!opened) return;
    const names = new Map((await this.characters.findByIds([b.maleId, b.femaleId])).map((c) => [c._id, c.name]));
    this.logger.log(`wedding hall ${b.id} opened (tier ${b.tier}, marriage ${b.marriageId})`);
    this.push.sysEvent({ t: 117, c1: b.maleId, n1: names.get(b.maleId) ?? '', c2: b.femaleId, n2: names.get(b.femaleId) ?? '' });
    const bag = weddingTier(b.tier)?.giftBag;
    for (const id of [b.maleId, b.femaleId]) {
      if (bag) await this.items.give(id, bag, 1, `wedding-gift:${b.id}:${id}`);
      this.push.say(id, WEDDING_TEXT.opened);
    }
    await this.hall.promptVows(opened);
  }

  /** Drops a finished hall; its guests leave in the sweep that ends the tick. */
  private async close(b: Booking): Promise<void> {
    if (await this.store.remove(b.id)) this.logger.log(`wedding hall ${b.id} closed (rings ${b.finishedAt !== null ? 'exchanged' : 'not exchanged'})`);
  }

  private async missed(b: Booking): Promise<void> {
    if (!(await this.store.remove(b.id))) return;
    this.logger.warn(`wedding booking ${b.id} never opened, refunding ${b.bookerId}`);
    await this.service.refund(b);
    this.push.say(b.bookerId, WEDDING_TEXT.missed);
  }
}
