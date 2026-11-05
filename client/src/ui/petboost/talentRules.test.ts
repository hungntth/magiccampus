// Tests for the Thiên Phú window rules (run from server/: node --test --import tsx ../client/src/ui/petboost/talentRules.test.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PetTalentData } from '@mc/shared';
import { applyBagDelta, applyStonePush, bagCells, goldCostOf, nextSlotDef, slotLevel, socketGate, socketOpen, stonePower, trayAdd, trayPrune } from './talentRules';

const empty = (): PetTalentData => ({ tal: {}, inTal: {}, b: {} });

test('bag delta: add, partial left, gone, and a swap in one delta', () => {
  const bag = { '1': { t: 265, n: 5 }, '2': { t: 266, n: 1 } };
  const out = applyBagDelta(bag, { a: { '3': { tid: 265, ln: 2 } }, d: { '1': { ln: 3 }, '2': { ln: 0 } } });
  assert.deepEqual(out, { '1': { t: 265, n: 3 }, '3': { t: 265, n: 2 } });
  assert.deepEqual(bag, { '1': { t: 265, n: 5 }, '2': { t: 266, n: 1 } }, 'input is not mutated');
});

test('stone push: fills and clears sockets and merges its bag delta', () => {
  const data: PetTalentData = { tal: {}, inTal: { '10011': 266 }, b: { '1': { t: 265, n: 1 } } };
  const filled = applyStonePush(data, { bag: { a: {}, d: { '1': { ln: 0 } } }, pan: { a: { '20011': { tid: 265 } }, d: { '10011': 1 } } });
  assert.deepEqual(filled.inTal, { '20011': 265 });
  assert.deepEqual(filled.b, {});
});

test('slot level, socket open / gate, next row and gold cost', () => {
  const data = empty();
  assert.equal(slotLevel(data, 10001), 0);
  data.tal['10001'] = 2; // record id 2 = sid 10001 level 1
  assert.equal(slotLevel(data, 10001), 1);
  assert.equal(socketOpen(data, 10010), false);
  assert.deepEqual(socketGate(data, 10010), { have: 1, need: 20 });
  assert.deepEqual(socketGate(data, 10011), { have: 1, need: 35 });
  assert.equal(nextSlotDef(10001, 1)?.lv, 2);
  assert.equal(nextSlotDef(10001, 5), undefined);
  assert.equal(goldCostOf(480), 33);
});

test('stone power sums p of inlaid stones', () => {
  const data = empty();
  data.inTal['10011'] = 265; // p = 1
  data.inTal['20011'] = 265;
  assert.deepEqual(stonePower(data), { power: 2, rate: 0 });
});

test('bag cells page 0 starts at slot 1; tray add / prune', () => {
  const bag = { '1': { t: 265, n: 2 }, '5': { t: 265, n: 1 } };
  const cells = bagCells(bag, 0);
  assert.equal(cells.length, 40);
  assert.equal(cells[0]?.slot, 1);
  assert.equal(cells[4]?.entry?.n, 1);
  let r = trayAdd(bag, [], 1, 5);
  assert.ok('tray' in r);
  if ('tray' in r) r = trayAdd(bag, [...r.tray, ...r.tray], 1, 5);
  assert.ok('error' in r, 'a stack of 2 cannot be used 3 times');
  assert.ok('error' in trayAdd(bag, [], 7, 5), 'empty slot');
  assert.deepEqual(trayPrune({ '1': { t: 265, n: 1 } }, [{ slot: 1, tid: 265 }, { slot: 1, tid: 265 }]), [{ slot: 1, tid: 265 }]);
});
