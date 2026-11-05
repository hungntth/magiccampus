// World boss ranking payloads and settlement plan.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WB } from './wb-config';
import { buildRank, drawLucky, planSettlement, rankLabel, settlementRanks, sortedByDamage, type WbRanked } from './wb-settle';

const p = (cid: number, classId: number, damage: number): WbRanked => ({ cid, name: `P${cid}`, classId, damage });

test('ranking: damage desc, ties by lower id, zero damage unranked', () => {
  const sorted = sortedByDamage([p(3, 1, 50), p(1, 1, 50), p(2, 2, 90), p(4, 1, 0)]);
  assert.deepEqual(sorted.map((x) => x.cid), [2, 1, 3]);
  assert.deepEqual(settlementRanks(sorted, p(3, 1, 50)), { world: 3, cls: 2 });
  assert.deepEqual(settlementRanks(sorted, p(4, 1, 0)), { world: 0, cls: 0 });
});

test('rank payload: top 10 each, myRank is the class index (-1 without damage)', () => {
  const many = Array.from({ length: 14 }, (_, i) => p(i + 1, 1, 1000 - i));
  const sorted = sortedByDamage(many);
  const r = buildRank(sorted, many[12]);
  assert.equal(r.rank1.globalRank.length, 10);
  assert.equal(r.rank2.classRank.length, 10);
  assert.equal(r.rank2.myRank, 12);
  assert.equal(buildRank(sorted, p(99, 1, 0)).rank2.myRank, -1);
  assert.equal(buildRank(sorted, undefined).rank2.classRank.length, 0);
  assert.deepEqual(r.rank1.globalRank[0], { name: 'P1', score: 1000 });
});

test('lucky draw: distinct winners from the pool, at most count', () => {
  const ids = drawLucky([5, 3, 9, 1, 7], 3, () => 0);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(drawLucky([4], 3, Math.random), [4]);
  assert.deepEqual(drawLucky([], 3, Math.random), []);
});

test('settlement: class top 3 bags, killing blow bag, lucky among the rest', () => {
  // class 1: ids 1..5 by damage; class 2: id 6
  const dealers = [p(1, 1, 500), p(2, 1, 400), p(3, 1, 300), p(4, 1, 200), p(5, 1, 100), p(6, 2, 50)];
  const sorted = sortedByDamage(dealers);
  const plans = planSettlement(sorted, 3, () => 0);
  assert.deepEqual(plans.get(1)!.awards, [{ itemId: WB.CLASS_RANK_BAGS[0], num: 1 }]);
  assert.deepEqual(plans.get(2)!.awards, [{ itemId: WB.CLASS_RANK_BAGS[1], num: 1 }]);
  assert.deepEqual(plans.get(3)!.awards.map((a) => a.itemId), [WB.CLASS_RANK_BAGS[2], WB.LAST_HIT_BAG]);
  // lucky pool: classRank > 3 -> ids 4 and 5 (class 2's only player is its rank 1 -> bag 3585)
  assert.deepEqual(plans.get(6)!.awards, [{ itemId: WB.CLASS_RANK_BAGS[0], num: 1 }]);
  assert.equal(plans.get(4)!.luckyNum, 1);
  assert.equal(plans.get(5)!.luckyNum, 1);
  assert.deepEqual(plans.get(4)!.awards, [{ itemId: WB.LUCKY_BAG, num: 1 }]);
  assert.equal(plans.get(1)!.luckyNum, 0);
});

test('timeout: no killing blow bag; zero-damage players get nothing', () => {
  const sorted = sortedByDamage([p(1, 1, 10), p(2, 1, 0)]);
  const plans = planSettlement(sorted, 0, () => 0);
  assert.equal(plans.size, 1);
  assert.deepEqual(plans.get(1)!.awards.map((a) => a.itemId), [WB.CLASS_RANK_BAGS[0]]);
  assert.equal(rankLabel(0), '-');
  assert.equal(rankLabel(2), 2);
});
