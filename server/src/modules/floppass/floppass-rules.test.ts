// Tests for the flop pass rules: layout, flip / boss / wrap, kill tiers, reborn keeps killed bosses, restart pricing, state roll (Go service_test).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyFlip, applyKill, applyReborn, applyRefresh, applyRestart, charInfo, enterStage, flipError, freshState, killPrice, layout,
  liveBosses, openFlopState, rebornPrice, restartPrice, stageReward, type FlopRng, type FlopState,
} from './floppass-rules';

const first: FlopRng = () => 0;
const seqRng = (...values: number[]): FlopRng => {
  let i = 0;
  return (n) => Math.min(values[i++ % values.length], n - 1);
};
const atStage = (stage: number, rng: FlopRng = first): FlopState => {
  const st = freshState(1, rng);
  enterStage(st, stage, rng);
  return st;
};

describe('layout', () => {
  it('stage L hides L - 1 distinct bosses among 9 cards, sorted', () => {
    for (let stage = 1; stage <= 9; stage++) {
      const b = layout(stage - 1, [], (n) => Math.floor(Math.random() * n));
      assert.equal(b.length, stage - 1);
      assert.equal(new Set(b).size, b.length);
      assert.deepEqual(b, [...b].sort((x, y) => x - y));
      assert.ok(b.every((c) => c >= 1 && c <= 9));
    }
  });

  it('keeps the given cards (reborn) and fills the rest', () => {
    assert.deepEqual(layout(3, [5], first), [1, 2, 5]);
  });
});

