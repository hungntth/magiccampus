// Towers persistence: load the character's tower document and write it with a `rev` compare-and-swap. Nine boss, corridor and
// trials all go through `mutate` (retried on a lost race); `locked` serialises the multi-step actions of one character.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { CorridorState, NineBossState, TrialsState } from './towers.schema';
import { CharacterTowers } from './towers.schema';

export interface TowersDoc {
  nineboss: NineBossState;
  corridor: CorridorState;
  trials: TrialsState;
  rev: number;
}

const MAX_TRIES = 4;

@Injectable()
export class TowersStateService {
  private readonly logger = new Logger(TowersStateService.name);
  private readonly locks = new Map<number, Promise<unknown>>();

  constructor(@InjectModel(CharacterTowers.name) private readonly docs: Model<CharacterTowers>) {}

  /** Serialises the actions of one character. */
  async locked<T>(cid: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(cid) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(cid, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(cid) === tail) this.locks.delete(cid);
    }
  }

  /** The stored document (rev 0 = nothing stored yet). */
  async open(characterId: number): Promise<TowersDoc> {
    const d = await this.docs.findOne({ characterId }).lean<TowersDoc>();
    return {
      nineboss: { ...(d?.nineboss ?? {}) },
      corridor: { ...(d?.corridor ?? {}) },
      trials: { ...(d?.trials ?? {}) },
      rev: d?.rev ?? 0,
    };
  }

  /** Writes `doc` over the document it was read from (rev check). False when another write won. */
  async save(characterId: number, doc: TowersDoc): Promise<boolean> {
    const set = { nineboss: doc.nineboss, corridor: doc.corridor, trials: doc.trials };
    if (doc.rev === 0 && !(await this.docs.exists({ characterId }))) {
      try {
        await this.docs.create({ characterId, ...set, rev: 1 });
        doc.rev = 1;
        return true;
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
        return false;
      }
    }
    const res = await this.docs.updateOne({ characterId, rev: doc.rev }, { $set: set, $inc: { rev: 1 } });
    if (res.modifiedCount !== 1) return false;
    doc.rev += 1;
    return true;
  }

  /** Read-modify-write retried on a lost race. `fn` returns false to skip the write. The saved doc, or null when skipped / lost. */
  async mutate(characterId: number, fn: (doc: TowersDoc) => boolean): Promise<TowersDoc | null> {
    for (let i = 0; i < MAX_TRIES; i++) {
      const doc = await this.open(characterId);
      if (!fn(doc)) return null;
      if (await this.save(characterId, doc)) return doc;
    }
    this.logger.warn(`character ${characterId}: towers state write lost ${MAX_TRIES} races`);
    return null;
  }
}
