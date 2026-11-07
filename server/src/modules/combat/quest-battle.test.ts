// Unit tests for quest-battle NPC rules: sub_type parsing, quest / creature pick, enemy level.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QuestObjective } from '../quest/quest.schema';
import { parseSubTypeQuests, QUEST_BATTLE_NPC_TYPES, questBattleLevel, questBattleTargets, weakenQuestEnemy } from './quest-battle';

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

test('no sub_type list: the active quests this NPC gives or takes (NPC 600 / quest 645, six Khảo Quan)', () => {
  const khaoQuan = [94, 96, 99, 216, 92, 330].map((c) => kill(c, 0, 1));
  const active = [
    { questId: 643, objectives: [] },
    { questId: 7, objectives: [kill(5, 0, 1)] },
    { questId: 645, objectives: khaoQuan },
  ];
  const ofNpc600 = (q: number): boolean => q === 643 || q === 645;
  assert.deepEqual(questBattleTargets('', active, ofNpc600), { questId: 645, creatureIds: [94, 96, 99, 216, 92, 330] });
  assert.deepEqual(questBattleTargets('-1', active, ofNpc600)?.questId, 645);
  assert.equal(questBattleTargets('', [{ questId: 645, objectives: khaoQuan.map((o) => ({ ...o, current: 1 })) }], ofNpc600), null);
  assert.equal(questBattleTargets('', active), null);
});

test('quest 645 enemies: HP, attacks and defenses / 10, other quests untouched', () => {
  const f = { hp: 7000, hpMax: 7800, attack: 455, magicAttack: 5, defense: 905, magicDefense: 640, speed: 300 };
  weakenQuestEnemy(f, 645);
  assert.deepEqual(f, { hp: 780, hpMax: 780, attack: 45, magicAttack: 1, defense: 90, magicDefense: 64, speed: 300 });
  const g = { hp: 100, hpMax: 100, attack: 50, magicAttack: 50, defense: 50, magicDefense: 50 };
  weakenQuestEnemy(g, 50);
  assert.deepEqual(g, { hp: 100, hpMax: 100, attack: 50, magicAttack: 50, defense: 50, magicDefense: 50 });
});

test('enemy level: max(1, min_level / 2), else spawn fallbacks', () => {
  assert.equal(questBattleLevel(5, 0, 2), 2);
  assert.equal(questBattleLevel(1, 0, 2), 1);
  assert.equal(questBattleLevel(0, 7, 2), 7);
  assert.equal(questBattleLevel(0, 0, 2), 2);
  assert.equal(questBattleLevel(0, 0, 0), 10);
});
