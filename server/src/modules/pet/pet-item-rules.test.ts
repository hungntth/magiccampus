// Tests of the pet item rules: grow potion gain under the owner cap, lifespan roll / cap, aptitude fruit pick.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PetLimits, petExpOfLevel } from '@mc/shared';
import { growGain, lifeAfter, pickAptitudeRaise, rollLife } from './pet-item-rules';

test('grow gain is the full amount while the room allows', () => {
  assert.deepEqual(growGain(961, 0, 40), { gain: 30000, units: 1 });
  assert.deepEqual(growGain(961, 0, 40, 3), { gain: 90000, units: 3 });
});

test('grow gain is clamped to the start of owner level + 5 and rounds the units up', () => {
  const cap = petExpOfLevel(15);
  const r = growGain(961, cap - 10, 10); // owner 10 -> cap level 15
  assert.deepEqual(r, { gain: 10, units: 1 });
  const batch = growGain(961, cap - 70000, 10, 5); // room 70000 = 2.33 units
  assert.deepEqual(batch, { gain: 70000, units: 3 });
});

test('a pet at the cap, bad ids and counts gain nothing', () => {
  assert.deepEqual(growGain(961, petExpOfLevel(15), 10), { gain: 0, units: 0 });
  assert.deepEqual(growGain(5, 0, 10), { gain: 0, units: 0 });
  assert.deepEqual(growGain(961, 0, 10, 0), { gain: 0, units: 0 });
});

test('life roll is inclusive and the cap limits the gain', () => {
  assert.equal(rollLife(500, 2000, () => 0), 500);
  assert.equal(rollLife(500, 2000, () => 0.999999), 2000);
  assert.equal(rollLife(10000, 10000, () => 0.5), 10000);
  assert.deepEqual(lifeAfter(9500, 1000), { life: PetLimits.maxLife, gained: 500 });
  assert.deepEqual(lifeAfter(100, 500), { life: 600, gained: 500 });
  assert.deepEqual(lifeAfter(PetLimits.maxLife, 500), { life: PetLimits.maxLife, gained: 0 });
});

const tpl = { str: 1000, agi: 1000, sta: 1000, int: 1000, eng: 1000 };

test('aptitude fruit raises the lowest unrefined aptitude, ties to the lower index', () => {
  const r = pickAptitudeRaise(tpl, { ...tpl }, {});
  assert.deepEqual(r && [r.key, r.before, r.after], ['strength', 1000, 1001]);
  const lower = pickAptitudeRaise(tpl, { ...tpl, int: 900 }, { intelligence: 900 });
  assert.deepEqual(lower && [lower.key, lower.after], ['intelligence', 901]);
});

test('a never-refined aptitude below the template starts from the template', () => {
  const r = pickAptitudeRaise(tpl, { ...tpl, agi: 500 }, {}); // stored 500 but unrefined: starts at 1000
  assert.equal(r?.key, 'strength');
  assert.equal(r?.after, 1001);
});

test('aptitudes at the cap (1.2 x template) are skipped; all capped returns null', () => {
  const capped = { str: 1200, agi: 1200, sta: 1200, int: 1200, eng: 1200 };
  const refined = { strength: 1200, agility: 1200, stamina: 1200, intelligence: 1200, energy: 1200 };
  assert.equal(pickAptitudeRaise(tpl, capped, refined), null);
  const one = pickAptitudeRaise(tpl, { ...capped, sta: 1100 }, refined);
  assert.deepEqual(one && [one.key, one.before, one.after], ['stamina', 1100, 1101]);
  assert.equal(pickAptitudeRaise({ str: 0, agi: 0, sta: 0, int: 0, eng: 0 }, capped, {}), null);
});
