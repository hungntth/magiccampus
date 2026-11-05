// Quiz settlement plan: tiers, rank bags and buffs, zero points, note text.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BASIC_GET_EXP } from '@mc/shared';
import { quizMailText, settleNote, settlePlan, totalBags } from './quiz-rewards';

test('nothing for zero points', () => {
  assert.equal(settlePlan(0, 0, 50), null);
});

test('tiers 60 / 200 / 350 / 500 plus ranks 1-3 (3 / 2 / 1 bags and buffs 2098 / 2097 / 2096)', () => {
  assert.deepEqual(settlePlan(59, 5, 50), { exp: Math.floor(BASIC_GET_EXP[50] * 59 * 0.13), tierBags: 0, rankBags: 0, buffId: null });
  assert.deepEqual(settlePlan(60, 5, 50)?.tierBags, 1);
  const first = settlePlan(500, 0, 50)!;
  assert.deepEqual([first.tierBags, first.rankBags, first.buffId, totalBags(first)], [4, 3, 2098, 7]);
  const second = settlePlan(200, 1, 50)!;
  assert.deepEqual([second.tierBags, second.rankBags, second.buffId], [2, 2, 2097]);
  const third = settlePlan(10, 2, 50)!;
  assert.deepEqual([third.tierBags, third.rankBags, third.buffId], [0, 1, 2096]);
  assert.equal(settlePlan(10, 3, 50)?.buffId, null);
});

test('note mentions points, exp, bags and the rank buff', () => {
  const plan = settlePlan(100, 0, 50)!;
  const now = settleNote({ points: 100, plan, rank: 0, buffName: 'Hạng Nhất Trả Lời Câu Hỏi' });
  assert.match(now, /Bạn đạt 100 điểm, nhận được \d+ kinh nghiệm\./);
  assert.match(now, /Túi Quà Đố Vui x4 đã được gửi qua thư./);
  assert.match(now, /hạng 1, nhận hiệu ứng Hạng Nhất/);
  const plain = settleNote({ points: 100, plan, rank: 0, buffName: null, bagName: 'Túi Quà Tham Gia' });
  assert.match(plain, /Túi Quà Tham Gia x4 đã được gửi qua thư/);
  assert.doesNotMatch(plain, /hiệu ứng/);
});

test('mail text is the Go sentence with a 1-based rank', () => {
  assert.equal(quizMailText(350, 0), 'Chúc mừng bạn đạt 350 điểm, xếp hạng 1 trong Đố Vui Có Thưởng. Phần thưởng đính kèm thư.');
});
