// Unit tests for the Tiểu Tinh Linh window helpers (fairyConfig.ts).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAIRY_TEXT } from '@mc/shared';
import { configOf, draftOf, failText, fairyArtOf, familyMax, hasDuplicateFamily, learnedSkills, skillFailText, upgradeCost } from './fairyConfig';

test('draftOf fills missing lists and defaults select to list 0', () => {
  const d = draftOf({ '1': { c0: 6227, c3: -1 } });
  assert.equal(d.select, 0);
  assert.deepEqual(d.lists[0], [-1, -1, -1, -1, -1]);
  assert.deepEqual(d.lists[1], [6227, -1, -1, -1, -1]);
  assert.equal(draftOf({ select: -1 }).select, -1);
  assert.equal(draftOf({ select: -2 }).select, 0);
});

test('configOf round-trips a draft', () => {
  const d = draftOf({ select: 2, '2': { c0: 1, c1: 2, c2: 3, c3: 4, c4: 5 } });
  const cfg = configOf(d);
  assert.equal(cfg.select, 2);
  assert.deepEqual(cfg['2'], { c0: 1, c1: 2, c2: 3, c3: 4, c4: 5 });
  assert.deepEqual(cfg['0'], { c0: -1, c1: -1, c2: -1, c3: -1, c4: -1 });
  assert.deepEqual(draftOf(cfg), d);
});

test('hasDuplicateFamily ignores empty slots', () => {
  const fam = (id: number): string => (id < 10 ? 'a' : 'b');
  assert.equal(hasDuplicateFamily([1, -1, 12], fam), false);
  assert.equal(hasDuplicateFamily([1, 2], fam), true);
});

test('learnedSkills keeps slot order and upgradeCost follows the 1 / 3 rule', () => {
  assert.deepEqual(learnedSkills({ skillFlag: { s3: 5918, s1: 5917, s2: 0 } }), [[1, 5917], [3, 5918]]);
  assert.deepEqual([1, 2, 3].map(upgradeCost), [1, 3, 0]);
});

test('fail codes map to the Flash texts', () => {
  assert.equal(failText('grow', 'rmb', 0), FAIRY_TEXT.NO_MONEY);
  assert.equal(failText('grow', 'rmb', 1), FAIRY_TEXT.NO_GOLD);
  assert.equal(failText('grow', 'out'), FAIRY_TEXT.NO_GROWS);
  assert.equal(failText('raise', 'full'), FAIRY_TEXT.DOH_FULL);
  assert.equal(failText('feed', 'out'), FAIRY_TEXT.NO_FEEDS);
  assert.equal(skillFailText(2), FAIRY_TEXT.UP_FAIL);
  assert.equal(skillFailText(1), FAIRY_TEXT.LEARN_FAIL);
});

test('familyMax and fairyArtOf read the static rows', () => {
  assert.equal(familyMax('SKILL536660'), 3);
  assert.equal(fairyArtOf(1, 0), '2060100300001');
  assert.equal(fairyArtOf(1, 5), '2060100300005');
});
