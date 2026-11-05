// Flop pass persistence: the character's run state rolled to the current weekly cycle, written with a `rev` compare-and-swap, plus the
// weekly ranking rows (upsert keeps the best score, top N by score). `locked` serialises the multi-step actions of one character.

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { flopWindow } from '@mc/shared';
import { freshState, openFlopState, type FlopRng, type FlopState } from './floppass-rules';
import { CharacterFlop, FlopRank } from './floppass.schema';

export interface FlopDoc extends FlopState {
  rev: number;
}

export interface RankRow {
  cid: number;
  name: string;
  score: number;
}

@Injectable()
export class FlopStateService {
  private readonly locks = new Map<number, Promise<unknown>>();
  now: () => number = Date.now;
  rng: FlopRng = (n) => Math.floor(Math.random() * n);

  constructor(
    @InjectModel(CharacterFlop.name) private readonly docs: Model<CharacterFlop>,
    @InjectModel(FlopRank.name) private readonly ranks: Model<FlopRank>,
  ) {}

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

  /** The stored state of the current cycle (a new cycle starts fresh in memory, written on the first save). */
  async open(characterId: number): Promise<FlopDoc> {
    const cycle = flopWindow(this.now()).cycle;
    const d = await this.docs.findOne({ characterId }).lean<FlopDoc>();
    if (!d) return { ...freshState(cycle, this.rng), rev: 0 };
    return { ...openFlopState(d, cycle, this.rng), rev: d.rev ?? 0 };
  }

  /** Writes `st` over the document it was read from (rev check). False when another write won. */
  async save(characterId: number, st: FlopDoc): Promise<boolean> {
    const { rev, ...set } = st;
    if (rev === 0 && !(await this.docs.exists({ characterId }))) {
      try {
        await this.docs.create({ characterId, ...set, rev: 1 });
        st.rev = 1;
        return true;
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
        return false;
      }
    }
    const res = await this.docs.updateOne({ characterId, rev }, { $set: set, $inc: { rev: 1 } });
    if (res.modifiedCount !== 1) return false;
    st.rev += 1;
    return true;
  }

  /** Raises the character's ranking row of `cycle` (score only ever grows within a cycle). */
  async record(cycle: number, cid: number, name: string, score: number): Promise<void> {
    await this.ranks.updateOne({ cycle, cid }, { $set: { name }, $max: { score } }, { upsert: true });
  }

  async top(cycle: number, n: number): Promise<RankRow[]> {
    return this.ranks.find({ cycle }).sort({ score: -1, cid: 1 }).limit(n).lean<RankRow[]>();
  }
}
