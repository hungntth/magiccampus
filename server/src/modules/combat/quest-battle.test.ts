// Unit tests for quest-battle NPC rules: sub_type parsing, quest / creature pick, enemy level.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QuestObjective } from '../quest/quest.schema';
import { parseSubTypeQuests, QUEST_BATTLE_NPC_TYPES, questBattleLevel, questBattleTargets } from './quest-battle';

const kill = (itemId: number, current: number, required: number): QuestObjective => ({ kind: 2, itemId, current, required });

test('sub_type parsing and the battle NPC types', () => {
  assert.deepEqual(parseSubTypeQuests('50|5418|5419'), [50, 5418, 5419]);
  assert.deepEqual(parseSubTypeQuests(''), []);
  assert.deepEqual(parseSubTypeQuests('0|x|7'), [7]);
  assert.deepEqual([10, 19, 20, 1].map((t) => QUEST_BATTLE_NPC_TYPES.has(t)), [true, true, true, false]);
});

test('NPC 475 / quest 50: one Kê Vương (creature 157)', () => {
  const active = [{ questId: 50, objectives: [kill(157, 0, 1)] }];
  assert.deepEqual(questBattleTargets('50|5418|5419', active), { questId: 50, creatureIds: [157] });
});

test('no listed quest active, or its kills already done, means the normal dialog', () => {
  assert.equal(questBattleTargets('50|5418', []), null);
  assert.equal(questBattleTargets('50', [{ questId: 49, objectives: [kill(157, 0, 1)] }]), null);
  assert.equal(questBattleTargets('50', [{ questId: 50, objectives: [kill(157, 1, 1)] }]), null);
});

test('one enemy per incomplete kill objective, in list order of the first active quest', () => {
  const active = [
    { questId: 5418, objectives: [kill(9, 0, 1)] },
    { questId: 50, objectives: [kill(157, 0, 3), kill(56, 3, 3), kill(4, 1, 2)] },
  ];
  assert.deepEqual(questBattleTargets('50|5418', active), { questId: 50, creatureIds: [157, 4] });
});

test('enemy level: max(1, min_level / 2), else spawn fallbacks', () => {
  assert.equal(questBattleLevel(5, 0, 2), 2);
  assert.equal(questBattleLevel(1, 0, 2), 1);
  assert.equal(questBattleLevel(0, 7, 2), 7);
  assert.equal(questBattleLevel(0, 0, 2), 2);
  assert.equal(questBattleLevel(0, 0, 0), 10);
});
