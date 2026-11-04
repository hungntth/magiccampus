// Unit tests for the pure collect / kill objective rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QuestRequireRow, QuestTemplate } from '../gamedata/quest-data';
import {
  allMet, collectConsumption, collectItemIds, creditKills, incompleteKillTargets, initialObjectives, lootNeeds, petNeeds, questKillOf,
  syncCollect, syncPets,
} from './quest-progress';
import type { QuestObjective } from './quest.schema';

const tpl = (over: Partial<QuestTemplate> = {}): QuestTemplate => ({
  id: 47, name: 'q', info: '', startText: '', completeText: '', type: 1, startNpc: 430, finishNpc: 430, minLevel: 3,
  maxLevel: 0, gender: 2, reqClass: 'all', preQuestType: 1, awardExp: 1, moneyNum: 1, moneyType: 1, color: 0,
  startGrantItem: 0, startGrantQty: 0, ...over,
});
const row = (kind: number, itemId: number, num = 1): QuestRequireRow => ({ qid: 1, kind, type: kind === 1 ? 29 : 12, itemId, num, q: -1 });
const obj = (kind: number, itemId: number, current: number, required: number): QuestObjective => ({ kind, itemId, current, required });

test('initialObjectives: collect and kill start at 0, the grant item is pre-met', () => {
  const o = initialObjectives(tpl({ startGrantItem: 335 }), [row(1, 335), row(1, 516, 2), row(2, 157, 3)]);
  assert.deepEqual(o, [obj(1, 335, 1, 1), obj(1, 516, 0, 2), obj(2, 157, 0, 3)]);
  assert.equal(allMet(o), false);
  assert.equal(allMet([]), true);
});

test('syncCollect counts the bag capped at the requirement and leaves kill / grant rows alone', () => {
  const t = tpl({ startGrantItem: 335 });
  const base = [obj(1, 335, 1, 1), obj(1, 516, 0, 2), obj(2, 157, 1, 3)];
  const synced = syncCollect(t, base, new Map([[516, 5], [335, 0]]));
  assert.deepEqual(synced, [obj(1, 335, 1, 1), obj(1, 516, 2, 2), obj(2, 157, 1, 3)]);
  assert.equal(syncCollect(t, base, new Map())[1].current, 0);
  assert.equal(syncCollect(t, base, new Map([[516, 1]]))[1].current, 1);
  assert.deepEqual(collectItemIds(t, base), [516]);
});

test('collect completion: met only when the bag holds the full count; finishing consumes exactly that', () => {
  const t = tpl();
  const base = [obj(1, 516, 0, 1)];
  assert.equal(allMet(syncCollect(t, base, new Map())), false);
  assert.equal(allMet(syncCollect(t, base, new Map([[516, 1]]))), true);
  const dup = [obj(1, 516, 0, 2), obj(1, 516, 0, 1), obj(1, 30, 0, 1)];
  assert.deepEqual([...collectConsumption(t, dup)], [[516, 3], [30, 1]]);
  assert.equal(collectConsumption(tpl({ startGrantItem: 516 }), [obj(1, 516, 1, 1)]).size, 0);
});

test('kill credit: first incomplete matching objective, remaining count, never below 0', () => {
  const o = [obj(2, 157, 0, 1), obj(2, 4, 0, 2), obj(2, 4, 0, 1)];
  const r = creditKills(o, [4, 4, 4, 157, 999]);
  assert.equal(r.changed, true);
  assert.deepEqual(r.objectives, [obj(2, 157, 1, 1), obj(2, 4, 2, 2), obj(2, 4, 1, 1)]);
  assert.deepEqual(questKillOf(r.objectives), [{ creatureId: 157, num: 0 }, { creatureId: 4, num: 0 }, { creatureId: 4, num: 0 }]);
  assert.deepEqual(questKillOf([obj(2, 157, 0, 3), obj(1, 516, 0, 1)]), [{ creatureId: 157, num: 3 }]);
  assert.equal(creditKills(o, [999]).changed, false);
  assert.equal(creditKills([obj(2, 157, 1, 1)], [157]).changed, false); // already complete: no overflow
  assert.deepEqual(o[0], obj(2, 157, 0, 1)); // input is not mutated
});

test('quest-battle targets are the incomplete kill objectives, one per objective', () => {
  assert.deepEqual(incompleteKillTargets([obj(2, 157, 0, 5), obj(2, 4, 2, 2), obj(1, 516, 0, 1), obj(2, 56, 1, 3)]), [157, 56]);
});

test('lootNeeds sums requirements per item and carries the bag count', () => {
  const needs = lootNeeds(
    [{ tpl: tpl(), objectives: [obj(1, 516, 0, 1)] }, { tpl: tpl({ id: 48 }), objectives: [obj(1, 516, 0, 2), obj(2, 4, 0, 1)] }],
    new Map([[516, 1]]),
  );
  assert.deepEqual([...needs], [[516, { current: 1, required: 3 }]]);
});

test('pet objectives: sync counts matching pets (capped), petNeeds carries q; kill / collect rows are untouched', () => {
  const requires: QuestRequireRow[] = [
    { qid: 1, kind: 2, type: 12, itemId: 157, num: 1, q: -1 }, { qid: 1, kind: 3, type: 12, itemId: 32, num: 2, q: 16 },
  ];
  const base = [obj(2, 157, 1, 1), obj(3, 32, 0, 2)];
  const pets = [
    { id: 1, tid: 32, petName: 'Tiểu Nấm Yêu', growRate: 1.6 }, { id: 2, tid: 32, petName: 'Tiểu Nấm Yêu', growRate: 0.8 },
    { id: 3, tid: 32, petName: 'Bé', growRate: 2.2 }, { id: 4, tid: 32, petName: 'Tiểu Nấm Yêu', growRate: 2.2 },
  ];
  const synced = syncPets(base, requires, pets, () => 'Tiểu Nấm Yêu');
  assert.deepEqual(synced, [obj(2, 157, 1, 1), obj(3, 32, 2, 2)]); // ids 1 and 4 match (0.8 too low, renamed one out)
  assert.equal(syncPets(base, requires, pets.slice(0, 2), () => 'Tiểu Nấm Yêu')[1].current, 1);
  assert.deepEqual(petNeeds(base, requires), [{ creatureId: 32, q: 16, required: 2 }]);
  assert.equal(allMet(synced), true);
});
