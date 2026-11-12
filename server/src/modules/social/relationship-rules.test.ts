// Unit tests for the pure relationship rules: types, caps (friend 120 / black 30 / enemy 100), exclusivity with the Go texts,
// friend / enemy <-> black swaps, delete guard for feature-owned rows, bond lookup and the intimacy math.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RelationLimits, RelationType } from '@mc/shared';
import {
  MANAGED_DELETE_TEXT, TAKEN_TEXT, applyIntimacy, canDelete, hasBond, isRelationType, limitFor, normalizeName, planAdd, planDelete,
  refusalText, setCloseNum, type RelationRow,
} from './relationship-rules';

const rows = (n: number, type: number, from = 100): RelationRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: from + i, targetId: from + i, type }));

describe('isRelationType / normalizeName / limitFor', () => {
  it('accepts only friend (1), black (2) and enemy (3) by name', () => {
    for (const t of [1, 2, 3]) assert.equal(isRelationType(t), true);
    for (const t of [0, 4, 5, 6, 7, '1', null, undefined]) assert.equal(isRelationType(t), false);
  });
  it('trims and validates names', () => {
    assert.equal(normalizeName('  Bob '), 'Bob');
    assert.equal(normalizeName(''), null);
    assert.equal(normalizeName('   '), null);
    assert.equal(normalizeName('a'.repeat(31)), null);
    assert.equal(normalizeName('a\nb'), null);
    assert.equal(normalizeName(42), null);
  });
  it('caps', () => {
    assert.equal(limitFor(RelationType.FRIEND), 120);
    assert.equal(limitFor(RelationType.BLACK), 30);
    assert.equal(limitFor(RelationType.ENEMY), 100);
    assert.equal(limitFor(RelationType.TUTOR), Infinity);
  });
});

describe('planAdd', () => {
  it('adds a new friend, black or enemy', () => {
    for (const t of [1, 2, 3]) assert.deepEqual(planAdd([], 1, 2, t), { ok: true, replaceId: null });
  });
  it('refuses self, bad type and duplicates with the type kept for the text', () => {
    assert.deepEqual(planAdd([], 1, 1, RelationType.FRIEND), { ok: false, reason: 'self' });
    assert.deepEqual(planAdd([], 1, 2, 4), { ok: false, reason: 'invalid-type' });
    assert.deepEqual(planAdd([{ id: 5, targetId: 2, type: 1 }], 1, 2, 1), { ok: false, reason: 'duplicate', type: 1 });
    assert.deepEqual(planAdd([{ id: 5, targetId: 2, type: 3 }], 1, 2, 3), { ok: false, reason: 'duplicate', type: 3 });
  });
  it('friend <-> black and enemy <-> black swap the row', () => {
    assert.deepEqual(planAdd([{ id: 5, targetId: 2, type: 2 }], 1, 2, RelationType.FRIEND), { ok: true, replaceId: 5 });
    assert.deepEqual(planAdd([{ id: 5, targetId: 2, type: 2 }], 1, 2, RelationType.ENEMY), { ok: true, replaceId: 5 });
    assert.deepEqual(planAdd([{ id: 6, targetId: 2, type: 1 }], 1, 2, RelationType.BLACK), { ok: true, replaceId: 6 });
    assert.deepEqual(planAdd([{ id: 7, targetId: 2, type: 3 }], 1, 2, RelationType.BLACK), { ok: true, replaceId: 7 });
  });
  it('friend / enemy / couple / tutor / brother exclude each other', () => {
    for (const existing of [1, 3, 4, 5, 6]) {
      for (const type of [1, 3]) {
        if (existing === type) continue;
        assert.deepEqual(planAdd([{ id: 5, targetId: 2, type: existing }], 1, 2, type), { ok: false, reason: 'taken' }, `${existing}->${type}`);
      }
    }
  });
  it('a feature-owned row also refuses a blacklist add', () => {
    for (const existing of [4, 5, 6]) {
      assert.deepEqual(planAdd([{ id: 5, targetId: 2, type: existing }], 1, 2, RelationType.BLACK), { ok: false, reason: 'taken' });
    }
  });
  it('enforces caps per type (120 / 30 / 100)', () => {
    assert.deepEqual(planAdd(rows(RelationLimits.FRIEND - 1, 1), 1, 9999, 1), { ok: true, replaceId: null });
    assert.deepEqual(planAdd(rows(RelationLimits.FRIEND, 1), 1, 9999, 1), { ok: false, reason: 'full', type: 1 });
    assert.deepEqual(planAdd(rows(RelationLimits.BLACK, 2), 1, 9999, 2), { ok: false, reason: 'full', type: 2 });
    assert.deepEqual(planAdd(rows(RelationLimits.ENEMY - 1, 3), 1, 9999, 3), { ok: true, replaceId: null });
    assert.deepEqual(planAdd(rows(RelationLimits.ENEMY, 3), 1, 9999, 3), { ok: false, reason: 'full', type: 3 });
  });
  it('tutor / couple / brother rows do not count towards the friend cap', () => {
    assert.deepEqual(planAdd([...rows(RelationLimits.FRIEND - 1, 1), ...rows(10, 5, 500)], 1, 9999, 1), { ok: true, replaceId: null });
  });
  it('a full list of another type does not block; a swap into a full list is refused', () => {
    assert.deepEqual(planAdd(rows(RelationLimits.BLACK, 2), 1, 9999, 1), { ok: true, replaceId: null });
    const full = [...rows(RelationLimits.BLACK, 2), { id: 1, targetId: 2, type: 1 }];
    assert.deepEqual(planAdd(full, 1, 2, 2), { ok: false, reason: 'full', type: 2 });
  });
});

