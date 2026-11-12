// Wedding hall booking (M14 phase E; Go wedding.go / handlers wedding.go): the `onInitBookList` rows, the NPC tier pick, `bookWeddingHall`
// (married, valid time, past -> tomorrow, <= 24 h, one booking per couple, global 30 min gap, tier required, price split moneyBind
// first and stored for the exact refund) and `cancelWeddingHall` (either partner, before the start, refund to the booker).
// Locks: the couple's `marriage:<id>` locks (a divorce takes the same), then the global `wedding-book` key for the gap check + charge.

import { Injectable } from '@nestjs/common';
import {
  WEDDING_TEXT, bookingConflict, bookingTooFar, nextBookingDate, validBookingTime, waitParts, weddingTier,
  type BookWeddingArg, type WeddingBookRow, type WeddingTierPush,
} from '@mc/shared';
import { RpcException } from '../../gateway/errors';
import type { Session } from '../../gateway/session';
import { CharacterService } from '../character/character.service';
import { withKeyLock } from '../inventory/char-lock';
import { chargeSilver, refundSilver } from './marriage-money';
import { withMarriageLocks } from './marriage-locks';
import { MarriagePush } from './marriage-push.service';
import { MarriageStore } from './marriage.store';
import { DuplicateBookingError, WeddingStore } from './wedding.store';
import { normalizeLine, refundOf, type Booking } from './wedding-rules';
import { TierPickService } from './tier-pick.service';

@Injectable()
export class WeddingService {
  /** Replaceable in tests. */
  now: () => number = Date.now;

  constructor(
    private readonly store: WeddingStore,
    private readonly marriageStore: MarriageStore,
    private readonly characters: CharacterService,
    private readonly picks: TierPickService,
    private readonly push: MarriagePush,
  ) {}

  /** The booking list the panel shows: everyone's bookings, earliest first. */
  async rows(): Promise<WeddingBookRow[]> {
    const list = await this.store.list();
    const ids = [...new Set(list.flatMap((b) => [b.maleId, b.femaleId]))];
    const names = new Map((await this.characters.findByIds(ids)).map((c) => [c._id, c.name]));
    return list.map((b) => {
      const partner = b.bookerId === b.maleId ? b.femaleId : b.maleId;
      return {
        cid: b.bookerId, pid: partner, cname: names.get(b.bookerId) ?? String(b.bookerId), pname: names.get(partner) ?? String(partner),
        line: b.line, date: b.startAt, flag: b.flag, type: b.tier, open: b.started,
      };
    });
  }

  /** `onInitBookList` to one online session (opens the panel on the client). */
  async pushList(session: Session): Promise<void> {
    session.callback('onInitBookList', await this.rows());
  }

  /** The list to the given characters when they are online (after a booking / cancel). */
  async pushListTo(ids: readonly number[]): Promise<void> {
    const rows = await this.rows();
    for (const id of new Set(ids)) this.push.session(id)?.callback('onInitBookList', rows);
  }

  /** NPC `marriage_book_N` stores the tier; `marriage_list` (null) keeps a live pick, else defaults to tier 1 (Go always set 1). Opens the panel. */
  async pickTier(session: Session, tier: number | null): Promise<void> {
    const cid = session.characterId!;
    const t = weddingTier(tier ?? (this.picks.get(cid, this.now()) || 1));
    if (!t) throw RpcException.invalidArgs('tier');
    this.picks.set(cid, t.type, this.now());
    const info: WeddingTierPush = { type: t.type, label: t.label, cost: t.cost };
    session.callback('onWeddingTier', info);
    await this.pushList(session);
  }

  /** `bookWeddingHall({line, hour, minute, flag})`. */
  async book(session: Session, arg: BookWeddingArg): Promise<null> {
    const cid = session.characterId!;
    const marriage = await this.marriageStore.activeOf(cid);
    if (!marriage) throw RpcException.forbidden(WEDDING_TEXT.notMarried);
    if (!validBookingTime(arg.hour, arg.minute)) throw RpcException.forbidden(WEDDING_TEXT.badTime);
    const flag = arg.flag === 1 ? 1 : 0;
    const result = await withMarriageLocks([marriage.maleId, marriage.femaleId], () => withKeyLock('wedding-book', async () => {
      const now = this.now();
      const startAt = nextBookingDate(now, arg.hour, arg.minute);
      if (bookingTooFar(startAt, now)) throw RpcException.forbidden(WEDDING_TEXT.tooFar);
      const conflict = bookingConflict(await this.store.list(), marriage._id, startAt);
      if (conflict === 'duplicate') throw RpcException.forbidden(WEDDING_TEXT.duplicate);
      if (conflict === 'gap') throw RpcException.forbidden(WEDDING_TEXT.gap);
      const tier = weddingTier(this.picks.get(cid, now)); // plan order: the tier is required after the time / conflict checks
      if (!tier) throw RpcException.forbidden(WEDDING_TEXT.noTier);
      const paid = await chargeSilver(this.characters, cid, tier.cost);
      if (!paid) throw RpcException.forbidden(WEDDING_TEXT.noMoney);
      try {
        const booking = await this.store.create({
          marriageId: marriage._id, maleId: marriage.maleId, femaleId: marriage.femaleId, bookerId: cid, line: normalizeLine(arg.line),
          startAt, flag, tier: tier.type, costBind: paid.bind, costMoney: paid.money,
        });
        return { booking, paid, now };
      } catch (e) {
        await refundSilver(this.characters, cid, paid);
        if (e instanceof DuplicateBookingError) throw RpcException.forbidden(WEDDING_TEXT.duplicate);
        throw e;
      }
    }));
    const { booking, paid, now } = result;
    this.push.paid(cid, paid, -1);
    await this.pushListTo([marriage.maleId, marriage.femaleId]);
    const me = await this.characters.getById(cid);
    const wait = waitParts(booking.startAt, now);
    this.push.sysEvent({ t: 118, c: cid, n: me.name, h: wait.h, m: wait.m, l: booking.line });
    return null;
  }

  /** `cancelWeddingHall()`: either partner, before the start; the booker gets the exact split back. */
  async cancel(session: Session): Promise<null> {
    const cid = session.characterId!;
    const marriage = await this.marriageStore.activeOf(cid);
    if (!marriage) throw RpcException.forbidden(WEDDING_TEXT.noBooking);
    const booking = await withMarriageLocks([marriage.maleId, marriage.femaleId], async () => {
      const b = await this.store.ofMarriage(marriage._id);
      if (!b) throw RpcException.forbidden(WEDDING_TEXT.noBooking);
      if (b.started) throw RpcException.forbidden(WEDDING_TEXT.started);
      if (!(await this.store.removeUnstarted(b.id))) throw RpcException.forbidden(WEDDING_TEXT.started);
      return b;
    });
    await this.refund(booking);
    this.push.say(booking.bookerId, WEDDING_TEXT.cancelled);
    await this.pushListTo([booking.maleId, booking.femaleId]);
    return null;
  }

  /** Puts the exact paid split back on the booker (cancel, missed hall) and pushes the wallet lines. */
  async refund(b: Booking): Promise<void> {
    const r = refundOf(b);
    await refundSilver(this.characters, b.bookerId, { bind: r.bind, money: r.money, bindTotal: 0, moneyTotal: 0 });
    const after = await this.characters.getById(b.bookerId);
    this.push.paid(b.bookerId, { bind: r.bind, money: r.money, bindTotal: after.moneyBind ?? 0, moneyTotal: after.money ?? 0 }, 1);
  }
}
