// Stone seal rules (M13 phase E2): holes (0 = bored), set / replace / remove / swap, bore and succinct costs, display + stat bonuses.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { StoneSealItemInfo } from '@mc/shared';
import { isError, planBore, planRemove, planRemoveAll, planSet, planSuccinct, planSwap } from './stoneseal-rules';
import { holeFacts, sealBonuses, sealViews, type WornPiece } from './stoneseal-stats';
import { encodeStoneSeal, parseStoneSeal, stoneSealData, type StoneSealState } from './stoneseal-state';

const ok = <T>(v: T | { error: string }): T => {
  assert.ok(!isError(v), isError(v) ? v.error : '');
  return v as T;
};
const err = (v: unknown): string => (isError(v) ? v.error : '');

test('decode: -1 (old Go bored marker) reads as 0 = bored; unknown slots and holes drop', () => {
  const s = parseStoneSeal({ stone: { 1: { lvl: 2, data: { s1: -1, s2: 0, s3: 701, s11: 5 } }, 13: { lvl: 1, data: {} } } });
  assert.deepEqual(s[1], { lvl: 2, holes: { 1: 0, 2: 0, 3: 701 } });
  assert.equal(s[13], undefined);
  assert.deepEqual(stoneSealData(s)['1'], { lvl: 2, data: { s1: 0, s2: 0, s3: 701 } });
  assert.deepEqual(parseStoneSeal(encodeStoneSeal(s)), s);
});

test('bore: cost index = bored count, holes become 0, gold / dust modes, refusals', () => {
  let s: StoneSealState = {};
  const a = ok(planBore(s, 3, 1, 1));
  assert.deepEqual(a.cost, { gold: 71, dust: 0, diamondColor: -1 });
  assert.equal(a.state[3]!.holes[1], 0);
  s = a.state;
  const b = ok(planBore(s, 3, 5, 2));
  assert.deepEqual(b.cost, { gold: 0, dust: 60, diamondColor: 0 });
  assert.match(err(planBore(s, 3, 1, 1)), /đã khai/);
  assert.match(err(planBore(s, 3, 2, 9)), /không hợp lệ/);
  assert.match(err(planBore(s, 0, 2, 1)), /Vị trí trang bị/);
  assert.match(err(planBore(s, 3, 11, 1)), /Vị trí ô/);
  const full: StoneSealState = { 1: { lvl: 0, holes: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 0])) } };
  assert.match(err(planBore(full, 1, 1, 1)), /tối đa|đã khai/);
});

test('diamond colour rises with the bored count', () => {
  const holes = (n: number) => ({ 1: { lvl: 0, holes: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 0])) } });
  assert.equal(ok(planBore(holes(2), 1, 10, 2)).cost.diamondColor, 1);
  assert.equal(ok(planBore(holes(8), 1, 10, 2)).cost.diamondColor, 4);
  assert.equal(ok(planBore(holes(9), 1, 10, 2)).cost.dust, 463);
});

test('succinct: level costs, max level, pay modes', () => {
  let s: StoneSealState = {};
  const costs: number[] = [];
  for (let i = 0; i < 5; i++) {
    const p = ok(planSuccinct(s, 4, 3));
    costs.push(p.cost.dust);
    s = p.state;
  }
  assert.deepEqual(costs, [110, 110, 275, 529, 582]);
  assert.equal(s[4]!.lvl, 5);
  assert.match(err(planSuccinct(s, 4, 3)), /cao nhất/);
  assert.equal(ok(planSuccinct({}, 4, 1)).cost.gold, 157);
  assert.match(err(planSuccinct({}, 4, 2)), /không hợp lệ/);
});

test('set / replace / remove / swap / remove all', () => {
  const bored: StoneSealState = { 2: { lvl: 0, holes: { 1: 0, 2: 0, 3: 0 } } };
  assert.match(err(planSet(bored, 2, 5, 701)), /Đục lỗ/);
  const set = ok(planSet(bored, 2, 1, 701));
  assert.deepEqual([set.state[2]!.holes[1], set.replaced], [701, 0]);
  const replaced = ok(planSet(set.state, 2, 1, 702));
  assert.deepEqual([replaced.state[2]!.holes[1], replaced.replaced], [702, 701]);
  const two = ok(planSet(set.state, 2, 2, 703)).state;
  const swapped = ok(planSwap(two, 2, 1, 2)).state;
  assert.deepEqual([swapped[2]!.holes[1], swapped[2]!.holes[2]], [703, 701]);
  assert.match(err(planSwap(two, 2, 1, 9)), /chưa|Đục|không hợp lệ/);
  const rem = ok(planRemove(two, 2, 1));
  assert.deepEqual([rem.returned, rem.state[2]!.holes[1]], [[701], 0]);
  assert.match(err(planRemove(rem.state, 2, 1)), /trống/);
  assert.deepEqual(ok(planRemoveAll(two, 2)).returned.sort(), [701, 703]);
  assert.deepEqual(ok(planRemoveAll({}, 2)).returned, []);
});

const info = (tid: number, prop: number, num: number, color: number): StoneSealItemInfo => ({ tid, name: `i${tid}`, icon: '0', prop, num, color });
const items = new Map<number, StoneSealItemInfo>([[701, info(701, 1, 30, 2)], [702, info(702, 6, 10, 1)], [501, info(501, 1, 50, 1)], [502, info(502, 6, 20, 0)]]);
const itemOf = (t: number) => items.get(t);
const piece: WornPiece = { sid: 2, tid: 9, name: 'Giap', icon: '0', gems: [501, 502, 0, 0, 0, 0, 0, 0, 0, 0] };

test('facts: same-prop stone is weakened, different props give the add line', () => {
  const s: StoneSealState = { 2: { lvl: 0, holes: { 1: 701, 2: 701, 3: 0 } } };
  const f = holeFacts(s, piece, itemOf, 2);
  assert.equal(f[0]!.weakened, true); // stone prop 1 vs gem prop 1
  assert.equal(f[0]!.add, undefined);
  assert.equal(f[1]!.weakened, false); // gem prop 6 vs stone prop 1
  assert.equal(f[1]!.add!.t, 4);
  assert.ok(Math.abs(f[1]!.add!.n - 3960.01 * (0 + 2 + 2)) < 1e-6);
  const views = sealViews(s, new Map([[2, piece]]), itemOf);
  assert.equal(views.length, 12);
  assert.equal(views[1]!.equipName, 'Giap');
  assert.equal(views[1]!.bored, 3);
  assert.equal(views[1]!.holes[2]!.open, true);
  assert.equal(views[1]!.holes[3]!.open, false);
});

test('bonuses: stone jewel line (not weakened) + add lines / 10000, only for worn slots', () => {
  const s: StoneSealState = { 2: { lvl: 0, holes: { 1: 701, 2: 702 } }, 5: { lvl: 0, holes: { 1: 701 } } };
  const b = sealBonuses(s, new Map([[2, piece]]), itemOf);
  // hole 2: stone 702 prop 6 vs gem 502 prop 6 -> weakened; hole 1 weakened too -> only add lines remain: none (same props)
  assert.deepEqual(b.flat, {});
  const s2: StoneSealState = { 2: { lvl: 0, holes: { 2: 701 } } };
  const b2 = sealBonuses(s2, new Map([[2, piece]]), itemOf);
  assert.equal(b2.flat.maxHp, 30); // the stone's own line (prop 1)
  assert.equal(b2.flat.attack, Math.round((3960.01 * 4) / 10000)); // add line prop 4 = 1.58 -> 2
  assert.deepEqual(sealBonuses(s2, new Map(), itemOf).flat, {});
});
