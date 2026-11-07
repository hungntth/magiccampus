// Tests of the useMultiItem batch loop: stop at the first refusal, slot push folding and the count cap.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capUseCount } from '@mc/shared';
import { push } from '../inventory/pushes';
import { foldSlotPushes, runBatch } from './multi-use';

test('runBatch consumes every unit while the step succeeds', async () => {
  const r = await runBatch(3, async (i) => ({ used: true, pushes: [push('onAddCharactorSlot', { id: 7, n: 3 - i })] }));
  assert.equal(r.consumed, 3);
  assert.equal(r.pushes.length, 3);
});

test('runBatch stops at the first refusal and keeps its pushes', async () => {
  let calls = 0;
  const r = await runBatch(10, async (i) => {
    calls++;
    return i < 2 ? { used: true, pushes: [] } : { used: false, pushes: [push('onSystemMidMsgOrNote', 'full')] };
  });
  assert.equal(calls, 3);
  assert.equal(r.consumed, 2);
  assert.deepEqual(r.pushes, [push('onSystemMidMsgOrNote', 'full')]);
});

test('runBatch with a first refusal consumes nothing', async () => {
  const r = await runBatch(5, async () => ({ used: false, pushes: [] }));
  assert.equal(r.consumed, 0);
});

test('count is capped by the stack before the loop', async () => {
  const requested = capUseCount(50, 4);
  let calls = 0;
  const r = await runBatch(requested, async () => {
    calls++;
    return { used: true, pushes: [] };
  });
  assert.equal(requested, 4);
  assert.equal(calls, 4);
  assert.equal(r.consumed, 4);
});

test('foldSlotPushes keeps only the last slot push of the item', () => {
  const pushes = [
    push('onAddCharactorSlot', { id: 7, stack: 2 }), push('onAddMoney', 1, 'goldBind', 5, 5),
    push('onAddCharactorSlot', { id: 8, stack: 1 }), push('onAddCharactorSlot', { id: 7, stack: 1 }),
    push('onDelCharactorSlot', 7, 12),
  ];
  assert.deepEqual(foldSlotPushes(pushes, 7), [pushes[1], pushes[2], pushes[4]]);
  assert.deepEqual(foldSlotPushes(pushes, 9), pushes);
});
