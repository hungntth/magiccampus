// Unit tests for the shared skill rules: category mapping, MP cost fraction vs absolute, labels.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBattleSkill, skillCategory, skillMpCost, skillMpLabel, skillNoMpMessage, skillTargetsEnemy } from './skill.ts';

test('skill types map to battle categories', () => {
  assert.equal(skillCategory(1), 'melee');
  assert.equal(skillCategory(2), 'ranged');
  assert.equal(skillCategory(3), 'magic');
  assert.equal(skillCategory(5), 'heal');
  assert.equal(skillCategory(11), 'passive');
  assert.equal(isBattleSkill(11), false);
  assert.equal(isBattleSkill(6), false);
  assert.equal(isBattleSkill(1), true);
  assert.equal(skillTargetsEnemy(5), false);
  assert.equal(skillTargetsEnemy(3), true);
});

test('MP cost: below 1 is a fraction of max MP, from 1 absolute', () => {
  assert.equal(skillMpCost(10, 200), 10);
  assert.equal(skillMpCost(0.05, 200), 10);
  assert.equal(skillMpCost(0.05, 50), 3); // ceil(2.5)
  assert.equal(skillMpCost(0.001, 50), 1); // never free
  assert.equal(skillMpCost(0, 200), 0);
  assert.equal(skillMpCost(1, 200), 1);
});

test('labels', () => {
  assert.equal(skillMpLabel(0.05), '5%');
  assert.equal(skillMpLabel(20), '20');
  assert.equal(skillNoMpMessage('Phi Vũ'), 'MP không đủ, không thể sử dụng kỹ năng [Phi Vũ] ');
});
