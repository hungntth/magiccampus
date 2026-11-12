// Pure helpers of the Ấn Chương window (run from server/: node --test --import tsx ../client/src/ui/medal/medalRules.test.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMovePush, applyOpPush, medalPropText, medalSlotLabel } from './medalRules';

test('prop text uses pv / 100 and % flag', () => {
  assert.equal(medalPropText({ pt: 1, pv: 25000, pf: 0 }), 'Hp + 250');
  assert.equal(medalPropText({ pt: 59, pv: 150, pf: 1 }), 'Miễn giảm vlý + 1.5%');
});

test('slot labels', () => {
  assert.equal(medalSlotLabel(2002), 'Thánh Kỵ Sĩ');
  assert.equal(medalSlotLabel(1003), 'Pet 3');
});

test('move push patches worn + bag and removes the emptied slot', () => {
  const bag = { '1': { i: 1, t: 5, n: 2 }, '3': { i: 3, t: 9, n: 1 } };
  const next = applyMovePush(bag, { type: 1, joinTid: 0, petJoinTid: 0, del: 3, pa: { '2001': { i: 2001, t: 9, n: 1 } }, ba: { '1': { i: 1, t: 5, n: 1 } } });
  assert.deepEqual(Object.keys(next).sort(), ['1', '2001']);
  assert.equal(next['1']!.n, 1);
});

test('op push is idempotent', () => {
  const p = { medalExp: 10, del: 1, ba: { '2': { i: 2, t: 4, n: 1 } } };
  const once = applyOpPush({ '1': { i: 1, t: 3, n: 1 } }, p);
  assert.deepEqual(applyOpPush(once, p), once);
});
