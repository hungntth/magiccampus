// Thang hoa / Doi khac che rules: state flag round trip, dust plan, roll (rate + add, element on first success), stat lines, restrain gate.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { SublimeRow } from '../gamedata/sublimation-data';
import {
  formatSublimeFlag, isSublimeAttackPosition, parseSublimeState, petSublimeEligible, planRestrain, planSublime, restrainBlocker, rollSublime,
  sublimeElementBonuses, sublimeStatLines,
} from './sublime-rules';

const row = (over: Partial<SublimeRow> = {}): SublimeRow => ({
  level: 2, rate: 90, itemNum1: 3, itemNum2: 4, elementNum: 0.0011,
  props: [{ prop: 4, num: 28 }, { prop: 5, num: 22 }, { prop: 1, num: 110 }, { prop: 11, num: 10 }], ...over,
});

test('flag parses quoted and loose JSON, keeps foreign keys and formats the three sublime keys', () => {
  assert.deepEqual(parseSublimeState('{"sublimeId":3,"sublimeAdd":5,"sublimeElement":2}').state, { id: 3, add: 5, element: 2 });
  assert.deepEqual(parseSublimeState('{sublimeId:7}').state, { id: 7, add: 0, element: 0 });
  assert.deepEqual(parseSublimeState(undefined).state, { id: 0, add: 0, element: 0 });
  assert.deepEqual(parseSublimeState('not json').state, { id: 0, add: 0, element: 0 });
  const { raw } = parseSublimeState('{"succ0":1,"sublimeId":1}');
  assert.deepEqual(JSON.parse(formatSublimeFlag(raw, { id: 2, add: 0, element: 4 })), { succ0: 1, sublimeId: 2, sublimeAdd: 0, sublimeElement: 4 });
});

test('attack positions and the pet eligibility gate (bound, colour >= 3)', () => {
  assert.ok([50, 51, 52, 56].every(isSublimeAttackPosition));
  assert.ok([53, 54, 55, 57].every((p) => !isSublimeAttackPosition(p)));
  assert.ok(petSublimeEligible(true, 3) && !petSublimeEligible(true, 2) && !petSublimeEligible(false, 4));
});

test('dust plan: attack gear pays itemNum1, defence itemNum2, missing dust costs 10 gold each', () => {
  assert.deepEqual(planSublime(row(), true, 5), { need: 3, have: 5, missing: 0, goldNeeded: 0 });
  assert.deepEqual(planSublime(row(), false, 1), { need: 4, have: 1, missing: 3, goldNeeded: 30 });
});

test('roll: rate is row.rate + add capped at 100; success clears add and rolls the element once; failure adds 5', () => {
  const lo = (): number => 0;
  const hi = (): number => 0.99;
  const ok = rollSublime({ id: 1, add: 0, element: 0 }, row(), lo);
  assert.deepEqual(ok, { state: { id: 2, add: 0, element: 1 }, success: true, rate: 90 });
  const rolled = rollSublime({ id: 1, add: 0, element: 0 }, row(), (() => { const seq = [0, 0.84]; return () => seq.shift() ?? 0; })());
  assert.equal(rolled.state.element, 6);
  assert.equal(rollSublime({ id: 4, add: 10, element: 3 }, row(), lo).state.element, 3); // kept after the first success
  const fail = rollSublime({ id: 1, add: 0, element: 2 }, row(), hi);
  assert.deepEqual(fail, { state: { id: 1, add: 5, element: 2 }, success: false, rate: 90 });
  assert.equal(rollSublime({ id: 1, add: 20, element: 2 }, row(), () => 0.99).success, true); // 99 < min(100, 110)
  assert.equal(rollSublime({ id: 1, add: 20, element: 2 }, row(), () => 0.999).rate, 100);
});

test('stat lines by position and element hurt buckets', () => {
  assert.deepEqual(sublimeStatLines(row(), true), [{ prop: 4, num: 28 }, { prop: 5, num: 22 }]);
  assert.deepEqual(sublimeStatLines(row(), false), [{ prop: 1, num: 110 }, { prop: 11, num: 10 }]);
  assert.deepEqual(sublimeStatLines(undefined, true), []);
  const { up, down } = sublimeElementBonuses([
    { state: { id: 2, add: 0, element: 3 }, row: row(), attack: true },
    { state: { id: 2, add: 0, element: 3 }, row: row(), attack: true },
    { state: { id: 2, add: 0, element: 5 }, row: row(), attack: false },
    { state: { id: 0, add: 0, element: 1 }, row: row(), attack: true },
    { state: { id: 2, add: 0, element: 0 }, row: row(), attack: true },
  ]);
  assert.deepEqual(up, { 3: 0.0022 });
  assert.deepEqual(down, { 5: 0.0011 });
});

test('restrain: needs a sublimated piece and a different element 1..6; missing dust asks for 5 gold', () => {
  assert.equal(restrainBlocker({ id: 1, add: 0, element: 2 }, 3), null);
  assert.ok(restrainBlocker({ id: 1, add: 0, element: 2 }, 2));
  assert.ok(restrainBlocker({ id: 1, add: 0, element: 2 }, 7));
  assert.ok(restrainBlocker({ id: 0, add: 0, element: 0 }, 3));
  assert.deepEqual(planRestrain(1), { missing: false, goldNeeded: 0 });
  assert.deepEqual(planRestrain(0), { missing: true, goldNeeded: 5 });
});
