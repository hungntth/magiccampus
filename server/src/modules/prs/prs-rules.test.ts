// Chân Hồn Thần Thú pure rules: tolerant decode, tree, forms, chip moves / exchange / swap, collect odds and the drop-table parser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRS_SHOW_ROWS, PRS_TREE_ROWS, type PrsShowRow } from '@mc/shared';
import { chipPool, defaultCollectRates, drawChips, parseCollectRates, pickChip, planCollect } from './prs-collect';
import { encodePrs, parsePrs } from './prs-state';
import {
  applyDraws, isError, normalizeBag, planActivate, planActivateSpe, planCancel, planExchange, planMove, planReplace, planSwap, planTreeUp, pruneExpired,
} from './prs-rules';

const treeOf = (id: number) => PRS_TREE_ROWS.find((r) => r.id === id);
const show = (id: number): PrsShowRow | undefined => PRS_SHOW_ROWS.find((r) => r.id === id);
const seq = (...vals: number[]): (() => number) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};

test('parsePrs: Go string tid, junk dropped, objects always present, useId mirror', () => {
  const s = parsePrs({ tid: '7', actArr: { 0: 3, x: 1 }, actLimitObj: { 11: 1234, bad: 1 }, useId: 3, chipBag: { 1: { chipId: 2, chipNum: 5 }, 2: { chipId: 0, chipNum: 1 } }, excBag: { 4: { chipId: 1, chipNum: 1 } } });
  assert.deepEqual(s, { tid: 7, actArr: { 0: 3 }, actLimitObj: { 11: 1234 }, useSid: 3, chipBag: { 1: { chipId: 2, chipNum: 5 } }, excBag: {}, isShow: 0 });
  assert.equal(parsePrs({ tid: '0' }).tid, 1);
  assert.deepEqual(parsePrs(null).actLimitObj, {});
  assert.equal(encodePrs(s).useId, 3);
});

test('planTreeUp: pays the current node cost, stops at node 50', () => {
  const p = planTreeUp(parsePrs({}), treeOf);
  assert.ok(!isError(p));
  assert.equal(p.cost, 230);
  assert.equal(p.state.tid, 2);
  assert.ok(isError(planTreeUp(parsePrs({ tid: 50 }), treeOf)));
});

test('planActivate: 10 chips -> actArr; tab 1 refused; already refused; short refused', () => {
  const s = parsePrs({ chipBag: { 1: { chipId: 1, chipNum: 12 }, 2: { chipId: 3, chipNum: 1 } } });
  const p = planActivate(s, show(1), 0);
  assert.ok(!isError(p));
  assert.deepEqual(p.state.actArr, { 0: 1 });
  assert.deepEqual(p.state.chipBag, { 1: { chipId: 1, chipNum: 2 }, 2: { chipId: 3, chipNum: 1 } });
  assert.ok(isError(planActivate(p.state, show(1), 0)));
  assert.ok(isError(planActivate(s, show(3), 0)));
  assert.ok(isError(planActivate(s, show(11), 0)));
  assert.equal(s.chipBag['1']!.chipNum, 12); // input untouched
});

test('planActivateSpe: tab 1 only, expiry = now + limit_time minutes', () => {
  const p = planActivateSpe(parsePrs({}), show(11), 1000);
  assert.ok(!isError(p));
  assert.equal(p.state.actLimitObj['11'], 1000 + 10080 * 60_000);
  assert.deepEqual([p.itemId, p.count], [5303, 1]);
  assert.ok(isError(planActivateSpe(parsePrs({}), show(1), 0)));
});

test('replace / cancel / prune expired', () => {
  const s = parsePrs({ actArr: { 0: 2 }, actLimitObj: { 11: 500 } });
  assert.ok(isError(planReplace(s, 5, 0)));
  const eq = planReplace(s, 11, 100);
  assert.ok(!isError(eq));
  assert.equal(eq.state.useSid, 11);
  const pr = pruneExpired(eq.state, 600);
  assert.deepEqual([pr.changed, pr.unequipped, pr.state.useSid], [true, true, 0]);
  assert.deepEqual(pr.state.actLimitObj, {});
  const c = planCancel(eq.state);
  assert.ok(!isError(c) && c.state.useSid === 0);
  assert.equal(pruneExpired(parsePrs({ actArr: { 0: 2 } }), 0).changed, false);
});

test('planMove: whole stacks swap between the bag and the 3 exchange slots, bag stays compact', () => {
  const s = parsePrs({ chipBag: { 1: { chipId: 1, chipNum: 3 }, 2: { chipId: 2, chipNum: 4 } }, excBag: { 2: { chipId: 5, chipNum: 1 } } });
  const a = planMove(s, 1, 2, 1);
  assert.ok(!isError(a));
  assert.deepEqual(a.state.excBag, { 2: { chipId: 1, chipNum: 3 } });
  assert.deepEqual(a.state.chipBag, { 1: { chipId: 5, chipNum: 1 }, 2: { chipId: 2, chipNum: 4 } });
  const b = planMove(a.state, 2, 9, 2);
  assert.ok(!isError(b));
  assert.deepEqual(b.state.excBag, {});
  assert.deepEqual(b.state.chipBag, { 1: { chipId: 5, chipNum: 1 }, 2: { chipId: 2, chipNum: 4 }, 3: { chipId: 1, chipNum: 3 } });
  assert.ok(isError(planMove(s, 1, 4, 1)));
  assert.ok(isError(planMove(s, 3, 1, 1)));
  assert.ok(isError(planMove(s, 1, 1, 3)));
});

