// Pet exp -> level and attribute points (cumulative exp table copied from Flash GamePredef PET_LEVEL_EXP).

import test from 'node:test';
import assert from 'node:assert/strict';
import { PET_LEVEL_EXP, petExpOfLevel, petGrowColor, petLevelOfExp } from '@mc/shared';
import { applyPetExp } from './pet-level';

test('table has 160 cumulative rows starting 1, 37, 179', () => {
  assert.equal(PET_LEVEL_EXP.length, 160);
  assert.deepEqual(PET_LEVEL_EXP.slice(0, 3), [1, 37, 179]);
  assert.equal(PET_LEVEL_EXP[159], 94838109102);
  for (let i = 1; i < PET_LEVEL_EXP.length; i++) assert.ok(PET_LEVEL_EXP[i] > PET_LEVEL_EXP[i - 1]);
});

test('petLevelOfExp matches the Flash expToLv boundaries', () => {
  assert.equal(petLevelOfExp(0), 1);
  assert.equal(petLevelOfExp(1), 1);
  assert.equal(petLevelOfExp(36), 1);
  assert.equal(petLevelOfExp(37), 2);
  assert.equal(petLevelOfExp(178), 2);
  assert.equal(petLevelOfExp(179), 3);
  assert.equal(petLevelOfExp(94838109102), 160);
  assert.equal(petLevelOfExp(Number.MAX_SAFE_INTEGER), 160);
});

test('petExpOfLevel is the threshold that starts a level', () => {
  assert.equal(petExpOfLevel(0), 0);
  assert.equal(petExpOfLevel(1), 1);
  assert.equal(petExpOfLevel(2), 37);
  assert.equal(petExpOfLevel(160), 94838109102);
});

test('applyPetExp gives +5 points per level gained', () => {
  assert.deepEqual(applyPetExp(1, 1, 10), { exp: 11, level: 1, levelsGained: 0, pointsGained: 0 });
  assert.deepEqual(applyPetExp(1, 1, 36), { exp: 37, level: 2, levelsGained: 1, pointsGained: 5 });
  assert.deepEqual(applyPetExp(1, 1, 178), { exp: 179, level: 3, levelsGained: 2, pointsGained: 10 });
});

test('applyPetExp ignores bad gains and clamps at the cap', () => {
  assert.equal(applyPetExp(100, 2, -5).exp, 100);
  assert.equal(applyPetExp(100, 2, Number.NaN).exp, 100);
  const top = applyPetExp(94838109000, 159, 1e12);
  assert.equal(top.level, 160);
  assert.equal(top.exp, 94838109102);
  assert.equal(applyPetExp(94838109102, 160, 50).levelsGained, 0);
});

test('growth colour bands follow Flash colorByGrowRate', () => {
  assert.equal(petGrowColor(0.8), 0);
  assert.equal(petGrowColor(1.1), 0);
  assert.equal(petGrowColor(1.2), 1);
  assert.equal(petGrowColor(1.6), 2);
  assert.equal(petGrowColor(2.5), 4);
  assert.equal(petGrowColor(9), 4);
});
