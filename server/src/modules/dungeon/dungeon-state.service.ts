// Phụ bản persistence (Go application/dungeon service.go + mehuyen_rules_service.go / _party.go): one character_dungeons
// document per character, every write a `rev` compare-and-swap (retried). Run opening, victories, step / mark records, party
// credit of the leader's floor quests, the daily lock / first clear stamps, run closing, the abandon lock and the chest claim.

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { dayKey, type DungeonDef } from '@mc/shared';
import { QuestService } from '../quest/quest.service';
import { dungeonByFighter, finalQuest, floorCleared, floorQuests, reachable, runOf } from './dungeon-rules';
import { CharacterDungeon, type DungeonRun } from './dungeon.schema';

export type DungeonDoc = Pick<CharacterDungeon, 'characterId' | 'runs' | 'done' | 'cleared' | 'levels' | 'abandoned' | 'rev'>;

const empty = (characterId: number): DungeonDoc => ({ characterId, runs: {}, done: {}, cleared: {}, levels: {}, abandoned: {}, rev: 0 });
const MAX_TRIES = 6;

export function newRun(day: string, difficulty: number, openedAt: number, leader: number, party: number[]): DungeonRun {
  return {
    day, beaten: [], chest: false, difficulty, openedAt, leader, party, credited: [], marks: [], entered: false, closed: '', warned: 0,
    morph: null,
  };
}

@Injectable()
export class DungeonStateService {
  private readonly logger = new Logger(DungeonStateService.name);
  /** Swappable clock (tests / GM time override). */
  now: () => number = Date.now;

  constructor(
    @InjectModel(CharacterDungeon.name) private readonly docs: Model<CharacterDungeon>,
    private readonly quests: QuestService,
  ) {}

  today(): string {
    return dayKey(this.now());
  }

  async load(characterId: number): Promise<DungeonDoc> {
    const d = await this.docs.findOne({ characterId }).lean<DungeonDoc>();
    return d ? { ...empty(characterId), ...d } : empty(characterId);
  }

  /** Today's run of the dungeon, null when none. */
  async run(characterId: number, d: DungeonDef): Promise<DungeonRun | null> {
    return runOf((await this.load(characterId)).runs, d.key, this.today());
  }

  /** Floor quests done for this run: completed today (ledger) or credited by the run leader (Go questDone). */
  async questsDone(characterId: number, d: DungeonDef, run: DungeonRun | null): Promise<Set<number>> {
    const out = new Set<number>();
    for (const q of floorQuests(d)) {
      if (run?.credited.includes(q) || (await this.quests.completedToday(characterId, q))) out.add(q);
    }
    return out;
  }

  /** One dungeon quest done for this run (ledger today or party credit), floor quest or not (Mê Huyễn 5242). */
  async questDone(characterId: number, run: DungeonRun | null, questId: number): Promise<boolean> {
    return !!run?.credited.includes(questId) || (await this.quests.completedToday(characterId, questId));
  }

  /** Run + quest set in one call (reach / clear / pending callers). */
  async view(characterId: number, d: DungeonDef): Promise<{ run: DungeonRun | null; done: Set<number> }> {
    const run = await this.run(characterId, d);
    return { run, done: await this.questsDone(characterId, d, run) };
  }

  async reachable(characterId: number, d: DungeonDef): Promise<number> {
    const v = await this.view(characterId, d);
    return reachable(d, v.run, v.done);
  }

  /**
   * Read-modify-write with a rev check. `fn` mutates the copy and returns true to save (false = nothing to write). Returns
   * whether a write happened.
   */
  async mutate(characterId: number, fn: (st: DungeonDoc) => boolean): Promise<boolean> {
    for (let i = 0; i < MAX_TRIES; i++) {
      const cur = await this.load(characterId);
      const next: DungeonDoc = structuredClone(cur);
      if (!fn(next)) return false;
      const set = { runs: next.runs, done: next.done, cleared: next.cleared, levels: next.levels, abandoned: next.abandoned };
      if (cur.rev === 0 && !(await this.docs.exists({ characterId }))) {
        try {
          await this.docs.create({ characterId, ...set, rev: 1 });
          return true;
        } catch (e) {
          if ((e as { code?: number }).code !== 11000) throw e;
          continue;
        }
      }
      const res = await this.docs.updateOne({ characterId, rev: cur.rev }, { $set: set, $inc: { rev: 1 } });
      if (res.modifiedCount === 1) return true;
    }
    this.logger.warn(`character ${characterId}: dungeon state write lost ${MAX_TRIES} races`);
    return false;
  }

  /** Go OpenRuledRun: every entrant gets today's run; the leader's run lists the members. */
  async openRuledRun(d: DungeonDef, leader: number, members: number[], difficulty: number): Promise<void> {
    const at = this.now();
    const day = this.today();
    for (const cid of [leader, ...members]) {
      await this.mutate(cid, (st) => {
        st.runs[d.key] = newRun(day, difficulty, at, leader, cid === leader ? [...members] : []);
        return true;
      });
    }
  }

