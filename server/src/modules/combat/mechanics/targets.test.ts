// Unit tests for skill targeting: Go grid patterns (V / H / C / M / R), living fill, dead pick fallback, front line.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { frontlineTarget, resolveTargets } from './targets';
import { board, mk, seq } from './test-kit';

const slots = (fs: { slot: number }[]): number[] => fs.map((f) => f.slot);

describe('resolveTargets', () => {
  const caster = mk(10, 'player');
  it('horizontal: centre, then left / right outwards on the row (slot 0 is x2; 2 is x1, 1 is x3)', () => {
    const b = board(caster, mk(0, 'enemy'), mk(1, 'enemy'), mk(2, 'enemy'), mk(3, 'enemy'), mk(4, 'enemy'));
    assert.deepEqual(slots(resolveTargets(b, caster, 0, 'enemy', 'H', 3, seq([]))), [0, 2, 1]);
    assert.deepEqual(slots(resolveTargets(b, caster, 0, 'enemy', 'H', 5, seq([]))), [0, 2, 1, 4, 3]);
  });
  it('a dead neighbour does not use up the count', () => {
    const b = board(caster, mk(0, 'enemy'), mk(1, 'enemy'), mk(2, 'enemy', { alive: false }), mk(4, 'enemy'));
    assert.deepEqual(slots(resolveTargets(b, caster, 0, 'enemy', 'H', 3, seq([]))), [0, 1, 4]);
  });
  it('vertical: the pet row behind / in front; cross adds left and right', () => {
    const b = board(caster, mk(0, 'enemy'), mk(5, 'enemy'), mk(2, 'enemy'), mk(1, 'enemy'));
    assert.deepEqual(slots(resolveTargets(b, caster, 0, 'enemy', 'V', 2, seq([]))), [5, 0]);
    assert.deepEqual(slots(resolveTargets(b, caster, 0, 'enemy', 'C', 4, seq([]))), [5, 2, 1, 0]);
  });
  it('multi: the centre plus the nearest positions', () => {
    const b = board(caster, mk(0, 'enemy'), mk(3, 'enemy'), mk(1, 'enemy'), mk(9, 'enemy'));
    assert.deepEqual(slots(resolveTargets(b, caster, 1, 'enemy', 'M', 3, seq([]))), [1, 0, 3]);
  });
  it('a dead pick moves to the lowest matching position; self kinds return the caster', () => {
    const b = board(caster, mk(0, 'enemy', { alive: false }), mk(3, 'enemy'), mk(2, 'enemy'));
    assert.deepEqual(slots(resolveTargets(b, caster, 0, 'enemy', '', 1, seq([]))), [2]);
    assert.deepEqual(slots(resolveTargets(b, mk(3, 'enemy'), 10, 'self', '', 1, seq([]))), [3]);
    assert.deepEqual(slots(resolveTargets(b, b.get(3)!, 10, 'team', 'M', 2, seq([]))), [2, 3]);
  });
});

describe('frontlineTarget', () => {
  it('Go rows over the Flash slots: no side has a front row (10-14 and 0-4 are back rows), so the pick is random', () => {
    const b = board(mk(10, 'player'), mk(15, 'player', { kind: 'pet' }));
    assert.equal(frontlineTarget(b.values(), 'player', () => 0)?.slot, 10);
    assert.equal(frontlineTarget(b.values(), 'player', () => 0.99)?.slot, 15);
    b.get(10)!.alive = false;
    assert.equal(frontlineTarget(b.values(), 'player', () => 0)?.slot, 15);
  });
});
