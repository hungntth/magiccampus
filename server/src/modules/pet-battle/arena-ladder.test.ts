// Pet arena ladder: seeding from rating, stored order, normalisation and the challenge swap (Go ladder_test.go cases).

import assert from 'node:assert/strict';
import test from 'node:test';
import { applyChallengeWin, isSeeded, orderOf, positionOf, rankChanges, seedLadder, sortLadder, type LadderRow } from './arena-ladder';

const row = (characterId: number, rank: number, createdAt = characterId, rating = 1000): LadderRow => ({ characterId, rank, createdAt, rating });

test('seeding orders by rating then registration then id', () => {
  const rows = [row(1, 0, 10, 1000), row(2, 0, 5, 1200), row(3, 0, 5, 1000), row(4, 0, 5, 1000)];
  assert.equal(isSeeded(rows), false);
  assert.deepEqual(seedLadder(rows), [2, 3, 4, 1]);
  assert.deepEqual(orderOf(rows), [2, 3, 4, 1]);
});

test('a stored ladder keeps its order and appends unranked rows by registration', () => {
  const rows = [row(1, 2), row(2, 1), row(3, 0, 9), row(4, 0, 3)];
  assert.equal(isSeeded(rows), true);
  assert.deepEqual(sortLadder(rows), [2, 1, 4, 3]);
  assert.deepEqual(orderOf(rows), [2, 1, 4, 3]);
});

test('rank changes list only rows whose stored rank differs from the position', () => {
  const stored = new Map([[2, 1], [1, 2], [4, 0]]);
  const changes = rankChanges([2, 1, 4, 3], stored);
  assert.deepEqual([...changes.entries()], [[4, 3], [3, 4]]);
  assert.equal(rankChanges([2, 1], new Map([[2, 1], [1, 2]])).size, 0);
});

test('beating a higher rank takes it and shifts the ones between down by one', () => {
  const r = applyChallengeWin([10, 20, 30, 40, 50], 40, 20);
  assert.equal(r.moved, true);
  assert.deepEqual(r.order, [10, 40, 20, 30, 50]);
  assert.equal(positionOf(r.order, 40), 2);
  assert.equal(positionOf(r.order, 30), 4);
});

test('beating the next rank up is a plain swap and rank 1 can be taken', () => {
  assert.deepEqual(applyChallengeWin([1, 2, 3], 2, 1).order, [2, 1, 3]);
  assert.deepEqual(applyChallengeWin([1, 2, 3], 3, 1).order, [3, 1, 2]);
});

test('a win over a lower rank or an unknown id changes nothing', () => {
  assert.deepEqual(applyChallengeWin([1, 2, 3], 1, 3), { order: [1, 2, 3], moved: false });
  assert.equal(applyChallengeWin([1, 2, 3], 2, 99).moved, false);
  assert.equal(applyChallengeWin([1, 2, 3], 99, 1).moved, false);
  assert.equal(positionOf([1, 2], 7), 0);
});
