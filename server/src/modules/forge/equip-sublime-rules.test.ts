// Character Thang hoa glue: eligibility gate from a row + template, state conversion and the worn stat lines.

import test from 'node:test';
import assert from 'node:assert/strict';
import type { SublimeRow } from '../gamedata/sublimation-data';
import { characterSublimeRefusal, fromRuleState, sublimeCandidateOf, toRuleState, wornSublimeLines } from './equip-sublime-rules';

const tpl = { kind: 1, position: 3, req_level: 60 };
const orange = { isBound: true, colorCode: 5, properties: { quality: 25, prefix: 5 } };
const row = (level: number): SublimeRow => ({
  level, rate: 100, itemNum1: 2, itemNum2: 3, elementNum: 0.01,
  props: [{ prop: 4, num: 9 * level }, { prop: 5, num: 7 * level }, { prop: 1, num: 36 * level }, { prop: 11, num: 4 * level }],
});

test('an orange bound Trac Viet piece of level 60 qualifies', () => {
  assert.equal(characterSublimeRefusal(orange, tpl), null);
  assert.deepEqual(sublimeCandidateOf(orange, tpl), { bound: true, reqLevel: 60, prefix: 5, color: 4 });
});

test('unbound, low level, purple, low prefix, pet gear and fashion positions are refused', () => {
  assert.ok(characterSublimeRefusal({ ...orange, isBound: false }, tpl));
  assert.ok(characterSublimeRefusal(orange, { ...tpl, req_level: 40 }));
  assert.ok(characterSublimeRefusal({ ...orange, colorCode: 4, properties: { quality: 20, prefix: 5 } }, tpl));
  assert.ok(characterSublimeRefusal({ ...orange, properties: { quality: 24, prefix: 4 } }, tpl));
  assert.ok(characterSublimeRefusal(orange, { ...tpl, kind: 9, position: 56 }));
  assert.ok(characterSublimeRefusal(orange, { ...tpl, position: 0 }));
  assert.ok(characterSublimeRefusal(orange, undefined));
});

test('the prefix falls back to the quality when the instance has none', () => {
  assert.equal(sublimeCandidateOf({ isBound: true, colorCode: 5, properties: { quality: 25 } }, tpl).prefix, 5);
  assert.equal(sublimeCandidateOf({ isBound: true, colorCode: 5 }, tpl).prefix, 0);
});

test('rule state converts both ways', () => {
  assert.deepEqual(toRuleState({ lv: 3, add: 10, el: 2 }), { id: 3, add: 10, element: 2 });
  assert.deepEqual(fromRuleState({ id: 4, add: 0, element: 6 }), { lv: 4, add: 0, el: 6 });
});

test('worn lines come from the current level only: attack positions props 1/2, defence 3/4', () => {
  const rowOf = (lv: number): SublimeRow => row(lv);
  assert.deepEqual(wornSublimeLines({ sublime: { lv: 2, add: 0, el: 1 } }, 3, rowOf), [{ prop: 4, num: 18 }, { prop: 5, num: 14 }]);
  assert.deepEqual(wornSublimeLines({ sublime: { lv: 2, add: 0, el: 1 } }, 1, rowOf), [{ prop: 1, num: 72 }, { prop: 11, num: 8 }]);
  assert.deepEqual(wornSublimeLines({}, 3, rowOf), []);
  assert.deepEqual(wornSublimeLines({ sublime: { lv: 5, add: 0, el: 1 } }, 3, () => undefined), []);
});
