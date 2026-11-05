// Tests for the trials pure rules: day reset / dead-run drop, entry verdicts, run start, the battle result transitions (win, stage clear,
// loss, last life, timeout), the claim verdicts and the payloads.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { trialsMonday } from '@mc/shared';
import type { TrialsState } from '../towers/towers.schema';
import {
  beginRun, entriesLeft, finishBattle, firstKillVerdict, openTrials, panelPayload, startVerdict, timerPayload, toTrialsState, unlocked, weeklyVerdict,
} from './trials-rules';

const T0 = Date.parse('2026-11-05T10:00:00+07:00');
const RET = { m: 30, x: 100, y: 200 };

describe('open / state', () => {
  it('a new day resets the entries, the same day keeps them', () => {
    const raw: TrialsState = { t: '20261104', n: 3, kt: { '1': 'x' } };
    assert.equal(openTrials(raw, T0).n, 0);
    assert.equal(openTrials({ ...raw, t: '20261105' }, T0).n, 3);
    assert.deepEqual(openTrials(raw, T0).kt, { '1': 'x' });
  });

  it('an expired run is dropped unless it is in battle, and even then after the stale window', () => {
    const run = { f: 1, st: T0 - 2_000_000, dl: T0 - 1000, lv: 3, ib: 0, sg: 0 };
    assert.equal(openTrials({ run }, T0).run, undefined);
    assert.ok(openTrials({ run: { ...run, ib: 1 } }, T0).run);
    assert.equal(openTrials({ run: { ...run, ib: 1 } }, T0 + 15 * 60_000).run, undefined);
    assert.ok(openTrials({ run: { ...run, dl: T0 + 1000 } }, T0).run);
  });

  it('round trip keeps run / ret and drops them when empty', () => {
    const o = openTrials({}, T0);
    assert.deepEqual(toTrialsState(o), { t: '20261105', n: 0, kt: {}, a: {}, sc: {}, at: '' });
    beginRun(o, 1, T0, RET);
    const s = toTrialsState(o);
    assert.equal(s.run?.f, 1);
    assert.deepEqual(s.ret, RET);
  });
});

describe('entry', () => {
  it('floor 1 is free, floor N needs N-1 cleared', () => {
    const o = openTrials({ kt: { '1': 'a' } }, T0);
    assert.equal(unlocked(o, 1), true);
    assert.equal(unlocked(o, 2), true);
    assert.equal(unlocked(o, 3), false);
  });

  it('verdict order: floor, level 130, active battle, resume, lock, entries', () => {
    const fresh = openTrials({}, T0);
    assert.deepEqual(startVerdict(fresh, 200, 6), { ok: false, why: 'floor' });
    assert.deepEqual(startVerdict(fresh, 129, 1), { ok: false, why: 'level' });
    assert.deepEqual(startVerdict(fresh, 130, 2), { ok: false, why: 'locked' });
    assert.deepEqual(startVerdict(fresh, 130, 1), { ok: true, resume: false });
    assert.deepEqual(startVerdict(openTrials({ n: 5, t: '20261105' }, T0), 130, 1), { ok: false, why: 'entries' });
    const run = { f: 1, st: T0, dl: T0 + 60_000, lv: 5, ib: 0, sg: 0 };
    assert.deepEqual(startVerdict(openTrials({ n: 5, t: '20261105', run }, T0), 130, 1), { ok: true, resume: true });
    assert.deepEqual(startVerdict(openTrials({ run: { ...run, ib: 1 } }, T0), 130, 1), { ok: false, why: 'active' });
  });

  it('starting takes one entry, sets the deadline / lives, keeps a non-trials return point', () => {
    const o = openTrials({}, T0);
    const run = beginRun(o, 4, T0, RET);
    assert.equal(o.n, 1);
    assert.equal(entriesLeft(o), 4);
    assert.deepEqual([run.f, run.dl - T0, run.lv, run.sg], [4, 25 * 60_000, 3, 0]);
    beginRun(o, 1, T0, { m: 559, x: 1, y: 1 }); // a trials map never replaces the return point
    assert.deepEqual(o.ret, RET);
    const blank = openTrials({}, T0);
    beginRun(blank, 1, T0, { m: 0, x: 0, y: 0 });
    assert.equal(blank.ret?.m, 38);
  });
});