test('normalizeBag merges duplicate ids; exchange stacks one chip', () => {
  assert.deepEqual(normalizeBag({ 3: { chipId: 2, chipNum: 1 }, 1: { chipId: 2, chipNum: 4 }, 2: { chipId: 7, chipNum: 1 } }), {
    1: { chipId: 2, chipNum: 5 }, 2: { chipId: 7, chipNum: 1 },
  });
  const e = planExchange(parsePrs({ chipBag: { 1: { chipId: 4, chipNum: 2 } } }), 4, () => 1000);
  assert.ok(!isError(e));
  assert.equal(e.cost, 1000);
  assert.deepEqual(e.state.chipBag, { 1: { chipId: 4, chipNum: 3 } });
  assert.ok(isError(planExchange(parsePrs({}), 99, () => undefined)));
});

test('planSwap: needs three different chips, consumes one of each per swap; Times = min count', () => {
  const exc = { 1: { chipId: 1, chipNum: 2 }, 2: { chipId: 2, chipNum: 5 }, 3: { chipId: 3, chipNum: 3 } };
  const one = planSwap(parsePrs({ excBag: exc }), 1);
  assert.ok(!isError(one));
  assert.equal(one.times, 1);
  assert.deepEqual(one.state.excBag, { 1: { chipId: 1, chipNum: 1 }, 2: { chipId: 2, chipNum: 4 }, 3: { chipId: 3, chipNum: 2 } });
  const all = planSwap(parsePrs({ excBag: exc }), 99);
  assert.ok(!isError(all));
  assert.equal(all.times, 2);
  assert.deepEqual(all.state.excBag, { 2: { chipId: 2, chipNum: 3 }, 3: { chipId: 3, chipNum: 1 } });
  assert.ok(isError(planSwap(parsePrs({ excBag: { 1: { chipId: 1, chipNum: 2 }, 2: { chipId: 1, chipNum: 5 }, 3: { chipId: 3, chipNum: 3 } } }), 1)));
  assert.ok(isError(planSwap(parsePrs({ excBag: { 1: { chipId: 1, chipNum: 2 } } }), 1)));
});

test('applyDraws merges rewards per id', () => {
  const p = applyDraws(parsePrs({}), [3, 5, 3]);
  assert.ok(!isError(p));
  assert.deepEqual(p.rewards, [{ t: 127, id: 3, num: 2 }, { t: 127, id: 5, num: 1 }]);
  assert.deepEqual(p.state.chipBag, { 1: { chipId: 3, chipNum: 2 }, 2: { chipId: 5, chipNum: 1 } });
});

test('parseCollectRates: seed JSON, broken JSON, bad fields, zero weights', () => {
  const seed = '{"free_chip_percent": 10, "gold_chip_percent": 20, "six_collect_guaranteed_chips": 1, "free_stone": 30, "gold_stone": 30, "gold_crystal_no_chip": 10, "chip_weights": {"1": 1, "2": 1, "3": 1, "4": 1, "5": 1, "6": 1, "7": 1, "8": 1, "9": 1, "10": 1}}';
  assert.deepEqual(parseCollectRates(seed), defaultCollectRates());
  assert.deepEqual(parseCollectRates('{oops'), defaultCollectRates());
  const r = parseCollectRates('{"free_chip_percent": 150, "gold_chip_percent": 55.5, "six_collect_guaranteed_chips": 9, "gold_stone": 7, "chip_weights": {"2": 0, "x": 3}}');
  assert.deepEqual([r.freeChipPercent, r.goldChipPercent, r.sixGuaranteed, r.goldStone], [10, 55.5, 1, 7]);
  assert.equal(r.chipWeights.size, 10);
  assert.deepEqual([...parseCollectRates('{"chip_weights": {"4": 3, "9": 1}}').chipWeights], [[4, 3], [9, 1]]);
});

test('planCollect: chance rolls, crystal for misses, six-collect guarantee; weighted draw skips unknown ids', () => {
  const rates = defaultCollectRates();
  assert.deepEqual(planCollect('free', rates, seq(0.05)), { chips: 1, stone: 30, crystal: 0 });
  assert.deepEqual(planCollect('free', rates, seq(0.5)), { chips: 0, stone: 30, crystal: 0 });
  assert.deepEqual(planCollect('gold', rates, seq(0.5)), { chips: 0, stone: 30, crystal: 10 });
  assert.deepEqual(planCollect('gold', rates, seq(0.1)), { chips: 1, stone: 30, crystal: 0 });
  assert.deepEqual(planCollect('six', rates, seq(0.9)), { chips: 1, stone: 180, crystal: 50 });
  assert.deepEqual(planCollect('six', rates, seq(0.1, 0.1, 0.9)), { chips: 4, stone: 180, crystal: 20 });
  const pool = chipPool(new Map([[2, 1], [5, 3], [99, 50]]), (id) => id <= 10);
  assert.deepEqual(pool, { ids: [2, 5], weights: [1, 3], total: 4 });
  assert.equal(pickChip(pool, seq(0)), 2);
  assert.equal(pickChip(pool, seq(0.3)), 5);
  assert.deepEqual(drawChips(pool, 3, seq(0.1, 0.9, 0.2)), [2, 5, 2]);
  assert.equal(drawChips(chipPool(new Map(), () => true), 1, seq(0)), null);
});
