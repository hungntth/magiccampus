// Unit tests of the Ma Tâm window pure helpers.

import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyHeartBags } from '@mc/shared';
import { bagRows, boxBonusText, boxUpgradeInfo, heartCount, holeCost, indexCatalog, propValueText } from './mhRules';

const idx = indexCatalog({
  names: ['A', 'B'],
  hearts: [[11, 1, 0, 5, 100, 1, 20000, 0, '1'], [12, 1, 1, 9, 100, 62, 200, 1, '2']],
  combines: [],
  points: [{ id: 12, goldNum: 300, itemId: 16, num: 2, quality: 6, type: 1 }],
  contains: [{ id: 11, exp: 100, goldNum: 50, num: 10500 }],
});

test('prop text and box bonus', () => {
  assert.equal(propValueText(1, 2), 'HP +2');
  assert.equal(propValueText(62, 2), 'Tăng STVL Cuối +2%');
  assert.equal(boxBonusText(idx, 1, 1), '+5%');
  assert.equal(boxBonusText(idx, 1, 2), '+0%');
});

test('box upgrade cost falls back to gold', () => {
  assert.deepEqual(boxUpgradeInfo(idx, 1, 1, 10), { max: false, maNang: 100, gold: 50, byGold: true });
  assert.equal(boxUpgradeInfo(idx, 1, 1, 100).byGold, false);
  assert.equal(boxUpgradeInfo(idx, 1, 6, 0).max, true);
});

test('hole cost and bag rows', () => {
  assert.deepEqual(holeCost(idx, 1, 2), { gold: 300, diamonds: 2, diamondColor: 2, type: 1 });
  const bags = emptyHeartBags();
  bags.ren['12'] = { itemId: 12, n: 3 };
  bags.ren['11'] = { itemId: 11, n: 1 };
  assert.deepEqual(bagRows(bags, 0, idx).map((r) => r.id), [11, 12]);
  assert.equal(heartCount(bags, 12), 3);
});
