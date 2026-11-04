// Unit tests for the group-battle rules: roster selection, enemy count by size, command readiness, reward split.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enemyRange, groupEnemyCount, isSurvivor, missingCommands, selectRoster, splitReward, type RosterCandidate } from './roster';

const cand = (cid: number, o: Partial<RosterCandidate> = {}): RosterCandidate => ({
  cid, afk: false, online: true, mapId: 3, hp: 100, inBattle: false, ...o,
});

test('roster: solo and followers fight alone', () => {
  assert.deepEqual(selectRoster(1, 3, [], null), [1]);
  assert.deepEqual(selectRoster(2, 3, [cand(1), cand(2)], 1), [2]); // 2 is not the leader
});

test('roster: leader first, skipping AFK / offline / other map / dead / fighting members', () => {
  const members = [cand(1), cand(2, { afk: true }), cand(3, { online: false }), cand(4, { mapId: 9 }), cand(5, { hp: 0 }),
    cand(6, { inBattle: true }), cand(7)];
  assert.deepEqual(selectRoster(1, 3, members, 1), [1, 7]);
});

test('roster: capped at 5 in party order; empty falls back to the initiator', () => {
  const six = [1, 2, 3, 4, 5, 6].map((c) => cand(c));
  assert.deepEqual(selectRoster(1, 3, six, 1), [1, 2, 3, 4, 5]);
  assert.deepEqual(selectRoster(1, 3, [cand(1, { hp: 0 }), cand(2, { afk: true })], 1), [1]);
  assert.deepEqual(selectRoster(1, 3, [cand(1, { inBattle: true })], 1), [1]); // the initiator is never filtered by inBattle
});

test('enemy count range by roster size', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(enemyRange), [
    { min: 1, max: 2 }, { min: 2, max: 4 }, { min: 3, max: 5 }, { min: 4, max: 5 }, { min: 4, max: 5 },
  ]);
  assert.equal(groupEnemyCount(2, 10, () => 0), 2);
  assert.equal(groupEnemyCount(2, 10, () => 0.999), 4);
  assert.equal(groupEnemyCount(3, 10, () => 0.5), 4);
  assert.equal(groupEnemyCount(5, 10, () => 0.9), 5);
  assert.equal(groupEnemyCount(1, 10, () => 0.9), 2); // same as the solo roll
});

test('enemy count is capped by the distinct normal creatures', () => {
  assert.equal(groupEnemyCount(4, 2, () => 0.9), 2);
  assert.equal(groupEnemyCount(2, 1, () => 0), 1);
});

const f = (slot: number, o: Partial<{ side: 'player' | 'enemy'; kind: 'character' | 'creature'; alive: boolean }> = {}) => ({
  slot, side: 'player' as const, kind: 'character' as const, alive: true, ...o,
});

test('readiness: the round waits for every alive player character', () => {
  const board = [f(10), f(11), f(0, { side: 'enemy', kind: 'creature' })];
  assert.deepEqual(missingCommands(board, new Set(), new Set()), [10, 11]);
  assert.deepEqual(missingCommands(board, new Set([10]), new Set()), [11]);
  assert.deepEqual(missingCommands(board, new Set([10, 11]), new Set()), []);
});

test('readiness: dead characters and members that left do not block', () => {
  const board = [f(10), f(11, { alive: false }), f(12)];
  assert.deepEqual(missingCommands(board, new Set([10]), new Set()), [12]);
  assert.deepEqual(missingCommands(board, new Set([10]), new Set([12])), []);
});

test('reward split: floor division among survivors', () => {
  assert.equal(splitReward(100, 3), 33);
  assert.equal(splitReward(100, 1), 100);
  assert.equal(splitReward(7, 5), 1);
  assert.equal(splitReward(10, 0), 0);
});

test('survivors: alive player characters (or without an HP pool)', () => {
  assert.equal(isSurvivor({ side: 'player', kind: 'character', alive: true, hpMax: 50 }), true);
  assert.equal(isSurvivor({ side: 'player', kind: 'character', alive: false, hpMax: 50 }), false);
  assert.equal(isSurvivor({ side: 'player', kind: 'character', alive: false, hpMax: 0 }), true);
  assert.equal(isSurvivor({ side: 'enemy', kind: 'creature', alive: true, hpMax: 50 }), false);
});
