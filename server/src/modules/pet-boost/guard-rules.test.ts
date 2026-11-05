// Tests of the pure pet guard rules, anchored to the Flash PET_GUARD_MAX_PROP table via Go pet_guard_bonus_test.go
// (all guards level 30, centre level 5, every slot orange) plus the state / cost / slot rules.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PetGuardData } from '@mc/shared';
import type { PetGuardRow } from '../gamedata/pet-depth-data';
import {
  computeGuardProps, computeGuardSidProps, emptyGuard, guardBonusesFromProps, guardBonusOfSlot, guardSidAllowed, guardSlotOf,
  guardSlotPetIds, guardUpgradeCost, guardedPetIds, isGuardable, normalizeGuard, GUARD_SLOT_KEYS,
} from './guard-rules';

const row = (sid: number, lev: number, pairs: [number, number][], num = 0, gold = 0): PetGuardRow => ({
  sid, lev, num, gold, props: pairs.map(([prop, val]) => ({ prop, val })),
});
const MAX_ROWS: Record<number, PetGuardRow> = {
  1: row(1, 30, [[6, 298850000], [7, 298850000], [59, 600], [60, 600]]),
  2: row(2, 30, [[1, 426850000], [11, 64000000], [31, 107000], [61, 43000]]),
  3: row(3, 30, [[4, 106850000], [5, 85530000], [62, 600], [63, 600]]),
  4: row(4, 30, [[71, 2700], [14, 43000], [72, 127000], [13, 107000]]),
};
const rowOf = (lev: number, sid: number): PetGuardRow | undefined => (lev === 30 ? MAX_ROWS[sid] : undefined);
const near = (got: number | undefined, want: number, eps = 0.0001): void => assert.ok(Math.abs((got ?? NaN) - want) <= eps, `got ${got} want ${want}`);

function fullState(): PetGuardData {
  const s = emptyGuard();
  s.lvData['0'] = 5;
  for (const k of ['1', '2', '3', '4']) s.lvData[k] = 30;
  GUARD_SLOT_KEYS.forEach((k, i) => { s.petData[k] = 100 + i; });
  return s;
}

describe('guard bonus formula (PET_GUARD_MAX_PROP anchors)', () => {
  it('matches the client maximum for the centre pet', () => {
    const t = computeGuardProps(fullState(), rowOf, () => 4);
    const want: Record<number, number> = {
      6: 58836.0938, 7: 58836.0938, 4: 21036.0938, 5: 16838.7188, 1: 84036.0938, 11: 12600,
      59: 0.118125, 60: 0.118125, 62: 0.118125, 63: 0.118125, 71: 0.5316, 14: 8.4656, 31: 21.0656, 72: 25.0031, 61: 8.4656, 13: 21.0656,
    };
    for (const [prop, v] of Object.entries(want)) near(t.get(Number(prop)), v);
  });

  it('ignores ineligible pets (colour -1): only the centre factor remains', () => {
    near(computeGuardProps(fullState(), rowOf, () => -1).get(1), 42685 * 1.25);
  });

  it('level 1 rows (propVal 0) give nothing', () => {
    const s = emptyGuard();
    s.petData['0'] = 1;
    s.petData['1'] = 2;
    const lv1 = (lev: number, sid: number): PetGuardRow => row(sid, lev, [[6, 0], [7, 0], [59, 0], [60, 0]]);
    assert.equal(computeGuardProps(s, lv1, () => 4).size, 0);
  });

  it('a Chien Thu pet gets its own row x (1 + inner / 100) only', () => {
    const t = computeGuardSidProps(fullState(), 2, rowOf, () => 4);
    assert.equal(t.size, 4);
    near(t.get(1), 42685 * 1.5);
    near(t.get(11), 6400 * 1.5);
    near(t.get(31), 10.7 * 1.5);
    near(t.get(61), 4.3 * 1.5);
  });

  it('a Chien Thu pet ignores the centre and its own colour; sub-pets still count', () => {
    const s = fullState();
    const colour = (id: number): number => (id === s.petData['3'] || id === s.petData['0'] ? 4 : -1);
    const t = computeGuardSidProps(s, 3, rowOf, colour);
    near(t.get(4), 10685);
    near(t.get(62), 0.06, 1e-9);
  });

  it('the centre formula is not defined for slot 0, 5 or a sub slot', () => {
    for (const sid of [0, 5, 11]) assert.equal(computeGuardSidProps(fullState(), sid, rowOf, () => 4).size, 0);
  });

  it('white sub-pets add 0.0016 % each', () => {
    const s = emptyGuard();
    s.lvData['2'] = 30;
    s.petData['2'] = 1;
    for (const k of ['21', '22', '23', '24', '25']) s.petData[k] = 7;
    near(computeGuardSidProps(s, 2, rowOf, () => 0).get(1), 42685 * (1 + 0.008 / 100), 1e-6);
  });
});