describe('battle result', () => {
  const armed = (floor: number, extra: Partial<NonNullable<TrialsState['run']>> = {}): ReturnType<typeof openTrials> => {
    const o = openTrials({}, T0);
    beginRun(o, floor, T0, RET);
    o.run!.ib = 1;
    Object.assign(o.run!, extra);
    return o;
  };

  it('nothing happens without a run in battle', () => {
    assert.equal(finishBattle(openTrials({}, T0), true, T0), null);
    const o = openTrials({}, T0);
    beginRun(o, 1, T0, RET);
    assert.equal(finishBattle(o, true, T0), null);
  });

  it('a win records kt and the best score, ends the run, first clear once', () => {
    const o = armed(1);
    const out = finishBattle(o, true, T0 + 600_000)!; // 10 of 20 minutes left, 5 of 5 lives
    assert.equal(out.score, 40 + 15 + 30);
    assert.equal(out.firstClear, true);
    assert.equal(out.ended, true);
    assert.equal(out.stamp, trialsMonday(T0));
    assert.deepEqual([o.kt['1'], o.sc['1'], o.run], [out.stamp, 85, undefined]);
    const again = armed(1);
    again.kt = o.kt;
    again.sc = { '1': 99 };
    const second = finishBattle(again, true, T0 + 60_000)!;
    assert.equal(second.firstClear, false);
    assert.equal(again.sc['1'], 99); // a lower score never replaces the best
    assert.equal(second.best, 99);
  });

  it('floor 3 stage 0 is a stage clear: no kt, the run goes on at stage 1 with its lives and timer', () => {
    const o = armed(3);
    const out = finishBattle(o, true, T0 + 1000)!;
    assert.deepEqual([out.stageClear, out.stage, out.ended, out.livesLeft], [true, 1, false, 4]);
    assert.equal(o.kt['3'], undefined);
    assert.equal(o.run?.sg, 1);
    assert.equal(o.run?.ib, 0);
    o.run!.ib = 1;
    assert.equal(finishBattle(o, true, T0 + 2000)!.ended, true);
    assert.ok(o.kt['3']);
  });

  it('a loss costs one life; the last one ends the run', () => {
    const o = armed(2);
    assert.deepEqual([finishBattle(o, false, T0 + 1000)!.livesLeft, o.run?.lv, o.run?.ib], [3, 3, 0]);
    const last = armed(5, { lv: 1 });
    const out = finishBattle(last, false, T0 + 1000)!;
    assert.deepEqual([out.ended, out.livesLeft, last.run], [true, 0, undefined]);
  });

  it('past the deadline nothing counts, even a win', () => {
    const o = armed(1);
    const out = finishBattle(o, true, T0 + 20 * 60_000)!;
    assert.deepEqual([out.timedOut, out.ended, o.kt['1'], o.run], [true, true, undefined, undefined]);
  });
});

describe('claims and payloads', () => {
  it('first kill: needs a clear, once', () => {
    assert.deepEqual(firstKillVerdict(openTrials({}, T0), 1), { ok: false, why: 'notCleared' });
    assert.deepEqual(firstKillVerdict(openTrials({ kt: { '1': 'x' } }, T0), 9), { ok: false, why: 'floor' });
    assert.deepEqual(firstKillVerdict(openTrials({ kt: { '1': 'x' }, a: { '1': 1 } }, T0), 1), { ok: false, why: 'claimed' });
    assert.deepEqual(firstKillVerdict(openTrials({ kt: { '1': 'x' } }, T0), 1), { ok: true, value: 1 });
  });

  it('weekly: highest floor cleared this week, once per Monday stamp', () => {
    const mon = trialsMonday(T0);
    assert.deepEqual(weeklyVerdict(openTrials({ kt: { '1': 'old' } }, T0), T0), { ok: false, why: 'nothing' });
    assert.deepEqual(weeklyVerdict(openTrials({ kt: { '1': mon, '2': mon, '3': 'old' } }, T0), T0), { ok: true, value: { floor: 2, stamp: mon } });
    assert.deepEqual(weeklyVerdict(openTrials({ kt: { '2': mon }, at: mon }, T0), T0), { ok: false, why: 'claimed' });
    assert.equal(weeklyVerdict(openTrials({ kt: { '2': mon }, at: 'old' }, T0), T0).ok, true);
  });

  it('panel and timer payloads', () => {
    const p = panelPayload(openTrials({ n: 2, t: '20261105', kt: { '1': 'x' }, a: { '1': 1, '2': 0 }, sc: { '1': 80 }, at: 'y' }, T0), T0);
    assert.deepEqual(p, { m: 5, n: 2, t: T0, ut: '20261105', kt: { '1': 'x' }, a: { '1': 1 }, at: 'y', sc: { '1': 80 }, nf: 0 });
    assert.deepEqual(timerPayload({ f: 1, st: 0, dl: T0 + 5000, lv: 3 }, T0), { num: 5000, life: 3 });
    assert.deepEqual(timerPayload({ f: 1, st: 0, dl: T0 - 5000, lv: 3 }, T0), { num: 0, life: 3 });
  });
});
