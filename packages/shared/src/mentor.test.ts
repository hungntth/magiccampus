// Unit tests for the shared mentor contract: rank tables, upgrade gate, report gain and ll strings.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FIND_STUDENT_TEXT, FIND_TEACHER_TEXT, STUDENT_NUM, TEACHER_RANK_TITLES, TEACHER_UPGRADE_POINTS, canUpgradeTeacher, formatLl,
  parseLl, rankTitle, reportGain, studentCap, upgradePoints,
} from './mentor.js';

describe('rank tables', () => {
  it('has 7 ranks, student caps 0/5/../30 and 5 upgrade gates', () => {
    assert.equal(TEACHER_RANK_TITLES.length, 7);
    assert.deepEqual([...STUDENT_NUM], [0, 5, 10, 15, 20, 25, 30]);
    assert.equal(TEACHER_UPGRADE_POINTS.length, 6);
  });
  it('clamps out of range ranks', () => {
    assert.equal(studentCap(-1), 0);
    assert.equal(studentCap(99), 30);
    assert.equal(studentCap(1.5), 0);
    assert.equal(rankTitle(6), 'Vạn thánh chi sư');
    assert.equal(rankTitle(0), 'Không có');
  });
});

describe('canUpgradeTeacher', () => {
  it('needs rank 1..5 and the gate points (not spent)', () => {
    assert.equal(canUpgradeTeacher(0, 1e12), false);
    assert.equal(canUpgradeTeacher(1, 199_999), false);
    assert.equal(canUpgradeTeacher(1, 200_000), true);
    assert.equal(canUpgradeTeacher(2, 800_000), true);
    assert.equal(canUpgradeTeacher(5, 999_999_999), false);
    assert.equal(canUpgradeTeacher(5, 1_000_000_000), true);
    assert.equal(canUpgradeTeacher(6, 1e12), false);
    assert.equal(upgradePoints(6), Infinity);
  });
});

describe('reportGain', () => {
  const flat = (): number => 1000;
  it('is 10 % of the exp of every level gained, floored', () => {
    assert.equal(reportGain(10, 13, flat), 300);
    assert.equal(reportGain(10, 10, flat), 0);
    assert.equal(reportGain(10, 9, flat), 0);
    assert.equal(reportGain(0, 1, () => 19), 1);
  });
  it('sums per level before taking the share', () => {
    const exp = (l: number): number => l * 10;
    assert.equal(reportGain(1, 3, exp), Math.floor((20 + 30) * 0.1));
  });
});

describe('ll strings and texts', () => {
  it('formats and parses', () => {
    assert.equal(formatLl(30, 12.9), '30|12');
    assert.deepEqual(parseLl('30|12'), { level: 30, exp: 12 });
    assert.deepEqual(parseLl('x'), { level: 0, exp: 0 });
    assert.deepEqual(parseLl(undefined), { level: 0, exp: 0 });
  });
  it('has a text for every find code', () => {
    for (const f of [1, 2, 3, 4, 5, 6, 7]) assert.ok(FIND_TEACHER_TEXT[f]);
    for (const f of [1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(FIND_STUDENT_TEXT[f]);
  });
});
