// Magic crystal rules: activate / level up / add power / recover outcomes and the stat aggregation.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { emptyCrystals, type CrystalSlot } from '@mc/shared';
import { parseCrystals } from './feature-state';
import { activate, addPower, crystalBonuses, levelUp, recover } from './crystal-rules';

const off: CrystalSlot = { a: 0, max: 0, l: 0, s: 0, lv: 0 };
const on = (over: Partial<CrystalSlot> = {}): CrystalSlot => ({ a: 1, max: 100, l: 0, s: 0, lv: 0, ...over });

describe('activate', () => {
  it('costs the slot dust and starts a level 0 pool of 100', () => {
    const r = activate(9, off);
    assert.deepEqual(r.ok && r.change, { slot: on(), spend: { magiccystalrec: 12 } });
    assert.equal(activate(0, on()).ok, false);
    assert.equal(activate(16, off).ok, false);
  });
});

describe('levelUp', () => {
  it('needs an active pool below level 9 and raises the cap', () => {
    assert.equal(levelUp(0, off).ok, false);
    const r = levelUp(0, on({ lv: 2, max: 300, l: 50 }));
    assert.deepEqual(r.ok && r.change, { slot: on({ lv: 3, max: 400, l: 50 }), spend: { magiccystalrec: 40 } });
    assert.equal(levelUp(0, on({ lv: 9, max: 1000 })).ok, false);
  });
});

describe('addPower', () => {
  it('fills l for pointType 1 and s for 2 until the pool is full', () => {
    const a = addPower(0, on(), 30, '1');
    assert.deepEqual(a.ok && a.change, { slot: on({ l: 30 }), spend: { magiccystalpre: 30 } });
    const b = addPower(0, on({ l: 30 }), 70, '2');
    assert.deepEqual(b.ok && b.change, { slot: on({ l: 30, s: 70 }), spend: { magiccystallimit: 70 } });
    assert.equal(addPower(0, on({ l: 30, s: 70 }), 1, '1').ok, false); // full
    assert.equal(addPower(0, on({ l: 30 }), 71, '1').ok, false); // would overflow
  });
  it('validates amount, type and activation', () => {
    assert.equal(addPower(0, on(), 0, '1').ok, false);
    assert.equal(addPower(0, on(), 10_001, '1').ok, false);
    assert.equal(addPower(0, on(), 5, '3').ok, false);
    assert.equal(addPower(0, off, 5, '1').ok, false);
    assert.equal(addPower(0, on(), 1.5, '1').ok, false);
  });
});

describe('recover', () => {
  it('refunds l and s for one dust and empties the pool', () => {
    const r = recover(0, on({ l: 20, s: 5 }));
    assert.deepEqual(r.ok && r.change, {
      slot: on(), spend: { magiccystalrec: 1, magiccystalpre: -20, magiccystallimit: -5 },
    });
    assert.equal(recover(0, on()).ok, false); // empty
    assert.equal(recover(0, off).ok, false);
  });
});

describe('crystalBonuses', () => {
  it('scales V by the fill of each active pool and maps the slot prop', () => {
    const data = emptyCrystals();
    data['0'] = on({ lv: 1, max: 200, l: 100, s: 0 }); // HP: 24000 * 100 / 200
    data['8'] = on({ lv: 0, max: 100, l: 50, s: 50 }); // resi-crit: 1.2 full
    data['13'] = on({ l: 100 }); // type 32: no H5 key, ignored
    data['2'] = { a: 0, max: 0, l: 0, s: 0, lv: 0 }; // inactive
    const b = crystalBonuses(data);
    assert.equal(b.flat.maxHp, 12000);
    assert.equal(b.rates.finalResiCritical, 1.2);
    assert.equal(b.flat.attack, undefined);
    assert.deepEqual(Object.keys(b.rates), ['finalResiCritical']);
  });
  it('parseCrystals pads to 16 pools and clamps junk', () => {
    const d = parseCrystals({ crystals: { '0': { a: 1, max: 100, l: 5, s: 'x', lv: 99 } } });
    assert.equal(Object.keys(d).length, 16);
    assert.deepEqual(d['0'], { a: 1, max: 100, l: 5, s: 0, lv: 9 });
  });
});
