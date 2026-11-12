// Chân Hồn Thần Thú pure helpers: tree view, form states, chip counts, stat totals (PRSPanel.updatePRSBuffList / Go prs_stats.go).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPrsPanel, prsChipCount, prsExpiredForms, prsFormState, prsPanelValue, prsPropText, prsTimeLeft, prsTotals, prsTreeView,
  type PrsShowRow, type PrsTreeRow,
} from './prs.js';
import { PRS_CHIP_ROWS, PRS_SHOW_ROWS, PRS_TREE_ROWS } from './prsData.js';

const tree = new Map(PRS_TREE_ROWS.map((r) => [r.id, r]));
const show = new Map(PRS_SHOW_ROWS.map((r) => [r.id, r]));
const treeOf = (id: number): PrsTreeRow | undefined => tree.get(id);
const showOf = (id: number): PrsShowRow | undefined => show.get(id);

test('generated tables: 50 tree nodes, 22 forms, 10 chips; node 50 is the max', () => {
  assert.equal(PRS_TREE_ROWS.length, 50);
  assert.equal(PRS_SHOW_ROWS.length, 22);
  assert.equal(PRS_CHIP_ROWS.length, 10);
  assert.equal(tree.get(50)?.next, 0);
  assert.equal(tree.get(1)?.cost, 230);
});

test('prsPanelValue: 1/4/5/6/7/11 raw, the rest / 100', () => {
  assert.equal(prsPanelValue(1, 235), 235);
  assert.equal(prsPanelValue(11, 25), 25);
  assert.equal(prsPanelValue(13, 4), 0.04);
  assert.equal(prsPanelValue(59, 60), 0.6);
  assert.equal(prsPropText(59, 0.6), 'Giảm SThương VL Cuối + 0.6%');
  assert.equal(prsPropText(1, 545), 'HP + 545');
});

test('prsTreeView: page by level, node 50 is page 5 and max', () => {
  assert.deepEqual(prsTreeView(1, treeOf), { level: 1, page: 1, cost: 230, max: false });
  assert.equal(prsTreeView(9, treeOf).page, 1);
  assert.equal(prsTreeView(10, treeOf).page, 2);
  assert.equal(prsTreeView(49, treeOf).page, 5);
  assert.deepEqual(prsTreeView(50, treeOf), { level: 50, page: 5, cost: 0, max: true });
});

test('prsTotals: tree rows up to level(tid) + actArr forms + unexpired timed forms', () => {
  const p = { ...emptyPrsPanel(), tid: 3, actArr: { '0': 1, '1': 2 }, actLimitObj: { '11': 2000, '12': 500 } };
  const t = prsTotals(p, PRS_TREE_ROWS, treeOf, showOf, 1000);
  // tree 2 + 3: HP 235 + 310; form 1: HP 1800; form 11 (timed, alive): HP 8400; form 12 expired
  assert.equal(t.get(1), 235 + 310 + 1800 + 8400);
  assert.equal(t.get(13), (4 + 6 + 40 + 150) / 100);
  assert.equal(t.get(34), 1); // form 2: 100 / 100
  assert.equal(t.get(59), 0.8);
  assert.equal(prsTotals(emptyPrsPanel(), PRS_TREE_ROWS, treeOf, showOf, 0).size, 0); // tid 1 has no props
});

test('form states, expiry and chip counts', () => {
  const p = { ...emptyPrsPanel(), actArr: { '0': 3 }, actLimitObj: { '11': 5000, '12': 100 }, useSid: 3 };
  assert.equal(prsFormState(p, 3, 1000), 'equipped');
  assert.equal(prsFormState(p, 11, 1000), 'active');
  assert.equal(prsFormState(p, 12, 1000), 'locked');
  assert.equal(prsFormState(p, 4, 1000), 'locked');
  assert.deepEqual(prsExpiredForms(p, 1000), [12]);
  const bag = { '1': { chipId: 2, chipNum: 4 }, '2': { chipId: 5, chipNum: 1 }, '3': { chipId: 2, chipNum: 3 } };
  assert.equal(prsChipCount(bag, 2), 7);
  assert.equal(prsChipCount(bag, 9), 0);
  assert.deepEqual(prsTimeLeft(90_061_000, 0), { day: 1, hour: 1, min: 2 });
});
