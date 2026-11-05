// Star instance persistence: load the character's state (rolled to today's UTC+7 day) and write it with a `rev` compare-and-swap.
// Callers run read-modify-write through `mutate` (retried on a lost race); `locked` serialises the multi-step actions of one
// character (spend + state write are several awaits), like AutoTaskService.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { dayKey } from '@mc/shared';
import { parseStarState, rollDay, type StarState } from './star-rules';
import { CharacterStarInstance } from './star.schema';

export interface StarDoc extends StarState {
  rev: number;
}

const MAX_TRIES = 4;

@Injectable()
export class StarStateService {
  private readonly logger = new Logger(StarStateService.name);
  private readonly locks = new Map<number, Promise<unknown>>();
  now: () => number = Date.now;

  constructor(@InjectModel(CharacterStarInstance.name) private readonly docs: Model<CharacterStarInstance>) {}

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

  /** The stored state advanced to today (rev 0 = nothing stored yet); `dirty` = the day roll changed it. */
  async open(characterId: number): Promise<{ st: StarDoc; dirty: boolean }> {
    const d = await this.docs.findOne({ characterId }).lean<StarDoc>();
    const st: StarDoc = { ...parseStarState(d), rev: d?.rev ?? 0 };
    return { st, dirty: rollDay(st, dayKey(this.now())) };
  }

  /** Writes `st` over the document it was read from (rev check). False when another write won. */
  async save(characterId: number, st: StarDoc): Promise<boolean> {
    const set = { scores: st.scores, dailyMax: st.dailyMax, dailyUsed: st.dailyUsed, day: st.day, sweep: st.sweep };
    if (st.rev === 0 && !(await this.docs.exists({ characterId }))) {
      try {
        await this.docs.create({ characterId, ...set, rev: 1 });
        st.rev = 1;
        return true;
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
        return false;
      }
    }
    const res = await this.docs.updateOne({ characterId, rev: st.rev }, { $set: set, $inc: { rev: 1 } });
    if (res.modifiedCount !== 1) return false;
    st.rev += 1;
    return true;
  }

  /** Read-modify-write retried on a lost race. `fn` returns false to skip the write. The saved state, or null when skipped / lost. */
  async mutate(characterId: number, fn: (st: StarDoc) => boolean): Promise<StarDoc | null> {
    for (let i = 0; i < MAX_TRIES; i++) {
      const { st } = await this.open(characterId);
      if (!fn(st)) return null;
      if (await this.save(characterId, st)) return st;
    }
    this.logger.warn(`character ${characterId}: star state write lost ${MAX_TRIES} races`);
    return null;
  }
}