describe('guard bonus units', () => {
  it('flats stay flat, fractions of 59/60/62/63 become percent points, other rates pass through', () => {
    const b = guardBonusesFromProps(new Map([[1, 100], [59, 0.118125], [62, 0.05], [14, 8.5], [72, 25], [9999, 3]]));
    assert.equal(b.flat.maxHp, 100);
    near(b.rates.finalPraDef, 11.8125, 1e-9);
    near(b.rates.finalEnhPhyHurt, 5, 1e-9);
    assert.equal(b.rates.finalDefy, 8.5);
    assert.equal(b.rates.finalBreakReborn, 25);
    assert.equal(Object.keys(b.rates).length, 4);
  });

  it('guardBonusOfSlot picks the centre or the Chien Thu formula and null for nothing', () => {
    const s = fullState();
    assert.ok(guardBonusOfSlot(s, 0, rowOf, () => 4)!.flat.maxHp! > 84000);
    near(guardBonusOfSlot(s, 2, rowOf, () => 4)!.flat.maxHp, 42685 * 1.5);
    assert.equal(guardBonusOfSlot(emptyGuard(), 1, rowOf, () => 4), null);
  });
});

describe('guard state', () => {
  it('normalises to 5 levels and 25 slots; a stored level 0 heals to 1 and levels clamp', () => {
    const s = normalizeGuard({ lvData: { 0: 0, 1: 99, 2: 7, 3: -4 }, petData: { 0: 5, 11: 6, 99: 7, 12: -1 } });
    assert.deepEqual(s.lvData, { 0: 1, 1: 30, 2: 7, 3: 1, 4: 1 });
    assert.equal(Object.keys(s.petData).length, 25);
    assert.equal(s.petData['0'], 5);
    assert.equal(s.petData['11'], 6);
    assert.equal(s.petData['12'], 0);
    assert.equal(s.petData['99'], undefined);
    assert.equal(normalizeGuard({ lvData: { 0: 9 } }).lvData['0'], 5);
  });

  it('allows slots 0..4 and the 5 sub slots of guards 1..4 only', () => {
    for (const sid of [0, 4, 11, 15, 21, 45]) assert.equal(guardSidAllowed(sid), true, String(sid));
    for (const sid of [-1, 5, 10, 16, 20, 46, 51, 1.5]) assert.equal(guardSidAllowed(sid), false, String(sid));
  });

  it('guarded ids cover every slot; slot pets only 0..4; slot lookup ignores sub-pets', () => {
    const s = emptyGuard();
    s.petData['0'] = 10;
    s.petData['3'] = 11;
    s.petData['41'] = 12;
    assert.deepEqual([...guardedPetIds(s)].sort(), [10, 11, 12]);
    assert.deepEqual(guardSlotPetIds(s), [10, 11]);
    assert.equal(guardSlotOf(s, 11), 3);
    assert.equal(guardSlotOf(s, 12), -1);
    assert.equal(guardSlotOf(s, 0), -1);
  });

  it('only class 10 pets of use level >= 50 are eligible', () => {
    assert.equal(isGuardable([10], 50), true);
    assert.equal(isGuardable([10], 49), false);
    assert.equal(isGuardable([2], 80), false);
    assert.equal(isGuardable([], 80), false);
  });
});

describe('guard upgrade costs', () => {
  it('centre costs come from the Flash table, guards from the row at the current level', () => {
    assert.deepEqual(guardUpgradeCost(0, 1, rowOf), { num: 75, gold: 7500 });
    assert.deepEqual(guardUpgradeCost(0, 4, rowOf), { num: 380, gold: 38000 });
    assert.equal(guardUpgradeCost(0, 5, rowOf), null);
    const cheap = (lev: number, sid: number): PetGuardRow | undefined => (lev === 7 && sid === 2 ? row(2, 7, [], 355, 3550) : undefined);
    assert.deepEqual(guardUpgradeCost(2, 7, cheap), { num: 355, gold: 3550 });
    assert.equal(guardUpgradeCost(2, 8, cheap), null);
  });
});
