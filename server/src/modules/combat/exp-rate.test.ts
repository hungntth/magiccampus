// Tests of the battle exp rate from buff props 24 / 25 (Go exp_rate_buffs.go).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { charExp, expRateOfBuff, expRateOfBuffs, mergeExpRate, NEUTRAL_EXP_RATE, petExp } from './exp-rate';

const buff = (percent: number, ...slots: [number, number][]): Record<string, unknown> => {
  const t: Record<string, unknown> = { percent_flag: percent };
  slots.forEach(([p, n], i) => {
    t[`prop${i + 1}`] = p;
    t[`prop_num${i + 1}`] = n;
  });
  return t;
};

test('exp book buffs give char and pet rates (762 x3, 1538 pet only)', () => {
  const x3 = expRateOfBuff(buff(1, [24, 300], [25, 300]));
  assert.deepEqual([x3.charRate, x3.petRate], [3, 3]);
  const pet = expRateOfBuff(buff(1, [25, 300]));
  assert.deepEqual([pet.charRate, pet.petRate], [1, 3]);
});

test('values below 100 are +percent bonuses; percent_flag 0 and other props are ignored', () => {
  const t = expRateOfBuff(buff(1, [24, 5]));
  assert.deepEqual([t.charRate, t.charPct], [1, 5]);
  assert.deepEqual(expRateOfBuff(buff(0, [24, 300])), NEUTRAL_EXP_RATE);
  assert.deepEqual(expRateOfBuff(buff(1, [27, 300])), NEUTRAL_EXP_RATE);
  assert.deepEqual(expRateOfBuff(undefined), NEUTRAL_EXP_RATE);
});

test('rates do not stack: the highest book wins, percents add', () => {
  const m = expRateOfBuffs([buff(1, [24, 150]), buff(1, [24, 500]), buff(1, [24, 5]), buff(1, [24, 8])]);
  assert.equal(m.charRate, 5);
  assert.equal(m.charPct, 13);
  assert.equal(mergeExpRate(NEUTRAL_EXP_RATE, NEUTRAL_EXP_RATE).charRate, 1);
});

test('final exp = round(base * rate * (100 + pct) / 100)', () => {
  assert.equal(charExp(100, expRateOfBuff(buff(1, [24, 150]))), 150);
  assert.equal(charExp(7, expRateOfBuff(buff(1, [24, 150]))), 11); // 10.5 rounds up
  assert.equal(charExp(100, expRateOfBuffs([buff(1, [24, 300]), buff(1, [24, 10])])), 330);
  assert.equal(petExp(100, expRateOfBuff(buff(1, [24, 300]))), 100); // a char-only buff leaves the pet alone
  assert.equal(petExp(100, expRateOfBuff(buff(1, [25, 300]))), 300);
  assert.equal(charExp(0, expRateOfBuff(buff(1, [24, 300]))), 0);
  assert.equal(charExp(100, NEUTRAL_EXP_RATE), 100);
});
