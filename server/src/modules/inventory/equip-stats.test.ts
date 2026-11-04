// Unit tests for equipBonuses (prop 21 -> stamina, bind_prop_num) and the equip gates.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classAllowed, equipBonuses, equipPosition } from './equip-stats';

describe('equipBonuses', () => {
  it('maps prop 21 to stamina and adds bind_prop_num to each main line', () => {
    const b = equipBonuses([
      { main_prop1: 21, main_prop_num1: 4, main_prop2: 1, main_prop_num2: 30, bind_prop_num: 2 },
    ]);
    assert.equal(b.attr.sta, 4 + 2);
    assert.equal(b.attr.agi, 0);
    assert.equal(b.flat.maxHp, 30 + 2);
  });

  it('reads prop1/2 lines, percent props 24/25 and ignores unknown ids', () => {
    const b = equipBonuses([
      { prop1: 24, prop_num1: 5, prop2: 99, prop_num2: 100 },
      { main_prop1: 4, main_prop_num1: 12, bind_prop_num: 0 },
    ]);
    assert.deepEqual(b.pct, { maxHp: 5 });
    assert.equal(b.flat.attack, 12);
    assert.equal(Object.keys(b.flat).length, 1);
  });

  it('skips lines without a prop id', () => {
    const b = equipBonuses([{ main_prop1: 0, main_prop_num1: 50, bind_prop_num: 3 }, {}]);
    assert.deepEqual(b.flat, {});
    assert.equal(b.attr.str, 0);
  });
});

describe('equip gates', () => {
  it('class list parsing', () => {
    assert.equal(classAllowed('|1|3|', 3), true);
    assert.equal(classAllowed('|1|3|', 2), false);
    assert.equal(classAllowed('all', 5), true);
    assert.equal(classAllowed(0, 5), true);
  });

  it('position 1..22 only (pet equipment 50..57 rejected)', () => {
    assert.equal(equipPosition({ position: 3 }), 3);
    assert.equal(equipPosition({ position: 22 }), 22);
    assert.equal(equipPosition({ position: 50 }), null);
    assert.equal(equipPosition({ position: 0 }), null);
    assert.equal(equipPosition(undefined), null);
  });
});
