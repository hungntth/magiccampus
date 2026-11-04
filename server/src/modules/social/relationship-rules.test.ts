// Unit tests for the pure relationship rules: type check, caps, duplicates, self add, friend <-> black exclusion.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RelationLimits, RelationType } from '@mc/shared';
import { canDelete, isRelationType, normalizeName, planAdd, type RelationRow } from './relationship-rules';

const rows = (n: number, type: number, from = 100): RelationRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, targetId: from + i, type }));

describe('isRelationType / normalizeName', () => {
  it('accepts only friend (1) and black (2)', () => {
    assert.equal(isRelationType(1), true);
    assert.equal(isRelationType(2), true);
    for (const t of [0, 3, 6, '1', null, undefined]) assert.equal(isRelationType(t), false);
  });
  it('trims and validates names', () => {
    assert.equal(normalizeName('  Bob '), 'Bob');
    assert.equal(normalizeName(''), null);
    assert.equal(normalizeName('   '), null);
    assert.equal(normalizeName('a'.repeat(31)), null);
    assert.equal(normalizeName('a\nb'), null);
    assert.equal(normalizeName(42), null);
  });
});

describe('planAdd', () => {
  it('adds a new friend or black', () => {
    assert.deepEqual(planAdd([], 1, 2, RelationType.FRIEND), { ok: true, replaceId: null });
    assert.deepEqual(planAdd([], 1, 2, RelationType.BLACK), { ok: true, replaceId: null });
  });
  it('refuses self, bad type and duplicates', () => {
    assert.deepEqual(planAdd([], 1, 1, RelationType.FRIEND), { ok: false, reason: 'self' });
    assert.deepEqual(planAdd([], 1, 2, 3), { ok: false, reason: 'invalid-type' });
    assert.deepEqual(planAdd([{ id: 5, targetId: 2, type: 1 }], 1, 2, 1), { ok: false, reason: 'duplicate' });
  });
  it('friend <-> black replaces the opposite row', () => {
    assert.deepEqual(planAdd([{ id: 5, targetId: 2, type: 2 }], 1, 2, RelationType.FRIEND), { ok: true, replaceId: 5 });
    assert.deepEqual(planAdd([{ id: 6, targetId: 2, type: 1 }], 1, 2, RelationType.BLACK), { ok: true, replaceId: 6 });
  });
  it('enforces caps per type (120 friends, 30 black)', () => {
    assert.deepEqual(planAdd(rows(RelationLimits.FRIEND - 1, 1), 1, 9999, 1), { ok: true, replaceId: null });
    assert.deepEqual(planAdd(rows(RelationLimits.FRIEND, 1), 1, 9999, 1), { ok: false, reason: 'full' });
    assert.deepEqual(planAdd(rows(RelationLimits.BLACK, 2), 1, 9999, 2), { ok: false, reason: 'full' });
  });
  it('a full list of the other type does not block; a swap into a full list is refused', () => {
    assert.deepEqual(planAdd(rows(RelationLimits.BLACK, 2), 1, 9999, 1), { ok: true, replaceId: null });
    const full = [...rows(RelationLimits.BLACK, 2), { id: 1, targetId: 2, type: 1 }];
    assert.deepEqual(planAdd(full, 1, 2, 2), { ok: false, reason: 'full' });
  });
});

describe('canDelete', () => {
  it('only rows of the caller', () => {
    assert.equal(canDelete(rows(3, 1), 101), true);
    assert.equal(canDelete(rows(3, 1), 999), false);
  });
});