describe('refusalText', () => {
  it('uses the Go texts', () => {
    assert.equal(refusalText('taken'), TAKEN_TEXT);
    assert.equal(TAKEN_TEXT, 'Người này đã có quan hệ khác với bạn, hãy xóa quan hệ cũ trước!');
    assert.equal(refusalText('duplicate', 1), 'Bạn bè đã tồn tại!');
    assert.equal(refusalText('duplicate', 2), 'Danh sách đen đã tồn tại!');
    assert.equal(refusalText('duplicate', 3), 'Kẻ thù đã tồn tại');
    assert.equal(refusalText('full', 3), 'Danh sách đã đạt giới hạn 100 người, vui lòng xóa bớt trước khi thêm!');
    assert.equal(refusalText('full', 2), 'Danh sách đã đạt giới hạn 30 người, vui lòng xóa bớt trước khi thêm!');
  });
});

describe('planDelete / canDelete / hasBond', () => {
  it('only rows of the caller', () => {
    assert.equal(canDelete(rows(3, 1), 101), true);
    assert.equal(canDelete(rows(3, 1), 999), false);
    assert.deepEqual(planDelete(rows(3, 1), 999), { ok: false, reason: 'missing' });
  });
  it('friend, black and enemy rows can be deleted; couple / tutor / brother rows are refused', () => {
    for (const t of [1, 2, 3]) assert.equal(planDelete([{ id: 9, targetId: 2, type: t }], 9).ok, true);
    for (const t of [4, 5, 6]) assert.deepEqual(planDelete([{ id: 9, targetId: 2, type: t }], 9), { ok: false, reason: 'managed' });
    assert.equal(MANAGED_DELETE_TEXT, 'Hãy giải trừ quan hệ ở chức năng tương ứng');
  });
  it('hasBond counts friend / couple / tutor / brother only', () => {
    for (const t of [1, 4, 5, 6]) assert.equal(hasBond([{ id: 1, targetId: 2, type: t }], 2), true);
    for (const t of [2, 3]) assert.equal(hasBond([{ id: 1, targetId: 2, type: t }], 2), false);
    assert.equal(hasBond([{ id: 1, targetId: 3, type: 1 }], 2), false);
  });
});

describe('intimacy math', () => {
  it('adds and floors at 0', () => {
    assert.deepEqual(applyIntimacy(10, 660), { value: 670, applied: 660 });
    assert.deepEqual(applyIntimacy(0, 6), { value: 6, applied: 6 });
    assert.deepEqual(applyIntimacy(1000, -2500), { value: 0, applied: -1000 });
    assert.deepEqual(applyIntimacy(3000, -2500), { value: 500, applied: -2500 });
    assert.deepEqual(applyIntimacy(0, -50), { value: 0, applied: 0 });
  });
  it('onSetClose num is the total for a gain and the negative delta for a drop', () => {
    assert.equal(setCloseNum(6, 666), 666);
    assert.equal(setCloseNum(-2500, 500), -2500);
    assert.equal(setCloseNum(0, 0), 0);
  });
});
