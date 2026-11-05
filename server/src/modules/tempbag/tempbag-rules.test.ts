// Unit tests for the pure Túi Tiện Dụng rules: capacity, holder replacement, put / move / sort / direct planners.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canReplaceHolder, capacityOf, holderExpiry, isRewardTemp, planBetween, planDirect, planPut, planSortTemp, sectionOf, type TempRow,
} from './tempbag-rules';

const NOW = 1_000_000;
const row = (id: number, pos: number, templateId: number, count: number, extra: Partial<TempRow> = {}): TempRow => ({
  id, pos, templateId, itemType: 1, isBound: false, colorCode: 0, stackCount: count, maxStack: 99, ...extra,
});
const inc = (templateId: number, count: number) => ({ templateId, itemType: 1, isBound: false, colorCode: 0, stackCount: count, maxStack: 99 });

test('capacity: only opened, non-expired holders count; Ma Tâm base 12; VIP bonus only on the normal bag', () => {
  const sec = sectionOf({
    opened: 2,
    holders: { '1': { tid: 2831, num: 4, exp: 0 }, '2': { tid: 2833, num: 8, exp: NOW - 1 }, '3': { tid: 2835, num: 30, exp: 0 } },
  });
  assert.equal(capacityOf(false, sec, 0, NOW), 4); // holder 2 expired, holder 3 not opened
  assert.equal(capacityOf(false, sec, 6, NOW), 10); // VIP right 5
  assert.equal(capacityOf(true, sec, 6, NOW), 16); // Ma Tâm: base 12 + 4, no VIP bonus
  assert.equal(capacityOf(false, sectionOf(undefined), 0, NOW), 0);
  assert.equal(capacityOf(true, sectionOf(undefined), 0, NOW), 12);
  assert.equal(capacityOf(false, sectionOf({ opened: 5, holders: { '1': { tid: 1, num: 999, exp: 0 } } }), 0, NOW), 500);
});

test('sectionOf clamps the opened count', () => {
  assert.equal(sectionOf({ opened: 9 }).opened, 5);
  assert.equal(sectionOf({ opened: -3 }).opened, 0);
});

test('holder replacement: more slots, or equal slots over a timed holder', () => {
  assert.equal(canReplaceHolder(undefined, 4), true);
  assert.equal(canReplaceHolder({ num: 8, exp: 0 }, 6), false);
  assert.equal(canReplaceHolder({ num: 8, exp: 0 }, 8), false);
  assert.equal(canReplaceHolder({ num: 8, exp: 5 }, 8), true);
  assert.equal(canReplaceHolder({ num: 8, exp: 0 }, 9), true);
  assert.equal(holderExpiry(43200, NOW), NOW + 43200 * 60_000);
  assert.equal(holderExpiry(-1, NOW), 0);
});

test('planPut: empty slot moves, same stack merges, other item refused, capacity respected', () => {
  const rows = [row(1, 1, 10, 5), row(2, 2, 11, 3)];
  assert.deepEqual(planPut(rows, 4, 3, inc(10, 2)), { kind: 'move', pos: 3 });
  assert.deepEqual(planPut(rows, 4, 1, inc(10, 2)), { kind: 'merge', destId: 1, pos: 1 });
  assert.equal(planPut(rows, 4, 2, inc(10, 2)).kind, 'error');
  assert.equal(planPut(rows, 4, 1, inc(10, 98)).kind, 'error'); // 98 + 5 > 99
  assert.equal(planPut(rows, 4, 5, inc(10, 1)).kind, 'error'); // beyond capacity
  assert.equal(planPut(rows, 2, 3, inc(12, 1)).kind, 'error'); // posId 3 is beyond capacity 2
  // equipment never merges
  const eq = { ...inc(10, 1), itemType: 2 };
  assert.equal(planPut([row(1, 1, 10, 1, { itemType: 2 })], 4, 1, eq).kind, 'error');
});

test('planPut: full bag refuses a new slot even when the posId is free', () => {
  const rows = [row(1, 1, 10, 1), row(2, 3, 11, 1)];
  assert.equal(planPut(rows, 2, 2, inc(12, 1)).kind, 'error');
});

test('planBetween: move, merge, swap, missing source, over capacity', () => {
  const rows = [row(1, 1, 10, 5), row(2, 2, 11, 3), row(3, 3, 10, 4)];
  assert.deepEqual(planBetween(rows, 6, 1, 5), { kind: 'move', id: 1, from: 1, to: 5 });
  assert.deepEqual(planBetween(rows, 6, 1, 3), { kind: 'merge', srcId: 1, destId: 3, from: 1, to: 3 });
  assert.deepEqual(planBetween(rows, 6, 1, 2), { kind: 'swap', aId: 1, bId: 2, from: 1, to: 2 });
  assert.deepEqual(planBetween(rows, 6, 9, 2), { kind: 'missing' });
  assert.equal(planBetween(rows, 3, 1, 5).kind, 'error');
  // same template but the total exceeds the stack limit: swap, not a partial merge
  const big = [row(1, 1, 10, 60), row(2, 2, 10, 60)];
  assert.equal(planBetween(big, 6, 1, 2).kind, 'swap');
});

test('planSortTemp: by template id then old pos, packed from 1', () => {
  const rows = [row(1, 7, 30, 1), row(2, 3, 10, 1), row(3, 5, 10, 1), row(4, 1, 20, 1)];
  assert.deepEqual(planSortTemp(rows), [
    { id: 2, from: 3, to: 1 }, { id: 3, from: 5, to: 2 }, { id: 4, from: 1, to: 3 }, { id: 1, from: 7, to: 4 },
  ]);
  assert.deepEqual(planSortTemp([]), []);
});

test('planDirect: tops up a stack that takes the whole count, else the first free pos', () => {
  const rows = [row(1, 1, 10, 90), row(2, 2, 10, 5), row(3, 4, 11, 1)];
  assert.deepEqual(planDirect(rows, 6, inc(10, 12)), { kind: 'top', id: 2, pos: 2 });
  assert.deepEqual(planDirect(rows, 6, inc(10, 98)), { kind: 'new', pos: 3 });
  assert.deepEqual(planDirect(rows, 6, inc(12, 1)), { kind: 'new', pos: 3 });
  assert.equal(planDirect(rows, 3, inc(12, 1)), null); // full (3 rows, cap 3)
  assert.equal(planDirect([], 6, inc(10, 100)), null); // more than one stack: caller uses the bag
});

test('isRewardTemp adds dust types 523 / 524 to the client rule', () => {
  assert.equal(isRewardTemp({ kind: 5, type: 523 }), true);
  assert.equal(isRewardTemp({ kind: 5, type: 524 }), true);
  assert.equal(isRewardTemp({ kind: 6, type: 1 }), true);
  assert.equal(isRewardTemp({ kind: 1, type: 1 }), false);
});
