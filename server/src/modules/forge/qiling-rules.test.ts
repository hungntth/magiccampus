// Ky Linh / Trung Chu rules: roll ranges and distinct plan props, locked lines, value-only reroll, stone plan and the worn-lines stat bonus.

import test from 'node:test';
import assert from 'node:assert/strict';
import { QILING_MAX, QILING_PLANS, QILING_SUFFIX, type QilingLine } from '@mc/shared';
import { planQiling, qilingBonusOf, rerollQilingValues, rollQilingLines, rollQilingValue } from './qiling-rules';

/** Deterministic LCG in [0, 1). */
const seeded = (seed: number): (() => number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
};

test('a rolled value stays inside [max/10, max] and only the top tier reaches max', () => {
  const rng = seeded(7);
  let fulls = 0;
  for (let i = 0; i < 3000; i++) {
    for (const t of [4, 1, 9, 62, 71]) {
      const l = rollQilingValue(t, rng);
      assert.equal(l.max, QILING_MAX[t]);
      assert.ok(l.v >= l.max / 10 - 1e-9 && l.v <= l.max, `${t}: ${l.v}`);
      if (l.v === l.max) fulls++;
      if (QILING_SUFFIX[t] === 1) assert.equal(l.v, Math.round(l.v));
    }
  }
  // tier weight 20 / 1000 = 2 % of 15000 rolls
  assert.ok(fulls > 150 && fulls < 450, `fulls ${fulls}`);
});

test('the lowest roll is the floor max/10 and a top roll is exactly max', () => {
  assert.equal(rollQilingValue(4, () => 0.999999).v, 250);
  assert.equal(rollQilingValue(4, () => 0).v, 2500);
});

test('Ky Linh rolls three distinct props of the slot plan', () => {
  const rng = seeded(11);
  for (let slot = 0; slot < 6; slot++) {
    const allowed = new Set(QILING_PLANS[slot].map((c) => c.t));
    for (let i = 0; i < 200; i++) {
      const lines = rollQilingLines(rng, slot, []);
      assert.equal(lines.length, 3);
      assert.equal(new Set(lines.map((l) => l.t)).size, 3);
      assert.ok(lines.every((l) => allowed.has(l.t)));
    }
  }
  assert.deepEqual(rollQilingLines(rng, 9, []), []);
});

test('locked lines survive a roll and their props are not drawn twice', () => {
  const rng = seeded(3);
  const current: QilingLine[] = [{ t: 32, v: 0.04, max: 0.05 }, { t: 71, v: 0.3, max: 0.5 }, { t: 62, v: 0.01, max: 0.025 }];
  for (let i = 0; i < 100; i++) {
    const lines = rollQilingLines(rng, 0, current, [true, false, true]);
    assert.deepEqual(lines[0], current[0]);
    assert.deepEqual(lines[2], current[2]);
    assert.ok(![32, 62].includes(lines[1].t));
  }
});

test('Trung Chu keeps every prop and rerolls only the unlocked values', () => {
  const rng = seeded(5);
  const current: QilingLine[] = [{ t: 4, v: 300, max: 2500 }, { t: 1, v: 15000, max: 15000 }, { t: 9, v: 0.02, max: 0.05 }];
  const out = rerollQilingValues(rng, current, [false, true, false]);
  assert.deepEqual(out.map((l) => l.t), [4, 1, 9]);
  assert.deepEqual(out[1], current[1]);
  assert.ok(out[0].v >= 250 && out[2].v >= 0.005);
  assert.deepEqual(rerollQilingValues(rng, current.slice(0, 2), [false, false, false]), []);
  const uncapped: QilingLine[] = [{ t: 99, v: 5, max: 10 }, current[1], current[2]];
  assert.equal(rerollQilingValues(rng, uncapped, [false, true, true])[0].v, 5);
});

test('stone plan: 4 for Ky Linh, 6 + 5 per lock for Trung Chu, 6 gold per missing stone, all locked refused', () => {
  assert.deepEqual(planQiling(false, [false, false, false], 1), { need: 4, have: 1, missing: 3, gold: 18 });
  assert.deepEqual(planQiling(false, [true, true, true], 9), { need: 4, have: 9, missing: 0, gold: 0 });
  assert.deepEqual(planQiling(true, [false, false, false], 10), { need: 6, have: 10, missing: 0, gold: 0 });
  assert.deepEqual(planQiling(true, [true, false, true], 4), { need: 16, have: 4, missing: 12, gold: 72 });
  assert.equal(planQiling(true, [true, true, true], 99), null);
});

test('worn lines add flat props rounded and rates as points, scaled by the set bonus of the full lines', () => {
  const piece: QilingLine[] = [{ t: 4, v: 100, max: 2500 }, { t: 9, v: 0.02, max: 0.05 }, { t: 62, v: 0.01, max: 0.025 }];
  const b = qilingBonusOf([piece]);
  assert.equal(b.flat.attack, 100);
  assert.equal(b.flat.dodge, 2);
  assert.equal(b.rates.finalEnhPhyHurt, 1);
  const full = (t: number): QilingLine => ({ t, v: QILING_MAX[t], max: QILING_MAX[t] });
  // 2 full lines (+2 %): 4 -> 100 * 1.02 = 102, an unmapped debuff-hit line adds nothing
  const two = qilingBonusOf([[{ t: 4, v: 100, max: 2500 }, full(1), full(32)]]);
  assert.equal(two.flat.attack, 102);
  assert.equal(two.flat.maxHp, Math.round(15000 * 1.02));
  assert.equal(Object.keys(two.rates).length, 0);
  assert.deepEqual(qilingBonusOf([]).flat, {});
});
