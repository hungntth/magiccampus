// Marriage persistence (M14 D): active marriage lookups, create / end, the seek board and the proposal rows. Plain data access;
// the rules and the pushes live in the services. Ids come from the `marriages` / `marriage_requests` counters.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MARRIAGE } from '@mc/shared';
import { Counter } from '../character/counter.schema';
import { MarriageRequest, MarriageSeeking, type MarriageRequestDocument } from './marriage-board.schema';
import { Marriage, WeddingBooking, type MarriageDocument } from './marriage.schema';

/** Raised when the partial unique index refuses a second active marriage (a race past the locks). */
export class AlreadyMarriedError extends Error {}

const isDup = (e: unknown): boolean => (e as { code?: number }).code === 11000;

@Injectable()
export class MarriageStore {
  constructor(
    @InjectModel(Marriage.name) private readonly marriages: Model<Marriage>,
    @InjectModel(WeddingBooking.name) private readonly bookings: Model<WeddingBooking>,
    @InjectModel(MarriageSeeking.name) private readonly seeking: Model<MarriageSeeking>,
    @InjectModel(MarriageRequest.name) private readonly requests: Model<MarriageRequest>,
    @InjectModel(Counter.name) private readonly counters: Model<Counter>,
  ) {}

  // ---- marriages ----

  /** The character's active marriage, or null. */
  activeOf(characterId: number): Promise<MarriageDocument | null> {
    return this.marriages.findOne({ active: true, $or: [{ maleId: characterId }, { femaleId: characterId }] });
  }

  async isMarried(characterId: number): Promise<boolean> {
    return (await this.marriages.exists({ active: true, $or: [{ maleId: characterId }, { femaleId: characterId }] })) !== null;
  }

  /** Every active marriage, oldest first (rank input). */
  activeList(): Promise<MarriageDocument[]> {
    return this.marriages.find({ active: true }).sort({ marriedAt: 1, _id: 1 });
  }

  async create(maleId: number, femaleId: number, priorType: number): Promise<MarriageDocument> {
    try {
      return await this.marriages.create({ _id: await this.next('marriages'), maleId, femaleId, type: 1, priorType, active: true });
    } catch (e) {
      if (isDup(e)) throw new AlreadyMarriedError();
      throw e;
    }
  }

  /** Marks the marriage ended; null when it already was. */
  end(id: number): Promise<MarriageDocument | null> {
    return this.marriages.findOneAndUpdate({ _id: id, active: true }, { $set: { active: false, endedAt: new Date() } }, { new: true });
  }

  /** Phase E: the ring exchange raises the marriage to the hall tier (the `type` of onInitCouple). */
  async setType(id: number, type: number): Promise<void> {
    await this.marriages.updateOne({ _id: id, active: true }, { $set: { type } });
  }

  /** Removes a marriage row (rollback of a half-made marriage). */
  async remove(id: number): Promise<void> {
    await this.marriages.deleteOne({ _id: id });
  }

  /** Phase E hook: a divorce drops the couple's booking (no refund, Go parity). Returns how many rows went. */
  async dropBookings(marriageId: number): Promise<number> {
    return (await this.bookings.deleteMany({ marriageId })).deletedCount;
  }

  // ---- seek board ----

  getSeeking(characterId: number): Promise<MarriageSeeking | null> {
    return this.seeking.findOne({ characterId }).lean();
  }

  /** Writes (overwrites) the character's ad. */
  async saveSeeking(characterId: number, content: string, flag: number, addDate: number): Promise<void> {
    await this.seeking.updateOne({ characterId }, { $set: { content, flag, addDate } }, { upsert: true });
  }

  async deleteSeeking(...characterIds: number[]): Promise<void> {
    await this.seeking.deleteMany({ characterId: { $in: characterIds } });
  }

  /** Top of the board: flag desc, newest first (the view sorts again after dropping rows of deleted characters). */
  listSeeking(): Promise<MarriageSeeking[]> {
    return this.seeking.find().sort({ flag: -1, addDate: -1 }).limit(MARRIAGE.seekListMax).lean();
  }

  // ---- proposals ----

  async createRequest(fromId: number, toId: number, content: string, now: number): Promise<MarriageRequestDocument> {
    return this.requests.create({
      _id: await this.next('marriage_requests'), fromId, toId, content, flag: 0, addDate: new Date(now), addDateMs: now,
    });
  }

  getRequest(id: number): Promise<MarriageRequestDocument | null> {
    return this.requests.findById(id);
  }

  /** Sets the reply on an open request; false when it was not open any more. */
  async reply(id: number, flag: number, now: number): Promise<boolean> {
    const r = await this.requests.updateOne({ _id: id, flag: 0 }, { $set: { flag, replyDate: now } });
    return r.modifiedCount === 1;
  }

  /** Proposals the character sent (any age inside the TTL window), for the daily limits. */
  sentBy(characterId: number): Promise<{ toId: number; addDate: number }[]> {
    return this.requests.find({ fromId: characterId }, { toId: 1, addDateMs: 1 }).lean().then((rows) => rows.map((r) => ({ toId: r.toId, addDate: r.addDateMs })));
  }

  /** Proposals that involve the character (sent or received), newest first. */
  involving(characterId: number): Promise<MarriageRequestDocument[]> {
    return this.requests.find({ $or: [{ fromId: characterId }, { toId: characterId }] }).sort({ addDateMs: -1 }).limit(MARRIAGE.requestListMax);
  }

  private async next(key: string): Promise<number> {
    const doc = await this.counters.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return doc.seq;
  }
}
