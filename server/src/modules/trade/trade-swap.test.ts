// Tests for trade-swap: slot assignment, bag-full / missing refusal and saga compensation order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planSwap, runSaga, type SagaStep } from './trade-swap';

const rows = (...slots: number[]) => slots.map((s, i) => ({ id: 100 * s + i, slotIndex: s }));

test('planSwap gives each receiver its lowest empty slots, in offer order', () => {
  const a = { cid: 1, bag: [{ id: 11, slotIndex: 0 }, { id: 12, slotIndex: 1 }, { id: 13, slotIndex: 4 }], out: [12, 11] };
  const b = { cid: 2, bag: [{ id: 21, slotIndex: 0 }, { id: 22, slotIndex: 2 }], out: [21] };
  const plan = planSwap(a, b, 30);
  assert.ok(plan.ok);
  assert.deepEqual(plan.moves, [
    { id: 12, from: 1, to: 2, fromSlot: 1, toSlot: 1 },
    { id: 11, from: 1, to: 2, fromSlot: 0, toSlot: 3 },
    { id: 21, from: 2, to: 1, fromSlot: 0, toSlot: 2 },
  ]);
});

test('planSwap does not reuse slots freed by the receiver\'s own outgoing rows', () => {
  const full = (cid: number, out: number[]) => ({ cid, bag: Array.from({ length: 30 }, (_, i) => ({ id: cid * 1000 + i, slotIndex: i })), out });
  const plan = planSwap(full(1, [1000]), full(2, [2000]), 30);
  assert.deepEqual(plan, { ok: false, reason: 'full', cid: 2 });
  const one = planSwap(full(1, [1000]), { cid: 2, bag: rows(0, 1), out: [] }, 30);
  assert.ok(one.ok);
  assert.equal(one.moves[0].toSlot, 2);
});

test('planSwap refuses when an offered row is missing and handles empty offers', () => {
  assert.deepEqual(planSwap({ cid: 1, bag: [], out: [5] }, { cid: 2, bag: [], out: [] }, 30), { ok: false, reason: 'missing', cid: 1 });
  const none = planSwap({ cid: 1, bag: [], out: [] }, { cid: 2, bag: [], out: [] }, 30);
  assert.ok(none.ok && none.moves.length === 0);
});

test('runSaga runs in order and compensates completed steps in reverse on failure', async () => {
  const log: string[] = [];
  const step = (name: string, fail = false, undoFails = false): SagaStep => ({
    name,
    run: async () => {
      log.push(`run ${name}`);
      if (fail) throw new Error(`boom ${name}`);
    },
    undo: async () => {
      log.push(`undo ${name}`);
      if (undoFails) throw new Error('undo failed');
    },
  });
  const ok = await runSaga([step('debitA'), step('debitB'), step('move')]);
  assert.equal(ok.ok, true);
  assert.deepEqual(log, ['run debitA', 'run debitB', 'run move']);

  log.length = 0;
  const bad = await runSaga([step('debitA'), step('debitB'), step('move1'), step('move2', true), step('credit')]);
  assert.equal(bad.ok, false);
  assert.equal(bad.failedStep, 'move2');
  assert.deepEqual(bad.undone, ['move1', 'debitB', 'debitA']);
  assert.deepEqual(log, ['run debitA', 'run debitB', 'run move1', 'run move2', 'undo move1', 'undo debitB', 'undo debitA']);

  const stuck = await runSaga([step('a'), step('b', false, true), step('c', true)]);
  assert.deepEqual(stuck.undone, ['a']);
  assert.deepEqual(stuck.undoErrors, ['b']);
});
