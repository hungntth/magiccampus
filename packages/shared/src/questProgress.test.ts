// Unit tests for the quest requirement progress helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFinishable, progressText, requireLabel, requireProgress } from './questProgress.ts';

const kill = { kind: 2, type: 12, itemId: 157, num: 3, q: 1, name: 'Kê Vương' };
const collect = { kind: 1, type: 29, itemId: 516, num: 2, q: -1, name: 'Cành Cây' };

test('kill progress uses the remaining count', () => {
  const view = { state: 103, require: [kill], questKill: [{ creatureId: 157, num: 2 }] };
  const [p] = requireProgress(view, 104, () => 0);
  assert.deepEqual([p.have, p.need, p.done], [1, 3, false]);
  assert.equal(progressText(p), '(1/3)');
  const [done] = requireProgress({ ...view, questKill: [{ creatureId: 157, num: 0 }] }, 104, () => 0);
  assert.equal(progressText(done), '(3/3) (Hoàn thành)');
  assert.equal(requireLabel(done), 'Tiêu diệt Kê Vương (3/3) (Hoàn thành)');
  assert.equal(requireLabel(requireProgress({ state: 103, require: [collect], questKill: [] }, 104, () => 1)[0]), 'Cành Cây (1/2)');
});

test('kill progress without a questKill entry is 0', () => {
  const [p] = requireProgress({ state: 103, require: [kill], questKill: [] }, 104, () => 0);
  assert.equal(p.have, 0);
});

test('collect progress counts the bag, capped at the requirement', () => {
  const view = { state: 103, require: [collect], questKill: [] };
  assert.equal(requireProgress(view, 104, () => 1)[0].have, 1);
  assert.equal(requireProgress(view, 104, () => 9)[0].have, 2);
});

test('a finishable quest shows everything complete; isFinishable combines server and bag', () => {
  const view = { state: 104, require: [kill, collect], questKill: [] };
  assert.ok(requireProgress(view, 104, () => 0).every((p) => p.done));
  const open = { state: 103, require: [collect], questKill: [] };
  assert.equal(isFinishable(requireProgress(open, 104, () => 2), false), true);
  assert.equal(isFinishable(requireProgress(open, 104, () => 1), false), false);
  assert.equal(isFinishable([], false), false);
});

test('pet objective lines count the matching pets', () => {
  const pet = { kind: 3, type: 12, itemId: 32, num: 2, q: 16, name: 'Tiểu Nấm Yêu' };
  const view = { state: 103, require: [pet], questKill: [] };
  assert.equal(requireProgress(view, 104, () => 0, () => 1)[0].have, 1);
  assert.equal(requireProgress(view, 104, () => 0, () => 5)[0].have, 2); // capped at the requirement
  assert.equal(requireProgress(view, 104, () => 0)[0].have, 0);
  assert.equal(requireLabel(requireProgress(view, 104, () => 0, () => 2)[0]), 'Tiểu Nấm Yêu (2/2) (Hoàn thành)');
});
