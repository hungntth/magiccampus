// Tests of the wing stat extras: level bonus on the four lines, odd-hole feathers for the character, even-hole feathers for the pets.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { petFeatherBonuses, wingBonusOf } from './wing-stats';

const tpl = {
  main_prop1: 11, main_prop_num1: 300, main_prop2: 1, main_prop_num2: 1100, prop1: 6, prop_num1: 2300, prop2: 7, prop_num2: 2300, bind_prop_num: 6,
};
const holes = (...v: number[]): number[] => [...v, ...Array<number>(10 - v.length).fill(0)];
const feathers = new Map<number, Record<string, unknown>>([
  [3037, { kind: 14, type: 1401, color: 0, i1: 2, n1: 300 }],
  [3042, { kind: 14, type: 1403, color: 0, i1: 7, n1: 3000 }],
  [3046, { kind: 14, type: 1404, color: 0, i1: 11, n1: 5 }],
  [3041, { kind: 14, type: 1402, color: 0, i1: 6, n1: 3 }],
  [3044, { kind: 14, type: 1403, color: 0, i1: 9, n1: 120 }],
]);

test('level 10 adds 99 % of each line (mains after the star), none at level 0', () => {
  const none = wingBonusOf({ tpl, wing: { level: 0 } }, feathers);
  assert.deepEqual(none.flat, {});
  const b = wingBonusOf({ tpl, star: 10, wing: { level: 10 } }, feathers);
  // speed (11): floor(floor(300 x 2.6) x 0.99) = 772 ; hp (1): floor(floor(1100 x 2.6) x 0.99) = 2831 ; def (6): 2277 ; mdef (7): 2277
  assert.equal(b.flat.speed, Math.floor(Math.floor(300 * 2.6) * 0.99));
  assert.equal(b.flat.maxHp, Math.floor(Math.floor(1100 * 2.6) * 0.99));
  assert.equal(b.flat.defense, Math.floor(2300 * 0.99));
  assert.equal(b.flat.magicDefense, Math.floor(2300 * 0.99));
});

test('instance lines replace the template lines in the level bonus', () => {
  const b = wingBonusOf({ tpl, props: { mainProp1: 11, mainPropNum1: 1000 }, wing: { level: 1 } }, feathers);
  assert.equal(b.flat.speed, Math.floor(1000 * 0.03));
});

test('odd holes (character) take their feathers: flat stat, rate points for status feathers', () => {
  // slots 1, 3, 5 = indexes 0, 2, 4 ; slot 2 (pet) is ignored here
  const b = wingBonusOf({ tpl, wing: { holes: holes(3037, 3041, 3042, 3046, 3044) } }, feathers);
  assert.equal(b.flat.magicAttack, 300);
  assert.equal(b.flat.maxHp, 3000);
  assert.equal(b.flat.speed, 120);
  assert.equal(b.rates.finalResiCritical, undefined, 'slot 2 holds the pet feather');
  assert.equal(b.rates.finalConfusion, undefined, 'slot 4 holds the pet feather');
});

test('even holes (pet) feed the pets only', () => {
  const raw = { holes: holes(3037, 3041, 3042, 3046, 3044) };
  const b = petFeatherBonuses(raw, feathers);
  assert.equal(b.rates.finalResiCritical, 3);
  assert.equal(b.rates.finalConfusion, 5);
  assert.equal(b.flat.magicAttack, undefined);
  assert.equal(b.flat.maxHp, undefined);
});

test('a new wing has all holes open and empty: no feather bonuses', () => {
  assert.deepEqual(wingBonusOf({ tpl, wing: undefined }, feathers).flat, {});
  assert.deepEqual(petFeatherBonuses(undefined, feathers).rates, {});
});
