// M12 pet training pure rules: join table, growth roll bands, star success indexing, xsd range.
import test from 'node:test';
import assert from 'node:assert/strict';
import { petGrowColor } from './pet.js';
import {
  PET_JOIN_SUCCESS, petGrowBandMax, petGrowRoll, petStarRate, petXsdRange, roundGrow,
} from './petGrowth.js';

test('join success is indexed by the main pet colour: white 100, green 80, blue 50, purple 30', () => {
  assert.deepEqual([0, 1, 2, 3].map((c) => PET_JOIN_SUCCESS[c]), [100, 80, 50, 30]);
  assert.equal(PET_JOIN_SUCCESS[4], undefined); // orange cannot fuse
});

test('growth roll covers the band of the colour in 0.01 steps (lowest and highest rng)', () => {
  const lo = () => 0;
  const hi = () => 0.999999;
  assert.equal(petGrowRoll(1, lo), 1.2);
  assert.equal(petGrowRoll(1, hi), 1.3);
  assert.equal(petGrowRoll(2, lo), 1.31);
  assert.equal(petGrowRoll(2, hi), 1.6);
  assert.equal(petGrowRoll(3, lo), 1.61);
  assert.equal(petGrowRoll(3, hi), 2);
  assert.equal(petGrowRoll(4, lo), 2.01);
  assert.equal(petGrowRoll(4, hi), 2.5);
  assert.equal(petGrowRoll(0, lo), 1.2); // clamped to green
  assert.equal(petGrowRoll(9, hi), 2.5); // clamped to orange
});

test('every rolled value falls into the band it was rolled for', () => {
  for (let color = 1; color <= 4; color++) {
    for (let i = 0; i < 200; i++) assert.equal(petGrowColor(petGrowRoll(color, () => i / 200)), color);
  }
});

test('the band maximum is the PET_GROWRATE_BANDS edge of the current colour', () => {
  assert.equal(petGrowBandMax(1.25), 1.3);
  assert.equal(petGrowBandMax(1.3), 1.3);
  assert.equal(petGrowBandMax(1.31), 1.6);
  assert.equal(petGrowBandMax(2.2), 2.5);
});

test('star success is read at upgradeNum + 1 (the Flash index)', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(petStarRate), [100, 100, 90, 80, 70, 60, 50, 30, 30, 30, 30, 20]);
});

test('xsd range and growth rounding', () => {
  assert.deepEqual(petXsdRange(1900), [1520, 2280]);
  assert.deepEqual(petXsdRange(1501), [1201, 1801]);
  assert.equal(roundGrow(0.13 * 12 + 0.1 * 4), 1.96);
});
