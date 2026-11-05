// Training persistence: load the character's document (defaults filled in) and write it with a `rev` compare-and-swap, retried on
// a lost race. `locked` serialises the actions of one character (several awaits: spend, state write, grant), so the CAS only
// guards against other writers. The clock is replaceable in tests.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { completeTraining, type TrainingDoc } from './training-doc';
import { CharacterTraining } from './training.schema';

const MAX_TRIES = 6;

@Injectable()
export class TrainingStateService {
  private readonly logger = new Logger(TrainingStateService.name);
  private readonly locks = new Map<number, Promise<unknown>>();
  now: () => number = Date.now;

  constructor(@InjectModel(CharacterTraining.name) private readonly docs: Model<CharacterTraining>) {}

  async peek(characterId: number): Promise<TrainingDoc> {
    return completeTraining(characterId, await this.docs.findOne({ characterId }).lean<Partial<TrainingDoc>>());
  }

  /** Read-modify-write: `fn` edits the copy and returns true to save. Returns the saved document, null when skipped or lost. */
  async mutate(characterId: number, fn: (st: TrainingDoc) => boolean): Promise<TrainingDoc | null> {
    for (let i = 0; i < MAX_TRIES; i++) {
      const st = await this.peek(characterId);
      if (!fn(st)) return null;
      const set = { hmtxl: st.hmtxl, tower: st.tower, txkc: st.txkc };
      if (st.rev === 0 && !(await this.docs.exists({ characterId }))) {
        try {
          await this.docs.create({ characterId, ...set, rev: 1 });
          return { ...st, rev: 1 };
        } catch (e) {
          if ((e as { code?: number }).code !== 11000) throw e;
          continue;
        }
      }
      const res = await this.docs.updateOne({ characterId, rev: st.rev }, { $set: set, $inc: { rev: 1 } });
      if (res.modifiedCount === 1) return { ...st, rev: st.rev + 1 };
    }
    this.logger.warn(`character ${characterId}: training state write lost ${MAX_TRIES} races`);
    return null;
  }

  /** Serialises the actions of one character. */
  async locked<T>(characterId: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(characterId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(characterId, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(characterId) === tail) this.locks.delete(characterId);
    }
  }
}
