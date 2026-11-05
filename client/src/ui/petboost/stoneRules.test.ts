// Tests for the stone window rules (run from server/: node --test --import tsx ../client/src/ui/petboost/stoneRules.test.ts).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { absorbResult, absorbable, autoPicks, composable, entriesOf, holeMap, inlayCandidates, maxCompose, picksFit } from './stoneRules';

// data_tbl_pet_stone: 1 -> 2 is level 1 -> 2 of a family; 17 is level 5 (energy_id 18); 18 is its Tu Linh stone; 23 is another level 5.
test('entriesOf skips empty / null slots and keeps the 0-based sid', () => {
  const e = entriesOf([[1, 3, 0], undefined, null as never, [17, 2, 0]]);
  assert.deepEqual(e.map((x) => [x.sid, x.tid, x.num]), [[0, 1, 3], [3, 17, 2]]);
});

test('compose / absorb eligibility and quantities', () => {
  const [low, five, energy] = entriesOf([[1, 7, 0], [17, 1, 0], [18, 1, 0]]);
  assert.equal(composable(low!), true);
  assert.equal(composable(five!), false);
  assert.equal(composable(energy!), false);
  assert.equal(maxCompose(low!), 2);
  assert.equal(absorbable(five!), true);
  assert.equal(absorbable(energy!), false);
});

test('auto picks fill the main stack first and respect stacks; absorb result is the main energy stone', () => {
  const entries = entriesOf([[17, 2, 0], [23, 4, 0]]);
  assert.deepEqual(autoPicks(entries, 0), [0, 0, 1, 1, 1]);
  assert.equal(picksFit([0, 0, 0], entries), false);
  assert.equal(absorbResult([0, 0, 1, 1, 1], entries), 18);
  assert.equal(absorbResult([0, 0, 1, 1], entries), null, 'needs five picks');
  assert.equal(absorbResult([1, 0, 0, 1, 1], entries), 24, 'the first pick is the main stone');
});

test('inlay candidates follow the hole kind and the one-stone-per-property rule', () => {
  const entries = entriesOf([[1, 1, 0], [18, 1, 0], [23, 1, 0]]);
  assert.deepEqual(inlayCandidates(entries, 1, {}).map((e) => e.tid), [18], 'hole 1 takes only the Tu Linh stone');
  assert.deepEqual(inlayCandidates(entries, 2, {}).map((e) => e.tid), [1, 23]);
  assert.deepEqual(inlayCandidates(entries, 2, { 3: 1 }).map((e) => e.tid), [23], 'an inlaid HP stone blocks the same property');
  assert.deepEqual(holeMap({ '2': [5, 0, 0] }), { 2: 5 });
});
