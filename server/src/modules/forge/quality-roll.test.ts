// Unit tests for quality-roll.ts: main-line multipliers, bind roll, hole distribution, element and the instance shape.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rollCraftedProperties, rollElement, rollHoles, rollLineValue } from './quality-roll';

const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

describe('rollLineValue', () => {
  it('rolls between floor(base * M[q-1]) and floor(base * M[q])', () => {
    // q = 6: M[5] = 1.25, M[6] = 1.3 -> 76 * 1.25 = 95, 76 * 1.3 = 98
    assert.equal(rollLineValue(76, 6, seq(0)), 95);
    assert.equal(rollLineValue(76, 6, seq(0.999)), 98);
  });
  it('caps the table index at 20', () => {
    assert.equal(rollLineValue(10, 25, seq(0.5)), 35);
  });
});

describe('rollHoles / rollElement', () => {
  it('40 / 35 / 25 percent for 1 / 2 / 3 holes', () => {
    assert.equal(rollHoles(seq(0)), 1);
    assert.equal(rollHoles(seq(0.399)), 1);
    assert.equal(rollHoles(seq(0.4)), 2);
    assert.equal(rollHoles(seq(0.749)), 2);
    assert.equal(rollHoles(seq(0.75)), 3);
    assert.equal(rollHoles(seq(0.999)), 3);
  });
  it('element is 1..6', () => {
    assert.equal(rollElement(seq(0)), 1);
    assert.equal(rollElement(seq(0.999)), 6);
  });
});

describe('rollCraftedProperties', () => {
  const tpl = { main_prop1: 4, main_prop_num1: 76, main_prop2: 5, main_prop_num2: 40, prop1: 0, bind_prop_num: 5 };

  it('builds quality, maker, element, lines, bind rolls and drilled holes', () => {
    // draw order: element, main shuffle (one swap draw), main1 value, main2 value, sub shuffle (none), bind1, bind2, holes
    const p = rollCraftedProperties(tpl, 6, 1, 'Hero', seq(0.5, 0.99, 0, 0, 0, 0.999, 0.5));
    assert.equal(p.quality, 6);
    assert.equal(p.prefix, 1);
    assert.equal(p.makerName, 'Hero');
    assert.equal(p.element, 4);
    assert.equal(p.mainProp1, 4); // swap index floor(0.99 * 2) = 1 keeps the order
    assert.equal(p.mainPropNum1, 95);
    assert.equal(p.mainProp2, 5);
    assert.equal(p.mainPropNum2, 50); // floor(40 * 1.25)
    assert.equal(p.bindMainPropNum1, 0);
    assert.equal(p.bindMainPropNum2, 6); // randInt(0, floor(5 * M[6] = 6.5)) at 0.999
    assert.equal(p.holeNum, 2);
    assert.equal(p.t1, 0);
    assert.equal(p.t2, 0);
    assert.equal(p.t3, undefined);
    assert.equal(p.prop1, undefined);
  });

  it('can swap the two main lines', () => {
    const p = rollCraftedProperties(tpl, 6, 1, 'Hero', seq(0.5, 0, 0, 0, 0, 0, 0));
    assert.equal(p.mainProp1, 5);
    assert.equal(p.mainProp2, 4);
  });
});
