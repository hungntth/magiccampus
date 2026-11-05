// Unit tests for the Túi Tiện Dụng slot layout and accept rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsNormalTemp, acceptsTemp, isMaTam, tempIndex, tempPos, validTempPos } from './tempBag.js';

test('tempIndex <-> tempPos round trip over 1..500 for both bags', () => {
  const seen = new Set<number>();
  for (const mx of [false, true]) {
    for (let pos = 1; pos <= 500; pos++) {
      const idx = tempIndex(mx, pos);
      assert.equal(seen.has(idx), false, `index ${idx} used twice`);
      seen.add(idx);
      assert.deepEqual(tempPos(idx), { pos, mx });
    }
  }
});

test('legacy layout anchors', () => {
  assert.equal(tempIndex(false, 1), 0);
  assert.equal(tempIndex(false, 99), 98);
  assert.equal(tempIndex(true, 1), 100);
  assert.equal(tempIndex(true, 99), 198);
  assert.equal(tempIndex(false, 100), 200);
  assert.equal(tempIndex(true, 100), 1100);
});

test('tempPos rejects indexes outside both layouts', () => {
  for (const idx of [-1, 99, 199, 199, 601, 1000, 1099, 1501, 10999, 100000]) {
    assert.equal(tempPos(idx), null, `index ${idx}`);
  }
});

test('validTempPos', () => {
  assert.equal(validTempPos(0), false);
  assert.equal(validTempPos(1), true);
  assert.equal(validTempPos(500), true);
  assert.equal(validTempPos(501), false);
  assert.equal(validTempPos(1.5), false);
});

test('accept rules: normal bag takes materials, Ma Tâm bag takes Ma Tâm only', () => {
  assert.equal(acceptsNormalTemp({ kind: 6, type: 1 }, 100), true);
  assert.equal(acceptsNormalTemp({ kind: 14, type: 1404 }, 3115), true);
  assert.equal(acceptsNormalTemp({ kind: 5, type: 503 }, 7), true);
  assert.equal(acceptsNormalTemp({ kind: 5, type: 552 }, 8), true);
  assert.equal(acceptsNormalTemp({ kind: 1, type: 1 }, 9), false);
  assert.equal(acceptsNormalTemp(undefined, 9), false);
  // Ma Tâm never lands in the normal bag even when its kind would pass
  assert.equal(acceptsNormalTemp({ kind: 6, type: 506 }, 100), false);
  assert.equal(acceptsNormalTemp({ kind: 6, type: 1 }, 5400), false);
  assert.equal(isMaTam({ type: 1 }, 5375), true);
  assert.equal(isMaTam({ type: 1 }, 5697), true);
  assert.equal(isMaTam({ type: 1 }, 5698), false);
  assert.equal(isMaTam({ type: 1 }, 5770), true);
  assert.equal(isMaTam({ type: 506 }, 1), true);
  assert.equal(acceptsTemp(true, { kind: 6, type: 1 }, 100), false);
  assert.equal(acceptsTemp(true, { kind: 0, type: 506 }, 100), true);
  assert.equal(acceptsTemp(false, { kind: 6, type: 1 }, 100), true);
});
