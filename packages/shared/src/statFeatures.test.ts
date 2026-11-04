// Tests for the stat-feature helpers: war sprite value scaling, prop line text and the magic crystal catalog numbers.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  crystalActivateCost, crystalCurrentValue, crystalFullValue, crystalLevelUpCost, crystalMaxAt, crystalStatType, emptyCrystals,
  propLineText, wspStatValue, wspValueText,
} from './statFeatures.js';

describe('propLineText', () => {
  it('uses the Flash labels and a % suffix only for 62/63', () => {
    assert.equal(propLineText({ t: 1, v: 231 }), 'HP+231');
    assert.equal(propLineText({ t: 62, v: 1.5 }), 'Tăng STVL Cuối+1.5%');
  });
});

describe('war sprite scaling', () => {
  it('divides 13/14/31/61 by 10000 and 59/60/62/63 by 100, rest raw', () => {
    assert.equal(wspStatValue(61, 2500), 0.25);
    assert.equal(wspStatValue(62, 50), 0.5);
    assert.equal(wspStatValue(4, 38), 38);
    assert.equal(wspValueText(59, 2), '+0.02%');
    assert.equal(wspValueText(13, 100), '+0.01');
  });
});

describe('magic crystal catalog', () => {
  it('matches the transcribed client tables', () => {
    assert.equal(crystalMaxAt(0), 100);
    assert.equal(crystalMaxAt(9), 1000);
    assert.equal(crystalStatType(0), 1);
    assert.equal(crystalStatType(15), 72);
    assert.equal(crystalActivateCost(0), 10);
    assert.equal(crystalActivateCost(7), 8);
    assert.equal(crystalActivateCost(9), 12);
    assert.equal(crystalActivateCost(16), null);
    assert.equal(crystalLevelUpCost(0, 0), 20);
    assert.equal(crystalLevelUpCost(0, 9), 0);
    assert.equal(crystalLevelUpCost(7, 5), 52);
    assert.equal(crystalLevelUpCost(9, 7), 88);
    assert.equal(crystalLevelUpCost(0, 10), null);
    assert.equal(crystalFullValue(0, 0), 12000);
    assert.equal(crystalFullValue(0, 9), 120000);
    assert.equal(crystalFullValue(8, 4), 6);
    assert.equal(crystalFullValue(9, 1), 1);
  });

  it('scales the current value by the fill and ignores inactive pools', () => {
    assert.equal(crystalCurrentValue(0, { a: 1, max: 100, l: 25, s: 25, lv: 0 }), 6000);
    assert.equal(crystalCurrentValue(0, { a: 1, max: 100, l: 500, s: 0, lv: 0 }), 12000);
    assert.equal(crystalCurrentValue(0, { a: 0, max: 0, l: 0, s: 0, lv: 0 }), 0);
    assert.equal(Object.keys(emptyCrystals()).length, 16);
  });
});
