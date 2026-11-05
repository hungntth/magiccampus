// Unit tests for the blood bag rules: buy order, clamp, cost, draw and refill items.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BLOOD_BAG_MAX, BLOOD_BAG_TEXT } from '@mc/shared';
import { addToPool, drawFrom, planBuy } from './blood-bag';

describe('blood bag', () => {
  it('buy order: full, then <= 0, then clamp + cost', () => {
    assert.deepEqual(planBuy([BLOOD_BAG_MAX, 0, 0, 0], 1, 0), { ok: false, err: BLOOD_BAG_TEXT.FULL });
    assert.deepEqual(planBuy([0, 0, 0, 0], 1, 0), { ok: false, err: BLOOD_BAG_TEXT.NEED_POSITIVE });
    assert.deepEqual(planBuy([0, 0, 0, 0], 2, 1_000_000), { ok: true, added: 1_000_000, cost: 200 });
    assert.deepEqual(planBuy([BLOOD_BAG_MAX - 10, 0, 0, 0], 1, 1_000_000), { ok: true, added: 10, cost: 1 });
  });
  it('draw only what is missing, refill caps at the max', () => {
    assert.equal(drawFrom(500, 200), 200);
    assert.equal(drawFrom(100, 200), 100);
    assert.equal(drawFrom(100, 0), 0);
    assert.equal(addToPool(BLOOD_BAG_MAX, 1), null);
    assert.equal(addToPool(BLOOD_BAG_MAX - 5, 50_000), BLOOD_BAG_MAX);
  });
});
