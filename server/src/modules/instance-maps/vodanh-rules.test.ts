// Tests for the Vô Danh Động entry rules (level first, then the carried book).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { caveRefusal, VO_DANH, VO_DANH_TEXT } from './vodanh-rules';

test('floor 1 needs level 50 and the book', () => {
  assert.equal(caveRefusal(49, VO_DANH.MIN_LEVEL_1, 1), VO_DANH_TEXT.LEVEL(50));
  assert.equal(caveRefusal(50, VO_DANH.MIN_LEVEL_1, 0), VO_DANH_TEXT.NO_BOOK);
  assert.equal(caveRefusal(50, VO_DANH.MIN_LEVEL_1, 1), null);
});

test('floor 2 needs level 95 (the level is checked before the book)', () => {
  assert.equal(caveRefusal(94, VO_DANH.MIN_LEVEL_2, 0), VO_DANH_TEXT.LEVEL(95));
  assert.equal(caveRefusal(95, VO_DANH.MIN_LEVEL_2, 1), null);
});
