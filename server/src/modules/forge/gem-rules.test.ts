// Hole and gem rules: capacity, diamond gate and cost constants, fee, jewelSet parsing, slot reads, and the gem props in stats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLE_DIG_COST, diamondColorNeeded, gemRemoveFee } from '@mc/shared';
import { equipBonusesOf, gemLinesOf } from '../inventory/equip-stats';
import { checkDig, gemAt, gemTakes, holeCapacity, holesOf, jewelDataOf, parseGemRefs, slotRefusal } from './gem-rules';

const diamond = (colorCode: number, tplType = 600) => ({ tplType, colorCode });

test('hole capacity: template hole_num, else 10', () => {
  assert.equal(holeCapacity({ hole_num: 0 }), 10);
  assert.equal(holeCapacity({ hole_num: 4 }), 4);
  assert.equal(holeCapacity(undefined), 10);
});

test('diamond colour gate per hole slot', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(diamondColorNeeded), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(HOLE_DIG_COST, 2000);
});

test('holeDig needs a bound item, a free hole and a good enough diamond', () => {
  assert.equal(checkDig({ bound: false }, diamond(0)).ok, false);
  const bound = { bound: true, props: { holeNum: 2, t1: 0, t2: 0 } };
  assert.equal(checkDig(bound, diamond(0)).ok, false); // slot 3 needs colour 1
  const ok = checkDig(bound, diamond(1));
  assert.deepEqual(ok, { ok: true, slot: 3, needColor: 1 });
  assert.equal(checkDig(bound, diamond(4, 601)).ok, false); // not a diamond
  assert.equal(checkDig({ bound: true, props: { holeNum: 10 } }, diamond(4)).ok, false); // full
  assert.equal(checkDig({ bound: true, props: { holeNum: 2 }, tpl: { hole_num: 2 } }, diamond(4)).ok, false);
});

test('gem removal fee is 20 % of the gem gold value, rounded', () => {
  assert.deepEqual([2, 10, 50, 225, 1125].map(gemRemoveFee), [0, 2, 10, 45, 225]);
});

test('slot reads and refusal', () => {
  const props = { holeNum: 3, t1: 47, t2: 0, t3: 0 };
  assert.equal(holesOf(props), 3);
  assert.deepEqual([1, 2, 4].map((s) => gemAt(props, s)), [47, 0, -1]);
  assert.match(slotRefusal(props, 4) ?? '', /chưa được đục/);
  assert.match(slotRefusal(props, 1) ?? '', /đã có/);
  assert.equal(slotRefusal(props, 2), null);
  const d = jewelDataOf(props);
  assert.deepEqual([d.holeNum, d.t1, d.t2, d.t4, d.t10], [3, 47, 0, -1, -1]);
});

test('jewelSet refs parse and aggregate per stack', () => {
  assert.deepEqual(parseGemRefs({ 2: { idx: 9, tempBagFlag: false }, 1: { idx: 9 } }), [{ slot: 1, itemId: 9 }, { slot: 2, itemId: 9 }]);
  assert.equal(parseGemRefs({ 11: { idx: 1 } }), null);
  assert.equal(parseGemRefs({ 1: { idx: 1, tempBagFlag: true } }), null);
  assert.equal(parseGemRefs([]), null);
  assert.deepEqual(gemTakes([{ slot: 1, itemId: 9 }, { slot: 2, itemId: 9 }, { slot: 3, itemId: 4 }]), [{ id: 9, count: 2 }, { id: 4, count: 1 }]);
});

test('gem props map through EQUIP_PROP and are flat (not star-multiplied)', () => {
  const gems = new Map<number, Record<string, unknown>>([
    [11, { prop_type: 1, propl_num: 1 }], // chain head of prop 1 -> maxHp
    [65, { prop_type: 6, propl_num: 3 }], // prop 6 -> defense
    [999, { prop_type: 0, propl_num: 5 }], // no prop: nothing
  ]);
  const props = { holeNum: 3, t1: 11, t2: 65, t3: 999 };
  const lines = gemLinesOf(props, gems);
  assert.deepEqual(lines, [{ prop: 1, num: 1 }, { prop: 6, num: 3 }]);
  const tpl = { main_prop1: 6, main_prop_num1: 10 };
  const plain = equipBonusesOf([{ tpl, gems: lines }]);
  const starred = equipBonusesOf([{ tpl, star: 2, gems: lines }]);
  assert.equal(plain.flat.maxHp, 1);
  assert.equal(plain.flat.defense, 13); // 10 + gem 3
  assert.equal(starred.flat.defense, 15); // floor(10 * 1.21) = 12 + gem 3
  assert.equal(starred.flat.maxHp, 1);
});
