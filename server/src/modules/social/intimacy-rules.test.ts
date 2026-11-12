// Unit tests for the intimacy rules: team throttle (once per 55 s per player), tick target selection and gift validation.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TeamThrottle, giftPlan, tickTargets } from './intimacy-rules';

describe('TeamThrottle', () => {
  it('allows one claim per player per interval', () => {
    const t = new TeamThrottle(55_000);
    assert.equal(t.claim(1, 0), true);
    assert.equal(t.claim(1, 54_999), false);
    assert.equal(t.claim(2, 10_000), true);
    assert.equal(t.claim(1, 55_000), true);
    assert.equal(t.claim(1, 60_000), false);
  });
  it('forget drops only stale stamps', () => {
    const t = new TeamThrottle(55_000);
    t.claim(1, 0);
    t.forget(1, 10_000);
    assert.equal(t.claim(1, 20_000), false);
    t.forget(1, 55_000);
    assert.equal(t.size, 0);
    assert.equal(t.claim(1, 55_001), true);
  });
});

describe('tickTargets', () => {
  const online = (cid: number): boolean => cid !== 4;
  it('other online non-AFK members', () => {
    assert.deepEqual(tickTargets([1, 2, 3, 4], new Set(), 1, online), [2, 3]);
  });
  it('AFK members neither gain nor give', () => {
    assert.deepEqual(tickTargets([1, 2, 3], new Set([3]), 1, online), [2]);
    assert.deepEqual(tickTargets([1, 2, 3], new Set([1]), 1, online), []);
  });
});

describe('giftPlan', () => {
  it('multiplies the per-unit amount by the quantity', () => {
    assert.deepEqual(giftPlan(32, 2), { templateId: 32, qty: 2, total: 1320 });
    assert.deepEqual(giftPlan(1303, 5), { templateId: 1303, qty: 5, total: 300 });
    assert.deepEqual(giftPlan(1315, 1), { templateId: 1315, qty: 1, total: 660 });
    assert.deepEqual(giftPlan(1302, 1), { templateId: 1302, qty: 1, total: 60 });
  });
  it('rejects unknown templates and bad quantities', () => {
    assert.equal(giftPlan(33, 1), null);
    assert.equal(giftPlan(32, 0), null);
    assert.equal(giftPlan(32, -1), null);
    assert.equal(giftPlan(32, 1.5), null);
    assert.equal(giftPlan(32, 10_000), null);
    assert.equal(giftPlan('x', 1), null);
    assert.equal(giftPlan(32, 'x'), null);
  });
});
