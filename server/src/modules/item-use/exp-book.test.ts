// Tests of the exp book precedence rule and the book tables.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strongerExpBuff, type ActiveBuffRef } from './exp-book';
import { ENCOUNTER_BOOKS, EXP_BOOKS, KEPT_SCROLL_NAME } from './tables/books';

const tpl = (...slots: [number, number][]): Record<string, unknown> => {
  const t: Record<string, unknown> = { percent_flag: 1 };
  slots.forEach(([p, n], i) => {
    t[`prop${i + 1}`] = p;
    t[`prop_num${i + 1}`] = n;
  });
  return t;
};
const x15 = tpl([24, 150], [25, 150]);
const x3 = tpl([24, 300], [25, 300]);
const x5 = tpl([24, 500], [25, 500]);
const pet3 = tpl([25, 300]);
const ref = (buffId: number, name: string, t: Record<string, unknown>): ActiveBuffRef => ({ buffId, name, tpl: t });

test('a weaker book is refused while a stronger buff is active', () => {
  assert.equal(strongerExpBuff(281, x15, [ref(762, 'X3 Exp', x3)]), 'X3 Exp');
  assert.equal(strongerExpBuff(762, x3, [ref(764, 'X5 Exp', x5)]), 'X5 Exp');
});

test('a stronger or equal-new book is allowed; the same buff never blocks itself', () => {
  assert.equal(strongerExpBuff(764, x5, [ref(762, 'X3 Exp', x3)]), null);
  assert.equal(strongerExpBuff(762, x3, [ref(762, 'X3 Exp', x3)]), null);
  assert.equal(strongerExpBuff(281, x15, []), null);
});

test('the pet book only competes on the pet rate', () => {
  assert.equal(strongerExpBuff(1538, pet3, [ref(762, 'X3 Exp', x3)]), 'X3 Exp'); // x3 covers char 1 and pet 3
  assert.equal(strongerExpBuff(1538, pet3, [ref(281, '1.5 Exp', x15)]), null);
  assert.equal(strongerExpBuff(762, x3, [ref(1538, 'x3 Pet', pet3)]), null); // pet-only does not cover the char rate
});

test('a buff without exp rates blocks nothing; a non-exp book is never refused', () => {
  assert.equal(strongerExpBuff(281, x15, [ref(9, 'Other', tpl([27, 4]))]), null);
  assert.equal(strongerExpBuff(9, tpl([27, 4]), [ref(762, 'X3 Exp', x3)]), null);
});

test('book tables follow the Go ids', () => {
  assert.equal(Object.keys(EXP_BOOKS).length, 9);
  assert.deepEqual(EXP_BOOKS[1142], { buffId: 764, seconds: 3600 });
  assert.deepEqual(ENCOUNTER_BOOKS[1873], { buffId: 1203, seconds: 21600 });
  assert.equal(ENCOUNTER_BOOKS[327].buffId, 313);
  assert.equal(KEPT_SCROLL_NAME.test('Đông Huyền Hồi Phù'), true);
  assert.equal(KEPT_SCROLL_NAME.test('Bí Điển Thần Binh Cấp 2【Tốn Phí】'), false);
});
