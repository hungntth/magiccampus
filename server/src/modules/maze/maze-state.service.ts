// Mê Trận persistence: load the character's document (daily counters rolled to today's UTC+7 day key) and write it back with a
// `rev` compare-and-swap. `update` serialises every action of one character on an in-process queue (the run is the only writer
// and actions have side effects such as gold spending, so no retry on a lost race: a foreign write fails the action).

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { dayKey } from '@mc/shared';
import type { MazeRun } from './maze-board';
import { CharacterMaze } from './maze.schema';

export interface MazeDoc {
  day: string;
  level: number;
  enterUsed: number;
  refreshUsed: number;
  run: MazeRun | null;
  rev: number;
}

@Injectable()
export class MazeStateService {
  private readonly tails = new Map<number, Promise<unknown>>();
  now: () => number = Date.now;

  constructor(@InjectModel(CharacterMaze.name) private readonly docs: Model<CharacterMaze>) {}

  /** The stored state with the daily counters rolled to today (not saved). */
  async read(characterId: number): Promise<MazeDoc> {
    const d = await this.docs.findOne({ characterId }).lean<MazeDoc>();
    const doc: MazeDoc = d
      ? { day: d.day ?? '', level: d.level ?? 1, enterUsed: d.enterUsed ?? 0, refreshUsed: d.refreshUsed ?? 0, run: d.run ?? null, rev: d.rev ?? 0 }
      : { day: '', level: 1, enterUsed: 0, refreshUsed: 0, run: null, rev: 0 };
    const today = dayKey(this.now());
    if (doc.day !== today) Object.assign(doc, { day: today, level: 1, enterUsed: 0, refreshUsed: 0 });
    if (doc.level < 1 || doc.level > 5) doc.level = 1;
    return doc;
  }

  /** Runs `fn` on the character's document under the per-character queue and saves it afterwards (also when fn returns normally only). */
  update<T>(characterId: number, fn: (doc: MazeDoc) => Promise<T> | T): Promise<T> {
    const prev = this.tails.get(characterId) ?? Promise.resolve();
    const job = prev.catch(() => undefined).then(async () => {
      const doc = await this.read(characterId);
      const out = await fn(doc);
      await this.save(characterId, doc);
      return out;
    });
    const tail = job.catch(() => undefined);
    this.tails.set(characterId, tail);
    void tail.then(() => {
      if (this.tails.get(characterId) === tail) this.tails.delete(characterId);
    });
    return job;
  }

  private async save(characterId: number, doc: MazeDoc): Promise<void> {
    const set = { day: doc.day, level: doc.level, enterUsed: doc.enterUsed, refreshUsed: doc.refreshUsed, run: doc.run };
    if (doc.rev === 0) {
      try {
        await this.docs.create({ characterId, ...set, rev: 1 });
        doc.rev = 1;
        return;
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
        throw new Error(`maze state of ${characterId} was written concurrently`);
      }
    }
    const res = await this.docs.updateOne({ characterId, rev: doc.rev }, { $set: set, $inc: { rev: 1 } });
    if (res.modifiedCount !== 1) throw new Error(`maze state of ${characterId} was written concurrently`);
    doc.rev += 1;
  }
}
