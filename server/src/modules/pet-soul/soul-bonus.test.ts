// Unit coverage for the pet ring bonus mapping (Go pet_soul.go): flats, float props, 61 / 100, status keys.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { PetSoulTemplate } from '@mc/shared';
import { soulBonuses } from './soul-bonus';

const tpl = (id: number, propType: number, propValue: number): PetSoulTemplate => ({
  id, family: `f${id}`, level: 1, color: 0, type: -1, exp: 0, upExp: 0, chip: 0, reqChip: 0, propType, propValue, iconCode: '0',
});
const table = new Map([
  [1, tpl(1, 1, 2000)], [2, tpl(2, 4, 500)], [3, tpl(3, 61, 50)], [4, tpl(4, 45, 2)], [5, tpl(5, 52, 4)], [6, tpl(6, 70, 1.5)],
  [7, tpl(7, 43, 2)], [8, tpl(8, 99, 9)], [9, tpl(9, 31, 3)], [10, tpl(10, 10, 1)], [11, tpl(11, 34, 0.5)],
]);

test('flat gems add prop_val to the stat, units untouched', () => {
  const b = soulBonuses([{ sid: 1 }, { sid: 2 }], (id) => table.get(id));
  assert.equal(b.flat.maxHp, 2000);
  assert.equal(b.flat.attack, 500);
});

test('prop 61 is stored x100; status gems land on their hit / resist rate keys', () => {
  const b = soulBonuses([{ sid: 3 }, { sid: 4 }, { sid: 5 }, { sid: 6 }, { sid: 7 }, { sid: 9 }, { sid: 10 }, { sid: 11 }], (id) => table.get(id));
  assert.equal(b.rates.finalResiDefy, 0.5);
  assert.equal(b.rates.finalSleep, 2, '45 is "Hon me tang" (hit), not the resist slot');
  assert.equal(b.rates.finalConfusion, 4);
  assert.equal(b.rates.finalDebuffResiRate, 1.5);
  assert.equal(b.rates.finalResiDizzy, 2);
  assert.equal(b.rates.finalResiCritical, 3);
  assert.equal(b.rates.finalCounter, 1);
  assert.equal(b.rates.finalRebornRate, 0.5);
});

test('unknown rows, unmapped props and empty slots add nothing; two gems of one stat add up', () => {
  const b = soulBonuses([{ sid: 8 }, { sid: 404 }, null, undefined, { sid: 1 }, { sid: 1 }], (id) => table.get(id));
  assert.deepEqual(b.rates, {});
  assert.equal(b.flat.maxHp, 4000);
});
