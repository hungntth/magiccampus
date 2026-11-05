// Auto-task persistence: load the character's state (advanced to now, free runs rolled to today's day key) and write it with a
// `rev` compare-and-swap. Actions run under a per-character lock (AutoTaskService), the CAS guards against other writers.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { dayKey } from '@mc/shared';
import { advance, emptyAutoState, rollDay, type AutoState } from './autotask-rules';
import { CharacterAutoTask } from './autotask.schema';

export interface AutoDoc extends AutoState {
  rev: number;
}

const MAX_TRIES = 4;

@Injectable()
export class AutoTaskStateService {
  private readonly logger = new Logger(AutoTaskStateService.name);
  now: () => number = Date.now;

  constructor(@InjectModel(CharacterAutoTask.name) private readonly docs: Model<CharacterAutoTask>) {}

  /** The stored state, or a fresh one (rev 0, nothing stored yet), not advanced. */
  async peek(characterId: number): Promise<AutoDoc> {
    const d = await this.docs.findOne({ characterId }).lean<AutoDoc>();
    return d
      ? { day: d.day ?? '', use: d.use ?? 0, run: d.run ?? null, queue: d.queue ?? [], finish: d.finish ?? {}, dg: d.dg ?? [], rev: d.rev ?? 0 }
      : { ...emptyAutoState(), rev: 0 };
  }

  /** The state advanced to now with today's day key; `dirty` = it differs from what is stored. */
  async open(characterId: number): Promise<{ st: AutoDoc; now: number; dirty: boolean }> {
    const st = await this.peek(characterId);
    const now = this.now();
    const a = rollDay(st, dayKey(now));
    const b = advance(st, now);
    return { st, now, dirty: a || b };
  }

  /** Writes `st` over the document it was read from (rev check). False when another write won. */
  async save(characterId: number, st: AutoDoc): Promise<boolean> {
    const set = { day: st.day, use: st.use, run: st.run, queue: st.queue, finish: st.finish, dg: st.dg };
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

  /** Read-modify-write retried on a lost race. `fn` returns false to skip the write. Returns the saved state, null when skipped / lost. */
  async mutate(characterId: number, fn: (st: AutoDoc, now: number) => boolean): Promise<AutoDoc | null> {
    for (let i = 0; i < MAX_TRIES; i++) {
      const { st, now } = await this.open(characterId);
      if (!fn(st, now)) return null;
      if (await this.save(characterId, st)) return st;
    }
    this.logger.warn(`character ${characterId}: auto-task state write lost ${MAX_TRIES} races`);
    return null;
  }
}
