// Pure helpers of the Năng Lượng Tự Nhiên window (run from server/: node --test --import tsx ../client/src/ui/astrology/astrologyRules.test.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AstrologicData } from '@mc/shared';
import { formulaRows, keepStars, pickConfirm, pickLabel, recordLines, refreshConfirm, refreshLabel, resultLine } from './astrologyRules';

const data = (over: Partial<AstrologicData> = {}): AstrologicData => ({
  award: [], award_record: [], buyPickCount: 2, formula: [[1, 2], null, null, null, null, null], pickCount: 0, refreshCount: 3, starsNow: [], starsToPick: [], ...over,
});

test('formula rows: shown and hidden', () => {
  const rows = formulaRows(data());
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0].tokens, ['Thổ', 'Diệm']);
  assert.equal(rows[0].hidden, false);
  assert.deepEqual(rows[4].tokens, ['?', '?', '?', '?']);
  assert.equal(rows[2].lookCost, 280);
});

test('labels and confirms', () => {
  assert.match(pickLabel(data()), /7 vàng/);
  assert.match(pickLabel(data({ pickCount: 5 })), /5\/12/);
  assert.equal(pickConfirm(data({ pickCount: 1 })), null);
  assert.match(pickConfirm(data()) ?? '', /7 vàng/);
  assert.match(refreshLabel(data()), /3\/10/);
  assert.equal(refreshConfirm(data()), null);
  assert.notEqual(refreshConfirm(data({ refreshCount: 0 })), null);
});

test('records newest first, result line, keep window', () => {
  assert.deepEqual(recordLines([{ aid: '0', cid: 1, name: 'A' }, { aid: '3', cid: 2, name: 'B' }]), ['Hàng 4: B', 'Hàng 1: A']);
  assert.match(resultLine({ aid: 90, fid: '0', formula: [1, 2], mult: 10, stars: [] }), /990.*\(1\)/);
  assert.match(resultLine(undefined), /12/);
  assert.deepEqual(keepStars([1, 2, 3, 4], 5), [2, 3, 4, 5]);
});
