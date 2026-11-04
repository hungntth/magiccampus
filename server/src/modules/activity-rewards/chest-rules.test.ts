// Tests for the chest description parser and the random pick.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChestDesc, pickFrom } from './chest-rules';

test('parses a white chest description', () => {
  const p = parseChestDesc('Có thể nhận: Loa, Thăng Tinh Thạch, Tiêu Diêu Phù Cao Cấp\r\nChắc chắn nhận：Pha Lê Ma Pháp');
  assert.deepEqual(p.pool, ['Loa', 'Thăng Tinh Thạch', 'Tiêu Diêu Phù Cao Cấp']);
  assert.deepEqual(p.sure, ['Pha Lê Ma Pháp']);
});

test('parses multi-line pools and several guaranteed items', () => {
  const p = parseChestDesc('Có thể mở ra: Tinh Linh Cầu, Tinh Hồn Thạch, Sách X3 Exp Pet, \r\nSách Gặp Địch Tại Chỗ, Loa Lớn Siêu Cấp \r\nChắc chắn nhận: Pha Lê Ma Pháp, Vĩnh Hằng Châu');
  assert.equal(p.pool.length, 5);
  assert.deepEqual(p.sure, ['Pha Lê Ma Pháp', 'Vĩnh Hằng Châu']);
});

test('text without markers yields nothing', () => {
  assert.deepEqual(parseChestDesc('Hoàn thành báo danh'), { pool: [], sure: [] });
});

test('pickFrom returns distinct names and tolerates small pools', () => {
  const seq = [0.99, 0];
  let i = 0;
  const rng = (): number => seq[i++ % seq.length];
  assert.deepEqual(pickFrom(['a', 'b', 'c'], 2, rng), ['c', 'a']);
  assert.deepEqual(pickFrom(['a'], 2, () => 0.5), ['a']);
  assert.deepEqual(pickFrom([], 2, () => 0.5), []);
});
