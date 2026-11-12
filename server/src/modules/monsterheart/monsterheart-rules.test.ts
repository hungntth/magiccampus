// Monster heart rules (M13 phase E2): decode, set / remove with combines, hole opening, fusion with protection, dissolve, container upgrade.

import assert from 'node:assert/strict';
import test from 'node:test';
import { MONSTER_HEART, buildCombineGroups, type CombineRow, type ContainRow, type HeartRow, type MonsterHeartState, type PointRow } from '@mc/shared';
import {
  isError, nextHeart, planBoxUpgrade, planOpen, planRemove, planResolve, planSet, planUpgrade, type HeartLook,
} from './monsterheart-rules';
import { addToBag, bagCount, emptyMonsterHeartState, openFreeHoles, parseMonsterHeart, encodeMonsterHeart } from './monsterheart-state';

const ok = <T>(v: T | { error: string }): T => {
  assert.ok(!isError(v), isError(v) ? v.error : '');
  return v as T;
};
const err = (v: unknown): string => (isError(v) ? v.error : '');

// heart ids: 10..15 = type 1 colours 0..5 (id + 1 = next colour), 20 = type 2 colour 0
const hearts = new Map<number, HeartRow>();
for (let c = 0; c <= 5; c++) hearts.set(10 + c, { id: 10 + c, type: 1, color: c, exp: c + 1, talent: 10000 + 1000 * c, propType: 4, propNum: 50000, name: `h${c}` });
hearts.set(20, { id: 20, type: 2, color: 0, exp: 1, talent: 10000, propType: 5, propNum: 10000, name: 'other' });
const combines: CombineRow[] = [
  { id: 11011, name: 'Tn', holes: [1, 2], types: [1, 1], pt: [4, -1, -1], pn: [70475, -1, -1], max: 8456952, show: 1 },
  { id: 11012, name: 'Tn', holes: [1, 2], types: [1, 1], pt: [4, -1, -1], pn: [140950, -1, -1], max: -1, show: -1 },
];
const points = new Map<number, PointRow>([
  [11, { id: 11, goldNum: 0, itemId: 16, num: 0, quality: 0, type: -1 }],
  [12, { id: 12, goldNum: 2, itemId: 16, num: 5, quality: 6, type: -1 }],
  [13, { id: 13, goldNum: 5, itemId: 16, num: 10, quality: 0, type: 2 }],
]);
const contains = new Map<number, ContainRow>([[11, { id: 11, exp: 100, goldNum: 24, num: 10000 }], [12, { id: 12, exp: 200, goldNum: 48, num: 12000 }]]);
const look: HeartLook = {
  heart: (id) => hearts.get(id), combine: (id) => combines.find((c) => c.id === id), contain: (id) => contains.get(id), point: (id) => points.get(id),
  groups: buildCombineGroups(combines),
};
const fresh = (): MonsterHeartState => {
  const s = emptyMonsterHeartState();
  openFreeHoles(s, look.point);
  return s;
};
const withHole = (s: MonsterHeartState, box: number, hole: number): MonsterHeartState => {
  s.data.hadActHole[box]![hole] = MONSTER_HEART.EMPTY_HOLE;
  return s;
};

test('decode / encode round trip; ver < 2 documents read -1 holes as closed; free holes open', () => {
  const s = fresh();
  assert.equal(s.data.hadActHole[1]![1], -1);
  assert.equal(s.data.hadActHole[1]![2], 0);
  addToBag(s, 1, 10, 3);
  s.data.heartBoxLev[2] = 4;
  assert.deepEqual(parseMonsterHeart(encodeMonsterHeart(s)), s);
  const legacy = parseMonsterHeart({ bag: {}, data: { hadActHole: { 1: { 1: -1, 2: -1, 3: 77 } } } });
  assert.deepEqual([legacy.data.hadActHole[1]![1], legacy.data.hadActHole[1]![2], legacy.data.hadActHole[1]![3]], [-1, 0, 77]);
  assert.equal(parseMonsterHeart({ data: { heartBoxLev: { 1: 99 } } }).data.heartBoxLev[1], MONSTER_HEART.MAX_BOX_LEV);
});

test('set: needs an open hole, the heart in the bag and the right type; a placed heart swaps back', () => {
  const s = withHole(fresh(), 1, 3);
  addToBag(s, 1, 10, 2);
  addToBag(s, 2, 20, 1);
  assert.match(err(planSet(s, 10, 4, 1, look)), /Chưa kích hoạt/);
  assert.match(err(planSet(s, 11, 1, 1, look)), /Không có Ma Tâm/);
  assert.match(err(planSet(s, 10, 3, 1, look)), /Loại Ma Tâm/); // point 13 only takes type 2
  assert.match(err(planSet(s, 10, 1, 9, look)), /ô chứa/);
  const a = ok(planSet(s, 10, 1, 1, look));
  assert.equal(a.state.data.hadActHole[1]![1], 10);
  assert.equal(bagCount(a.state, 10), 1);
  assert.equal(a.type, 1);
  assert.equal(bagCount(s, 10), 2, 'the input state is not mutated');
  const b = ok(planSet(a.state, 10, 1, 1, look)); // same heart onto itself: one unit back, one placed
  assert.equal(bagCount(b.state, 10), 1);
  const r = ok(planRemove(a.state, 1, 1, look));
  assert.equal(bagCount(r.state, 10), 2);
  assert.equal(r.state.data.hadActHole[1]![1], -1);
  assert.match(err(planRemove(r.state, 1, 1, look)), /trống/);
});