describe('flip', () => {
  it('rejects bad cards, killed bosses and a dead run', () => {
    const st = atStage(3);
    assert.equal(flipError(st, 0), 'card');
    assert.equal(flipError(st, 10), 'card');
    assert.equal(flipError(st, 1.5), 'card');
    assert.equal(flipError(st, 4), null);
    st.killed = [st.bosses[0]];
    assert.equal(flipError(st, st.bosses[0]), 'card');
    st.s = false;
    assert.equal(flipError(st, 4), 'dead');
  });

  it('a safe card passes: +1 p, the stage reward, the next stage with a fresh layout', () => {
    const st = atStage(2); // boss at card 1
    assert.deepEqual(st.bosses, [1]);
    const out = applyFlip(st, 5, first);
    assert.deepEqual([out.passed, out.bossNum], [true, 1]);
    assert.equal(out.reward?.templateId, 3627);
    assert.deepEqual([st.p, st.i, st.s, st.bosses.length, st.killed.length], [1, 3, true, 2, 0]);
  });

  it('a boss card ends the run and keeps the stage', () => {
    const st = atStage(3); // bosses 1, 2
    const out = applyFlip(st, 2, first);
    assert.deepEqual([out.passed, out.bossNum, out.reward], [false, 2, undefined]);
    assert.deepEqual([st.p, st.i, st.s], [0, 3, false]);
  });

  it('bossNum counts live bosses only; clearing stage 9 wraps to stage 1', () => {
    const st = atStage(3);
    st.killed = [1];
    assert.equal(liveBosses(st), 1);
    assert.equal(applyFlip(st, 9, first).bossNum, 1);
    const last = atStage(9); // bosses 1..8, card 9 is safe
    assert.deepEqual(last.bosses, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(applyFlip(last, 9, first).passed, true);
    assert.deepEqual([last.i, last.p, last.bosses.length], [1, 1, 0]);
  });
});

describe('kill boss', () => {
  it('tiers: stage 2 / 3 / 4 for 20 / 40 / 80, at most stage - 1 kills', () => {
    assert.equal(killPrice(atStage(1)), 'nokill');
    assert.equal(killPrice(atStage(2)), 20);
    const st = atStage(3);
    assert.equal(killPrice(st), 20);
    applyKill(st, first);
    assert.equal(killPrice(st), 40);
    applyKill(st, first);
    assert.equal(killPrice(st), 'nokill'); // both bosses of stage 3 gone
    const s4 = atStage(5);
    applyKill(s4, first);
    applyKill(s4, first);
    assert.equal(killPrice(s4), 80);
    applyKill(s4, first);
    assert.equal(killPrice(s4), 'nokill'); // 3 kills max
  });

  it('the third kill needs stage 4 (fixed 2026-10-27: kills are possible right after a reborn on a low stage)', () => {
    const st = atStage(3);
    st.s = false;
    assert.equal(killPrice(st), 'dead');
    applyReborn(st, first);
    assert.equal(killPrice(st), 20);
  });

  it('removes a random live boss and keeps the list sorted', () => {
    const st = atStage(4); // bosses 1 2 3
    assert.equal(applyKill(st, seqRng(2)), 3);
    assert.equal(applyKill(st, seqRng(0)), 1);
    assert.deepEqual(st.killed, [1, 3]);
    assert.deepEqual(charInfo(st).ci, { i: 4, s: true, db: 2, dbd: { 1: true, 3: true } });
  });
});

describe('reborn / restart / refresh', () => {
  it('reborn only after a boss, keeps killed bosses, reshuffles the others', () => {
    const st = atStage(4);
    assert.equal(rebornPrice(st), 'alive');
    applyKill(st, seqRng(1)); // kills card 2
    st.s = false;
    assert.equal(rebornPrice(st), 30);
    applyReborn(st, seqRng(0));
    assert.equal(st.s, true);
    assert.deepEqual(st.killed, [2]);
    assert.equal(st.bosses.length, 3);
    assert.ok(st.bosses.includes(2));
  });

  it('restart: 20 free per day then 50, the counter rolls with the day', () => {
    const st = freshState(1, first);
    for (let n = 0; n < 20; n++) {
      assert.equal(restartPrice(st, 'd1'), 0);
      applyRestart(st, first);
    }
    assert.equal(restartPrice(st, 'd1'), 50);
    assert.equal(restartPrice(st, 'd2'), 0);
    assert.equal(st.restarts, 0);
  });

  it('restart goes back to stage 1 but keeps the passes; refresh re-rolls every pick', () => {
    const st = atStage(6);
    st.p = 7;
    st.s = false;
    applyRestart(st, first);
    assert.deepEqual([st.i, st.s, st.p, st.bosses.length], [1, true, 7, 0]);
    applyRefresh(st, (n) => n - 1);
    assert.deepEqual(stageReward(st, 1), { templateId: 1470, count: 1 });
    assert.deepEqual(stageReward(st, 9), { templateId: 3390, count: 5 });
  });
});

describe('state roll', () => {
  it('a new cycle resets everything; a stored run in the same cycle is kept', () => {
    const st = atStage(4, first);
    st.p = 5;
    st.award = true;
    const same = openFlopState(JSON.parse(JSON.stringify(st)), 1, first);
    assert.deepEqual([same.p, same.i, same.award], [5, 4, true]);
    const next = openFlopState(JSON.parse(JSON.stringify(st)), 2, first);
    assert.deepEqual([next.cycle, next.p, next.i, next.award], [2, 0, 1, false]);
    assert.deepEqual(openFlopState(null, 3, first).cycle, 3);
  });

  it('a broken layout or picks are repaired', () => {
    const st = atStage(4, first);
    const broken = { ...JSON.parse(JSON.stringify(st)), bosses: [1, 1] };
    const fixed = openFlopState(broken, 1, first);
    assert.equal(fixed.i, 1);
    assert.equal(fixed.bosses.length, 0);
    const noPicks = openFlopState({ ...JSON.parse(JSON.stringify(st)), ii: { 1: 99 } }, 1, first);
    assert.equal(Object.keys(noPicks.ii).length, 9);
  });

  it('charInfo carries p, award, picks and the run', () => {
    const info = charInfo(freshState(1, first));
    assert.deepEqual([info.p, info.award, info.ci.i, info.ci.s, info.ci.db], [0, false, 1, true, 0]);
    assert.equal(Object.keys(info.ii).length, 9);
  });
});
