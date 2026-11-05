// Tests for trade-swap: slot assignment, bag-full / missing refusal and saga compensation order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { petMoveStep, planPetMoves, planSwap, runSaga, type PetMoveStore, type SagaStep } from './trade-swap';

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

test('planSwap uses the capacity of each receiver (opened bag pages)', () => {
  const full = (cid: number, out: number[], capacity?: number) => ({
    cid, bag: Array.from({ length: 30 }, (_, i) => ({ id: cid * 1000 + i, slotIndex: i })), out, capacity,
  });
  assert.deepEqual(planSwap(full(1, [1000]), full(2, [], 30), 30), { ok: false, reason: 'full', cid: 2 });
  const plan = planSwap(full(1, [1000]), full(2, [], 60), 30);
  assert.ok(plan.ok);
  assert.equal(plan.moves[0].toSlot, 30);
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

test('planPetMoves lists a-out then b-out in offer order', () => {
  assert.deepEqual(planPetMoves({ cid: 1, pets: [11, 12] }, { cid: 2, pets: [21] }), [
    { id: 11, from: 1, to: 2 }, { id: 12, from: 1, to: 2 }, { id: 21, from: 2, to: 1 },
  ]);
  assert.deepEqual(planPetMoves({ cid: 1, pets: [] }, { cid: 2, pets: [] }), []);
});

/** In-memory pet owners with the conditional semantics of the Mongo store (owner check on give and giveBack). */
const fakePets = (owners: Record<number, number>, busy: readonly number[] = []): PetMoveStore & { owners: Record<number, number> } => ({
  owners,
  give: async (m) => {
    if (owners[m.id] !== m.from || busy.includes(m.id)) return false;
    owners[m.id] = m.to;
    return true;
  },
  giveBack: async (m) => {
    if (owners[m.id] !== m.to) return false;
    owners[m.id] = m.from;
    return true;
  },
});

test('pet moves run before item moves and a later failure moves every pet back (no duplicates, no loss)', async () => {
  const store = fakePets({ 11: 1, 12: 1, 21: 2 });
  const log: string[] = [];
  const marker = (name: string, fail = false): SagaStep => ({
    name, run: async () => { log.push(`run ${name}`); if (fail) throw new Error(name); }, undo: async () => void log.push(`undo ${name}`),
  });
  const moves = planPetMoves({ cid: 1, pets: [11, 12] }, { cid: 2, pets: [21] });
  const refusal = new Error('changed');
  const ok = await runSaga([marker('debit'), ...moves.map((m) => petMoveStep(m, store, refusal)), marker('item move'), marker('credit')]);
  assert.equal(ok.ok, true);
  assert.deepEqual(store.owners, { 11: 2, 12: 2, 21: 1 });
  assert.deepEqual(log, ['run debit', 'run item move', 'run credit']);

  const again = fakePets({ 11: 1, 12: 1, 21: 2 });
  log.length = 0;
  const bad = await runSaga([marker('debit'), ...moves.map((m) => petMoveStep(m, again, refusal)), marker('item move', true), marker('credit')]);
  assert.equal(bad.ok, false);
  assert.equal(bad.failedStep, 'item move');
  assert.deepEqual(bad.undone, ['move pet 21', 'move pet 12', 'move pet 11', 'debit']);
  assert.deepEqual(again.owners, { 11: 1, 12: 1, 21: 2 });
});

test('a pet that changed since the lock fails the step with the refusal and undoes the earlier pet moves', async () => {
  const store = fakePets({ 11: 1, 21: 2 }, [21]); // 21 is busy (e.g. sent to battle after the lock)
  const refusal = new Error('changed');
  const moves = planPetMoves({ cid: 1, pets: [11] }, { cid: 2, pets: [21] });
  const res = await runSaga(moves.map((m) => petMoveStep(m, store, refusal)));
  assert.equal(res.ok, false);
  assert.equal(res.error, refusal);
  assert.equal(res.failedStep, 'move pet 21');
  assert.deepEqual(res.undone, ['move pet 11']);
  assert.deepEqual(store.owners, { 11: 1, 21: 2 });
});

test('an undo that cannot find the pet with the taker is reported, not swallowed', async () => {
  const store = fakePets({ 11: 1 });
  const m = planPetMoves({ cid: 1, pets: [11] }, { cid: 2, pets: [] })[0];
  const step = petMoveStep(m, store, new Error('x'));
  await step.run();
  store.owners[11] = 3; // sold on meanwhile
  await assert.rejects(step.undo());
  const res = await runSaga([petMoveStep(m, fakePets({ 11: 1 }), new Error('x')), { name: 'boom', run: async () => { throw new Error('b'); }, undo: async () => undefined }]);
  assert.deepEqual(res.undone, ['move pet 11']);
});
