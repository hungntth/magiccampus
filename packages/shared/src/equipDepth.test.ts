// Tests of the pure equipment depth helpers: sublime table / gate / state, Ky Linh slots, parsing, set bonus, display, jewel groups.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EQUIP_SUBLIME_MAX_LEVEL, QILING_MAX, equipDisplayColor, QILING_PLANS, QILING_SUFFIX, equipSublimeBlocker, equipSublimeFlag, equipSublimeStep, jewelExchangeGroup,
  parseEquipSublime, parseQilingLines, qilingColorOf, qilingEligibleSlot, qilingFullCount, qilingLineText, qilingLinesWire, qilingSetBonusPercent,
  qilingSlotOf, qilingStatValue,
} from './equipDepth.js';

test('sublime step: attack gear reads props 1/2 and dust 1, defence gear props 3/4 and dust 2; past 50 is null', () => {
  const atk = equipSublimeStep(1, true);
  const def = equipSublimeStep(1, false);
  assert.ok(atk && def);
  assert.equal(atk.rate, 100);
  assert.equal(atk.dust, 2);
  assert.equal(def.dust, 3);
  assert.deepEqual(atk.lines, [{ prop: 4, num: 9 }, { prop: 5, num: 7 }]);
  assert.deepEqual(def.lines, [{ prop: 1, num: 36 }, { prop: 11, num: 4 }]);
  assert.equal(equipSublimeStep(EQUIP_SUBLIME_MAX_LEVEL, true)?.elementNum, 0.1);
  assert.equal(equipSublimeStep(EQUIP_SUBLIME_MAX_LEVEL + 1, true), null);
  assert.equal(equipSublimeStep(0, true), null);
});

test('sublime gate: bound, level 50, prefix 5 and colour 4', () => {
  const ok = { bound: true, reqLevel: 60, prefix: 5, color: 4 };
  assert.equal(equipSublimeBlocker(ok), null);
  assert.ok(equipSublimeBlocker({ ...ok, bound: false }));
  assert.ok(equipSublimeBlocker({ ...ok, reqLevel: 49 }));
  assert.ok(equipSublimeBlocker({ ...ok, prefix: 4 }));
  assert.ok(equipSublimeBlocker({ ...ok, color: 3 }));
});

test('sublime state decodes defensively and formats the Flash flag string', () => {
  assert.deepEqual(parseEquipSublime(undefined), { lv: 0, add: 0, el: 0 });
  assert.deepEqual(parseEquipSublime({ lv: '7', add: 15, el: 9 }), { lv: 7, add: 15, el: 6 });
  assert.deepEqual(parseEquipSublime({ lv: 99, add: -3 }), { lv: 50, add: 0, el: 0 });
  assert.equal(equipSublimeFlag({ lv: 2, add: 5, el: 3 }), '{"sublimeId":2,"sublimeAdd":5,"sublimeElement":3}');
});

test('qiling slots follow the Flash getQiLingIndex and need req_level > 150', () => {
  assert.equal(qilingSlotOf(1, 100), 0);
  assert.equal(qilingSlotOf(2, 205), 0);
  assert.equal(qilingSlotOf(3, 301), 3);
  assert.equal(qilingSlotOf(3, 303), 4);
  assert.equal(qilingSlotOf(3, 305), 5);
  assert.equal(qilingSlotOf(4, 400), 1);
  assert.equal(qilingSlotOf(4, 403), 2);
  assert.equal(qilingSlotOf(4, 404), -1);
  assert.equal(qilingSlotOf(9, 900), -1);
  assert.equal(qilingEligibleSlot(1, 100, 150), -1);
  assert.equal(qilingEligibleSlot(1, 100, 151), 0);
});

test('every plan prop has a cap, a suffix and at least three candidates', () => {
  for (const [slot, plan] of Object.entries(QILING_PLANS)) {
    assert.ok(plan.length >= 3, `slot ${slot}`);
    for (const c of plan) {
      assert.ok(QILING_MAX[c.t] > 0, `cap of ${c.t}`);
      assert.ok(QILING_SUFFIX[c.t] !== undefined, `suffix of ${c.t}`);
    }
  }
});

test('qiling lines parse from the object or array form and reject incomplete data', () => {
  const lines = [{ t: 4, v: 120, max: 2500 }, { t: 1, v: 15000, max: 15000 }, { t: 9, v: 0.01, max: 0.05 }];
  assert.deepEqual(parseQilingLines(qilingLinesWire(lines)), lines);
  assert.deepEqual(parseQilingLines(lines), lines);
  assert.deepEqual(parseQilingLines({ 0: lines[0], 1: lines[1] }), []);
  assert.deepEqual(parseQilingLines({ 0: lines[0], 1: lines[1], 2: { t: 9, v: 1, max: 0 } }), []);
  assert.deepEqual(parseQilingLines(null), []);
});

test('set bonus tiers by full lines and stat value units', () => {
  const tiers: [number, number][] = [[0, 0], [1, 0], [2, 2], [3, 2], [4, 5], [6, 8], [8, 12], [9, 12], [10, 16], [12, 20], [30, 20]];
  for (const [full, pct] of tiers) assert.equal(qilingSetBonusPercent(full), pct, `${full} full lines`);
  assert.equal(qilingFullCount([{ t: 4, v: 2500, max: 2500 }, { t: 5, v: 2499, max: 2500 }, { t: 9, v: 0.05, max: 0.05 }]), 2);
  assert.equal(qilingStatValue({ t: 4, v: 100, max: 2500 }), 100);
  assert.equal(qilingStatValue({ t: 9, v: 0.05, max: 0.05 }), 5);
  assert.equal(qilingStatValue({ t: 62, v: 0.025, max: 0.025 }), 2.5);
});

test('line colours and texts follow the Flash bands', () => {
  assert.equal(qilingColorOf({ t: 4, v: 2500, max: 2500 }), '#FA5B05');
  assert.equal(qilingColorOf({ t: 4, v: 1025, max: 2500 }), '#FF33FF');
  assert.equal(qilingColorOf({ t: 4, v: 300, max: 2500 }), '#00FF00');
  assert.equal(qilingColorOf({ t: 4, v: 100, max: 2500 }), '#FFFFFF');
  assert.equal(qilingLineText({ t: 4, v: 2500, max: 2500 }), 'Công VL  2500 (Đầy) (250-2500)');
  assert.equal(qilingLineText({ t: 13, v: 0.0123, max: 0.05 }), 'Bạo Kích  0.012 (0.005-0.05)');
  assert.equal(qilingLineText({ t: 62, v: 0.0125, max: 0.025 }), 'Tăng STVL Cuối  1.250% (0.25%-2.50%)');
});

test('jewel exchange groups stay inside purple or orange gems', () => {
  assert.equal(jewelExchangeGroup(55), 0);
  assert.equal(jewelExchangeGroup(59), 0);
  assert.equal(jewelExchangeGroup(60), 1);
  assert.equal(jewelExchangeGroup(64), 1);
  assert.equal(jewelExchangeGroup(54), -1);
  assert.equal(jewelExchangeGroup(65), -1);
});

test('display colour is the larger of ColorCode and the quality colour, minus one', () => {
  assert.equal(equipDisplayColor(5, 0), 4);
  assert.equal(equipDisplayColor(3, 24), 4);
  assert.equal(equipDisplayColor(4, 18), 3);
  assert.equal(equipDisplayColor(0, 0), 0);
  assert.equal(equipDisplayColor(1, 0), 0);
});
