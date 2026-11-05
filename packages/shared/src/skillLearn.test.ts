// Tests for the skill window rules: expSkill pool and the learn-button gate.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEVEL_EXP } from './character.js';
import { canLearn, classRankText, levelFloor, skillPool, type SkillLearnView } from './skillLearn.js';

const row = (o: Partial<SkillLearnView> = {}): SkillLearnView => ({
  sid: 3857, nextSid: 3873, name: 'Luyện Sinh Mệnh Sơ Cấp', level: 1, useEnv: 3, kind: 5, type: 11, iconCode: '0', learned: true,
  reqLevel: 60, reqCl: 1, expSkill: 500000, price: 18000, bookTid: 0, bookName: '', description: '', useMp: 0, targetType: 0, ...o,
});
const facts = { level: 60, cl: 1, pool: 500000, money: 0, moneyBind: 18000 };

test('skillPool is exp above the level floor, never negative', () => {
  assert.equal(skillPool(LEVEL_EXP[9] + 123, 10), 123);
  assert.equal(skillPool(0, 10), 0);
  assert.equal(levelFloor(1), LEVEL_EXP[0]);
});

test('canLearn: every requirement', () => {
  assert.equal(canLearn(row(), facts), true);
  assert.equal(canLearn(row(), { ...facts, level: 59 }), false);
  assert.equal(canLearn(row(), { ...facts, pool: 499999 }), false);
  assert.equal(canLearn(row(), { ...facts, moneyBind: 17999 }), false);
  assert.equal(canLearn(row(), { ...facts, moneyBind: 0, money: 18000 }), true);
  assert.equal(canLearn(row(), { ...facts, cl: 0 }), false);
  assert.equal(canLearn(row({ nextSid: 0 }), facts), false);
  assert.equal(canLearn(row({ reqCl: 10 }), { ...facts, cl: 10 }), false);
});

test('canLearn: an unlearned book skill needs the book', () => {
  const book = row({ learned: false, useEnv: 0, reqCl: 0, expSkill: 0, price: 0 });
  assert.equal(canLearn(book, facts), false);
  assert.equal(canLearn(book, { ...facts, hasBook: true }), true);
  assert.equal(canLearn(row({ learned: false }), facts), true); // training rows need no book
});

test('classRankText', () => {
  assert.equal(classRankText(1, 1), 'Bạn đã phổ cập thành: Sơ Cấp Chiến Binh');
});