test('combines appear when both holes hold a key and disappear on removal', () => {
  const s = withHole(fresh(), 1, 2);
  addToBag(s, 1, 10, 2);
  const a = ok(planSet(s, 10, 1, 1, look)).state;
  assert.deepEqual(a.data.hadActCombine[1], {});
  const b = ok(planSet(a, 10, 2, 1, look)).state;
  assert.deepEqual(b.data.hadActCombine[1], { 1101: { color: 1, talent: 20000 } });
  assert.deepEqual(ok(planRemove(b, 2, 1, look)).state.data.hadActCombine[1], {});
});

test('open hole: gold / diamond costs, already open, unknown point', () => {
  const s = fresh();
  const g = ok(planOpen(s, 1, 2, false, look));
  assert.deepEqual(g.cost, { gold: 2, diamonds: 0, diamondColor: 0 });
  assert.equal(g.state.data.hadActHole[1]![2], -1);
  const d = ok(planOpen(s, 1, 2, true, look));
  assert.deepEqual(d.cost, { gold: 0, diamonds: 5, diamondColor: 2 }); // quality 6 -> colour 2
  assert.match(err(planOpen(s, 1, 1, false, look)), /đã mở/);
  assert.match(err(planOpen(s, 1, 7, false, look)), /Không có dữ liệu/);
});

test('upgrade: rates, unprotected failure burns the copies, protection keeps them, stones then gold, isAll loops', () => {
  const s = fresh();
  addToBag(s, 1, 10, 10);
  const win = ok(planUpgrade(s, 10, 2, { isAll: false, useStone: false, byGold: false }, { stones: 0, gold: 0 }, look, () => 0));
  assert.deepEqual([win.successes, bagCount(win.state, 10), bagCount(win.state, 11)], [1, 8, 1]);
  const lose = ok(planUpgrade(s, 10, 2, { isAll: false, useStone: false, byGold: false }, { stones: 0, gold: 0 }, look, () => 0.99));
  assert.deepEqual([lose.successes, bagCount(lose.state, 10), bagCount(lose.state, 11)], [0, 8, 0]);
  const kept = ok(planUpgrade(s, 10, 2, { isAll: false, useStone: true, byGold: false }, { stones: 3, gold: 0 }, look, () => 0.99));
  assert.deepEqual([bagCount(kept.state, 10), kept.stonesUsed], [10, 1]);
  assert.match(err(planUpgrade(s, 10, 2, { isAll: false, useStone: true, byGold: false }, { stones: 0, gold: 5000 }, look, () => 0)), /Tâm Tinh Thạch/);
  const gold = ok(planUpgrade(s, 10, 2, { isAll: false, useStone: true, byGold: true }, { stones: 0, gold: 900 }, look, () => 0.99));
  assert.deepEqual([gold.goldUsed, gold.stonesUsed, bagCount(gold.state, 10)], [800, 0, 10]);
  const all = ok(planUpgrade(s, 10, 5, { isAll: true, useStone: false, byGold: false }, { stones: 0, gold: 0 }, look, () => 0));
  assert.deepEqual([all.attempts, all.successes, bagCount(all.state, 10), bagCount(all.state, 11)], [2, 2, 0, 2]);
  const allStone = ok(planUpgrade(s, 10, 2, { isAll: true, useStone: true, byGold: false }, { stones: 1, gold: 0 }, look, () => 0.99));
  assert.deepEqual([allStone.attempts, allStone.stonesUsed, bagCount(allStone.state, 10)], [1, 1, 10]); // stops when protection runs out
});

test('upgrade refusals: count range, not enough copies, top colour, unknown heart', () => {
  const s = fresh();
  addToBag(s, 1, 10, 1);
  addToBag(s, 1, 15, 9);
  const none = { stones: 0, gold: 0 };
  const o = { isAll: false, useStone: false, byGold: false };
  assert.match(err(planUpgrade(s, 10, 1, o, none, look, Math.random)), /Số lượng/);
  assert.match(err(planUpgrade(s, 10, 6, o, none, look, Math.random)), /Số lượng/);
  assert.match(err(planUpgrade(s, 10, 2, o, none, look, Math.random)), /Không đủ Ma Tâm/);
  assert.match(err(planUpgrade(s, 15, 2, o, none, look, Math.random)), /cao nhất/);
  assert.match(err(planUpgrade(s, 99, 2, o, none, look, Math.random)), /Không có dữ liệu/);
  assert.equal(nextHeart(hearts.get(14)!, look.heart)?.id, 15);
  assert.equal(nextHeart(hearts.get(20)!, look.heart), null);
});

test('resolve: exp x num into Ma Năng', () => {
  const s = fresh();
  addToBag(s, 1, 12, 4);
  const p = ok(planResolve(s, 12, 3, look));
  assert.equal(p.gain, 9); // heart.exp = colour + 1 = 3
  assert.equal(bagCount(p.state, 12), 1);
  assert.match(err(planResolve(s, 12, 5, look)), /Không đủ/);
  assert.match(err(planResolve(s, 12, 0, look)), /Số lượng/);
});

test('container upgrade: Ma Năng first, gold when short, max level, missing row', () => {
  const s = fresh();
  const a = ok(planBoxUpgrade(s, 1, { maNang: 100, gold: 0 }, look));
  assert.deepEqual([a.level, a.maNang, a.gold], [2, 100, 0]);
  const b = ok(planBoxUpgrade(s, 1, { maNang: 99, gold: 24 }, look));
  assert.deepEqual([b.maNang, b.gold], [0, 24]);
  assert.match(err(planBoxUpgrade(s, 1, { maNang: 99, gold: 23 }, look)), /Không đủ vàng/);
  s.data.heartBoxLev[1] = 6;
  assert.match(err(planBoxUpgrade(s, 1, { maNang: 1e9, gold: 1e9 }, look)), /max/);
  assert.match(err(planBoxUpgrade(fresh(), 3, { maNang: 1e9, gold: 1e9 }, look)), /Không có dữ liệu/);
});
