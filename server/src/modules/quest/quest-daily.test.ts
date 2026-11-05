// Type-6 daily done-today semantics and the rt / rn turn-in cost (M10 phase A).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QuestType, startOfDayMs } from '@mc/shared';
import { costRefusal, doneQuestIds, requireCost } from './quest-daily';
import { isSupported } from './quest.rules';
import type { QuestTemplate } from '../gamedata/quest-data';

const now = Date.UTC(2026, 10, 5, 5, 0, 0); // 12:00 UTC+7
const today = new Date(startOfDayMs(now) + 60_000);
const yesterday = new Date(startOfDayMs(now) - 60_000);
const types: Record<number, number> = { 5239: QuestType.DAILY, 1: QuestType.NEWHAND, 900: QuestType.LOOP };

test('a daily counts as done only when finished today (UTC+7); other types once ever; loops never', () => {
  const done = doneQuestIds(
    [{ questId: 5239, completedAt: yesterday }, { questId: 1, completedAt: yesterday }, { questId: 900, completedAt: today }],
    (q) => types[q], now,
  );
  assert.deepEqual([...done], [1]);
  assert.deepEqual([...doneQuestIds([{ questId: 5239, completedAt: today }], (q) => types[q], now)], [5239]);
  assert.deepEqual([...doneQuestIds([{ questId: 5239, completedAt: null }], (q) => types[q], now)], []);
});

test('rt 1-4 map to the four wallets; zero or unknown kinds cost nothing', () => {
  assert.deepEqual(requireCost({ rt: 2, rn: 100_000 }), { key: 'money', amount: 100_000 });
  assert.deepEqual(requireCost({ rt: 4, rn: 20 }), { key: 'gold', amount: 20 });
  assert.equal(requireCost({ rt: 10, rn: 1000 }), null); // Chiến tích: no H5 wallet
  assert.equal(requireCost({ rt: 2, rn: 0 }), null);
  assert.equal(costRefusal('money'), 'Không đủ Bạc!');
});

test('type-6 quests are supported (the openers have no require rows)', () => {
  const tpl = { id: 5239, type: QuestType.DAILY, startGrantItem: 0 } as QuestTemplate;
  assert.equal(isSupported(tpl, []), true);
});