  /** Go RecordVictory: marks the NPC beaten in today's run when the floor is reached. Returns whether credited and floor now cleared. */
  async recordVictory(characterId: number, npcId: number): Promise<{ credited: boolean; cleared: boolean; d?: DungeonDef }> {
    const ref = dungeonByFighter(npcId);
    if (!ref) return { credited: false, cleared: false };
    const { d, floor } = ref;
    const before = await this.view(characterId, d);
    if (!before.run || before.run.beaten.includes(npcId) || reachable(d, before.run, before.done) < floor) return { credited: false, cleared: false, d };
    const box: { after?: DungeonRun } = {};
    const ok = await this.mutate(characterId, (st) => {
      const r = runOf(st.runs, d.key, this.today());
      if (!r || r.beaten.includes(npcId)) return false;
      r.beaten.push(npcId);
      box.after = r;
      return true;
    });
    if (!ok || !box.after) return { credited: false, cleared: false, d };
    const cleared = floor < d.floors.length - 1 && floorCleared(d.floors[floor], box.after, before.done);
    if (d.rules.finalBoss === npcId) await this.finishRun(characterId, d);
    return { credited: true, cleared, d };
  }

  /** Marks a non-fight step (seal, stele) in today's run; false when already marked or no run. */
  markStep(characterId: number, d: DungeonDef, npcId: number): Promise<boolean> {
    return this.mutate(characterId, (st) => {
      const r = runOf(st.runs, d.key, this.today());
      if (!r || r.beaten.includes(npcId)) return false;
      r.beaten.push(npcId);
      return true;
    });
  }

  /** Per-run mark (Go AddMark): refused on a closed run or an existing mark. */
  addMark(characterId: number, d: DungeonDef, mark: number): Promise<boolean> {
    return this.mutate(characterId, (st) => {
      const r = runOf(st.runs, d.key, this.today());
      if (!r || r.closed || r.marks.includes(mark)) return false;
      r.marks.push(mark);
      return true;
    });
  }

  /** Daily lock + first clear + cleared difficulty (Go markCleared via finishRun). */
  finishRun(characterId: number, d: DungeonDef): Promise<boolean> {
    const at = this.now();
    return this.mutate(characterId, (st) => {
      const r = runOf(st.runs, d.key, this.today());
      if (!r) return false;
      stampCleared(st, d.key, at, r.difficulty);
      return true;
    });
  }

  /**
   * Go CreditParty: the run leader's turn-in of a floor quest credits every member of its run (members whose run names that
   * leader). The final quest also stamps the daily lock / first clear for the leader and the credited members.
   */
  async creditParty(leader: number, d: DungeonDef, questId: number): Promise<{ members: number[]; final: boolean }> {
    const lr = await this.run(leader, d);
    if (!lr || lr.leader !== leader) return { members: [], final: false };
    const final = questId === finalQuest(d);
    const at = this.now();
    const day = this.today();
    const credited: number[] = [];
    for (const m of lr.party) {
      let ok = false;
      await this.mutate(m, (st) => {
        const r = runOf(st.runs, d.key, day);
        if (!r || r.leader !== leader) return false;
        ok = true;
        if (!r.credited.includes(questId)) r.credited.push(questId);
        if (final) stampCleared(st, d.key, at, r.difficulty);
        return true;
      });
      if (ok) credited.push(m);
    }
    if (final) await this.finishRun(leader, d);
    return { members: credited, final };
  }

  /** Closes today's run with `reason`; returns the morph it carried (to be cured), undefined when nothing changed. */
  async closeRun(characterId: number, d: DungeonDef, reason: DungeonRun['closed']): Promise<{ morph: DungeonRun['morph'] } | undefined> {
    let out: { morph: DungeonRun['morph'] } | undefined;
    await this.mutate(characterId, (st) => {
      const r = runOf(st.runs, d.key, this.today());
      if (!r) return false;
      out = { morph: r.morph };
      if (!r.closed) r.closed = reason;
      r.morph = null;
      return true;
    });
    return out;
  }

  /** Abandon lock (Go RecordAbandon): the quest cannot be taken again today. */
  recordAbandon(characterId: number, questId: number): Promise<boolean> {
    const day = this.today();
    return this.mutate(characterId, (st) => {
      for (const [k, v] of Object.entries(st.abandoned)) if (v !== day) delete st.abandoned[k];
      st.abandoned[String(questId)] = day;
      return true;
    });
  }
}

/** Go markCleared: daily lock start, first clear and the cleared difficulty. */
export function stampCleared(st: DungeonDoc, key: string, at: number, difficulty: number): void {
  st.done[key] = at;
  if (!st.cleared[key]) st.cleared[key] = at;
  const levels = st.levels[key] ?? [];
  if (difficulty > 0 && !levels.includes(difficulty)) levels.push(difficulty);
  st.levels[key] = levels;
}
