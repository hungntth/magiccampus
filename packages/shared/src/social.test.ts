// Tests for the relationship / intimacy helpers of social.ts: type groups, gift amounts and the onSetClose chat line.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ADDABLE_RELATION_TYPES, INTIMACY_ITEMS, RELATION_LIST_KEY, RelationLimits, RelationType, TEAM_INTIMACY, intimacyItemAmount,
  isBondRelation, isManagedRelation, setCloseLine,
} from './social.js';

test('wire types follow GamePredef.RELATIONSHIP_TYPE and caps', () => {
  assert.deepEqual(Object.values(RelationType), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(RelationLimits, { FRIEND: 120, BLACK: 30, ENEMY: 100 });
  assert.deepEqual([...ADDABLE_RELATION_TYPES], [1, 2, 3]);
  assert.equal(RELATION_LIST_KEY[RelationType.BROTHER], 'brother');
});

test('bond and managed groups', () => {
  for (const t of [1, 4, 5, 6]) assert.equal(isBondRelation(t), true);
  for (const t of [2, 3, 0, 7]) assert.equal(isBondRelation(t), false);
  for (const t of [4, 5, 6]) assert.equal(isManagedRelation(t), true);
  for (const t of [1, 2, 3]) assert.equal(isManagedRelation(t), false);
});

test('gift items carry the Go amounts and nothing else', () => {
  assert.deepEqual(INTIMACY_ITEMS, { 32: 660, 1302: 60, 1303: 60, 1315: 660 });
  assert.equal(intimacyItemAmount(1303), 60);
  assert.equal(intimacyItemAmount(32), 660);
  assert.equal(intimacyItemAmount(33), null);
  assert.equal(intimacyItemAmount(Number('toString')), null);
});

test('team intimacy constants', () => {
  assert.equal(TEAM_INTIMACY.gain, 6);
  assert.equal(TEAM_INTIMACY.intervalMs, 55_000);
});

test('setCloseLine: gain, drop and reset', () => {
  assert.equal(setCloseLine('An', 666), 'Bạn và An có điểm thân mật tăng lên: 666');
  assert.equal(setCloseLine('An', -2500), 'Điểm thân mật của bạn và An giảm xuống: 2500');
  assert.equal(setCloseLine('An', 0), 'Điểm thân mật của bạn và An đã trở thành: 0');
});
