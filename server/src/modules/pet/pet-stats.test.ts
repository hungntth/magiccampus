// Pet stat formula against the legacy worked example (server research 2026-11-04_08 section 11): creature 32.

import test from 'node:test';
import assert from 'node:assert/strict';
import { petStats, toPetProperty } from './pet-stats';

const ZERO = { str: 0, agi: 0, sta: 0, int: 0, eng: 0 };
const creature32 = {
  att: { str: 6, agi: 5, sta: 20, int: 5, eng: 5 },
  apt: { str: 1900, agi: 1600, sta: 2500, int: 1500, eng: 1500 },
};

function at(level: number, growRate: number, aptEx = ZERO) {
  return petStats({ ...creature32, level, growRate, growRateAdd: 0, aptEx }).stats;
}

function pick(s: ReturnType<typeof at>) {
  return {
    hp: s.maxHp, mp: s.maxMp, atk: s.attack, def: s.defense, matk: s.magicAttack, mdef: s.magicDefense, hit: s.hit,
    dodge: s.dodge, speed: s.speed, crit: s.critical,
  };
}

test('creature 32 Lv1 grow 1.6 (quest pet)', () => {
  assert.deepEqual(pick(at(1, 1.6)), { hp: 972, mp: 201, atk: 62, def: 304, matk: 52, mdef: 146, hit: 103, dodge: 2, speed: 135, crit: 2 });
});

test('creature 32 Lv10 grow 1.6', () => {
  assert.deepEqual(pick(at(10, 1.6)), { hp: 1400, mp: 554, atk: 161, def: 466, matk: 145, mdef: 408, hit: 107, dodge: 6, speed: 199, crit: 5 });
});

test('creature 32 Lv1 grow 0.8 (catch pet)', () => {
  assert.deepEqual(pick(at(1, 0.8)), { hp: 496, mp: 102, atk: 31, def: 151, matk: 26, mdef: 73, hit: 101, dodge: 1, speed: 117, crit: 1 });
});

test('creature 32 Lv10 grow 0.8', () => {
  assert.deepEqual(pick(at(10, 0.8)), { hp: 710, mp: 279, atk: 80, def: 232, matk: 72, mdef: 203, hit: 103, dodge: 3, speed: 149, crit: 2 });
});

test('growRateAdd adds to the scale and distributed points add to the attributes', () => {
  const a = petStats({ ...creature32, level: 1, growRate: 0.8, growRateAdd: 0.8, aptEx: ZERO }).stats;
  assert.equal(a.maxHp, 972);
  const b = petStats({ ...creature32, level: 1, growRate: 1.6, growRateAdd: 0, aptEx: { ...ZERO, sta: 10 } });
  assert.equal(b.attrs.sta, 30);
  assert.ok(b.stats.maxHp > 972);
});

test('level 0 counts as level 1 and property exposes final attributes', () => {
  const s = petStats({ ...creature32, level: 0, growRate: 1.6, growRateAdd: 0, aptEx: ZERO });
  assert.equal(s.stats.maxHp, 972);
  const p = toPetProperty(s, 5, 1.6, 0);
  assert.equal(p.finalStamina, 20);
  assert.equal(p.finalHp, 972);
  assert.equal(p.lastPoint, 5);
  assert.equal(p.growRate, 1.6);
});
