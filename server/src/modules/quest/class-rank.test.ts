// Unit tests for the class-rank tables: promotion never lowers, turn-in gate, history backfill.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { promotedRank, rankFromHistory, turnInBlocked } from './class-rank';

describe('class rank', () => {
  it('promotion raises only', () => {
    assert.equal(promotedRank(686, 0), 1);
    assert.equal(promotedRank(677, 1), 2);
    assert.equal(promotedRank(686, 3), null);
    assert.equal(promotedRank(1, 0), null);
  });
  it('turn-in gate', () => {
    assert.equal(turnInBlocked(143, 0), true);
    assert.equal(turnInBlocked(143, 1), false);
    assert.equal(turnInBlocked(5407, 3), true);
    assert.equal(turnInBlocked(99, 0), false);
  });
  it('backfill takes the best rank', () => {
    assert.equal(rankFromHistory([1, 686, 2471]), 3);
    assert.equal(rankFromHistory([]), 0);
  });
});
