// Wedding hall persistence (M14 phase E): bookings (`wedding_bookings`) and guest origins (`wedding_origins`). Plain data access with
// conditional updates (the services run lock-free where a conditional write is enough): marking a hall started, a vow, the ring
// finish, a cancel and the red envelope counter each succeed for exactly one caller.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Counter } from '../character/counter.schema';
import { WeddingBooking } from './marriage.schema';
import { WeddingOrigin } from './wedding.schema';
import type { Booking } from './wedding-rules';

export interface NewBooking {
  marriageId: number;
  maleId: number;
  femaleId: number;
  bookerId: number;
  line: number;
  startAt: number;
  flag: number;
  tier: number;
  costBind: number;
  costMoney: number;
}

export interface Origin {
  mapId: number;
  x: number;
  y: number;
}

type Row = WeddingBooking & { _id: number };

const toBooking = (d: Row): Booking => ({
  id: d._id, marriageId: d.marriageId, maleId: d.maleId, femaleId: d.femaleId, bookerId: d.bookerId, line: d.line,
  startAt: d.startAt.getTime(), flag: d.flag, tier: d.tier, costBind: d.costBind, costMoney: d.costMoney, started: d.started,
  maleAgreed: d.maleAgreed, femaleAgreed: d.femaleAgreed, finishedAt: d.finishedAt ? d.finishedAt.getTime() : null,
  invited: [...(d.invited ?? [])], redBags: d.redBags ?? 0,
});

const isDup = (e: unknown): boolean => (e as { code?: number }).code === 11000;

/** Raised when the unique marriage index refuses a second booking (a race past the locks). */
export class DuplicateBookingError extends Error {}

@Injectable()
export class WeddingStore {
  constructor(
    @InjectModel(WeddingBooking.name) private readonly bookings: Model<WeddingBooking>,
    @InjectModel(WeddingOrigin.name) private readonly origins: Model<WeddingOrigin>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
  ) {}

  // ---- bookings ----

  /** Every booking, earliest start first. */
  async list(): Promise<Booking[]> {
    return (await this.bookings.find().sort({ startAt: 1, _id: 1 }).lean()).map(toBooking);
  }

  /** The booking of a couple member (either partner), or null. */
  async ofCharacter(characterId: number): Promise<Booking | null> {
    const d = await this.bookings.findOne({ $or: [{ maleId: characterId }, { femaleId: characterId }] }).lean();
    return d ? toBooking(d) : null;
  }

  async ofMarriage(marriageId: number): Promise<Booking | null> {
    const d = await this.bookings.findOne({ marriageId }).lean();
    return d ? toBooking(d) : null;
  }

  async get(id: number): Promise<Booking | null> {
    const d = await this.bookings.findById(id).lean();
    return d ? toBooking(d) : null;
  }

  async create(b: NewBooking): Promise<Booking> {
    try {
      const d = await this.bookings.create({ _id: await this.next('wedding_bookings'), ...b, startAt: new Date(b.startAt) });
      return toBooking(d.toObject());
    } catch (e) {
      if (isDup(e)) throw new DuplicateBookingError();
      throw e;
    }
  }

  /** Deletes a booking that has not started (cancel); false when it already started or is gone. */
  async removeUnstarted(id: number): Promise<boolean> {
    return (await this.bookings.deleteOne({ _id: id, started: false })).deletedCount === 1;
  }

  /** Deletes a booking whatever its state (hall closed, missed); false when somebody else got there first. */
  async remove(id: number): Promise<boolean> {
    return (await this.bookings.deleteOne({ _id: id })).deletedCount === 1;
  }

  /** Marks the hall open; null when it already was (or the booking is gone). */
  async markStarted(id: number): Promise<Booking | null> {
    const d = await this.bookings.findOneAndUpdate({ _id: id, started: false }, { $set: { started: true } }, { new: true }).lean();
    return d ? toBooking(d) : null;
  }

  /** Records one partner's vow on a started, unfinished hall; null when the hall is not in that state. */
  async vow(id: number, side: 'male' | 'female'): Promise<Booking | null> {
    const field = side === 'male' ? 'maleAgreed' : 'femaleAgreed';
    const d = await this.bookings.findOneAndUpdate({ _id: id, started: true, finishedAt: null }, { $set: { [field]: true } }, { new: true }).lean();
    return d ? toBooking(d) : null;
  }

  /** Stamps the ring exchange once (both vows in); null for every caller after the first. */
  async finish(id: number, now: number): Promise<Booking | null> {
    const d = await this.bookings
      .findOneAndUpdate({ _id: id, finishedAt: null, maleAgreed: true, femaleAgreed: true }, { $set: { finishedAt: new Date(now) } }, { new: true })
      .lean();
    return d ? toBooking(d) : null;
  }

  async invite(id: number, ids: readonly number[]): Promise<void> {
    await this.bookings.updateOne({ _id: id }, { $addToSet: { invited: { $each: [...ids] } } });
  }

  /** Takes one red envelope slot: returns how many were given before (alternation index), null when the hall is not open. */
  async nextRedBag(id: number): Promise<number | null> {
    const d = await this.bookings.findOneAndUpdate({ _id: id, started: true }, { $inc: { redBags: 1 } }, { new: false, projection: { redBags: 1 } }).lean();
    return d ? (d.redBags ?? 0) : null;
  }

  // ---- origins ----

  async origin(characterId: number): Promise<Origin | null> {
    const d = await this.origins.findById(characterId).lean();
    return d ? { mapId: d.mapId, x: d.x, y: d.y } : null;
  }

  async saveOrigin(characterId: number, o: Origin): Promise<void> {
    await this.origins.updateOne({ _id: characterId }, { $set: { mapId: o.mapId, x: o.x, y: o.y } }, { upsert: true });
  }

  async deleteOrigin(characterId: number): Promise<void> {
    await this.origins.deleteOne({ _id: characterId });
  }

  private async next(key: string): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
