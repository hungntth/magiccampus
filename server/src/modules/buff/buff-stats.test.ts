// Unit tests for buffBonuses with the two sample buffs from the research (id 3 flat, id 231 percent).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buffBonuses } from './buff-stats';

describe('buffBonuses', () => {
  it('flat buff: counter rate and defense', () => {
    const b = buffBonuses([{ percent_flag: 0, prop1: 10, prop_num1: 888, prop2: 6, prop_num2: 888 }]);
    assert.equal(b.rates.finalCounter, 888);
    assert.equal(b.flat.defense, 888);
    assert.deepEqual(b.pct, {});
  });

  it('percent buff: +4 % magic attack', () => {
    const b = buffBonuses([{ percent_flag: 1, prop1: 5, prop_num1: 4 }]);
    assert.deepEqual(b.pct, { magicAttack: 4 });
    assert.deepEqual(b.flat, {});
  });

  it('ignores empty slots and unknown props; stacks several buffs', () => {
    const b = buffBonuses([
      { percent_flag: -1, prop1: 0, prop_num1: 5, prop2: 999, prop_num2: 5 },
      { percent_flag: 0, prop1: 4, prop_num1: 10 },
      { percent_flag: 0, prop1: 4, prop_num1: 5 },
    ]);
    assert.equal(b.flat.attack, 15);
    assert.equal(Object.keys(b.rates).length, 0);
  });
});
