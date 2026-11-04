// Unit tests for quest.rules: req_class parsing, accept gating, supported filter, exp/level-up, NPC states.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { QuestPreRow, QuestTemplate } from '../gamedata/quest-data';
import { applyExp, canAccept, isSupported, npcQuestStates, npcStateOf, parseReqClass } from './quest.rules';

function tpl(over: Partial<QuestTemplate> = {}): QuestTemplate {
  return {
    id: 1, name: 'q', info: '', startText: '', completeText: '', type: 1, startNpc: 240, finishNpc: 231,
    minLevel: 1, maxLevel: 160, gender: 2, reqClass: 'all', preQuestType: 1, awardExp: 48, moneyNum: 100,
    moneyType: 1, color: 0, startGrantItem: 0, startGrantQty: 0, ...over,
  };
}
const ch = { level: 1, gender: 0, classId: 1 };
const none = new Set<number>();
const pre2 = (qid: number, ...ids: number[]): QuestPreRow[] => ids.map((itemId) => ({ qid, kind: 2, itemId, num: 1, type: -1 }));

test('parseReqClass', () => {
  assert.deepEqual(parseReqClass('all'), []);
  assert.deepEqual(parseReqClass('0'), []);
  assert.deepEqual(parseReqClass(''), []);
  assert.deepEqual(parseReqClass('|1|'), [1]);
  assert.deepEqual(parseReqClass('|1|3|'), [1, 3]);
});

test('canAccept: active / done / level window', () => {
  assert.equal(canAccept(ch, tpl(), none, none, []), true);
  assert.equal(canAccept(ch, tpl(), new Set([1]), none, []), false);
  assert.equal(canAccept(ch, tpl(), none, new Set([1]), []), false);
  assert.equal(canAccept(ch, tpl({ minLevel: 2 }), none, none, []), false);
  assert.equal(canAccept({ ...ch, level: 5 }, tpl({ maxLevel: 4 }), none, none, []), false);
  assert.equal(canAccept({ ...ch, level: 500 }, tpl({ maxLevel: 0 }), none, none, []), true);
});

test('canAccept: class and gender', () => {
  assert.equal(canAccept(ch, tpl({ reqClass: '|1|' }), none, none, []), true);
  assert.equal(canAccept(ch, tpl({ reqClass: '|6|' }), none, none, []), false);
  assert.equal(canAccept(ch, tpl({ gender: 2 }), none, none, []), true);
  assert.equal(canAccept(ch, tpl({ gender: 1 }), none, none, []), false);
  assert.equal(canAccept(ch, tpl({ gender: 0 }), none, none, []), true);
});

test('canAccept: pre quests AND / OR / ignored, item pre rejects', () => {
  const t = tpl({ id: 2 });
  assert.equal(canAccept(ch, { ...t, preQuestType: 1 }, none, new Set([3]), pre2(2, 3, 6)), false);
  assert.equal(canAccept(ch, { ...t, preQuestType: 1 }, none, new Set([3, 6]), pre2(2, 3, 6)), true);
  assert.equal(canAccept(ch, { ...t, preQuestType: 2 }, none, new Set([6]), pre2(2, 3, 6)), true);
  assert.equal(canAccept(ch, { ...t, preQuestType: 2 }, none, none, pre2(2, 3, 6)), false);
  assert.equal(canAccept(ch, { ...t, preQuestType: 0 }, none, none, pre2(2, 3, 6)), true);
  assert.equal(canAccept(ch, t, none, none, [{ qid: 2, kind: 1, itemId: 191, num: 1, type: 29 }]), false);
});

test('isSupported', () => {
  assert.equal(isSupported(tpl(), []), true);
  assert.equal(isSupported(tpl({ type: 6 }), []), false);
  const granted = tpl({ id: 160, startGrantItem: 335, startGrantQty: 1 });
  assert.equal(isSupported(granted, [{ qid: 160, kind: 1, type: 29, itemId: 335, num: 1, q: -1 }]), true);
  assert.equal(isSupported(granted, [{ qid: 160, kind: 1, type: 29, itemId: 336, num: 1, q: -1 }]), true); // plain collect
  assert.equal(isSupported(tpl(), [{ qid: 1, kind: 3, type: 12, itemId: 5, num: 1, q: -1 }]), false); // pet objective
  assert.equal(isSupported(tpl(), [{ qid: 1, kind: 1, type: 19, itemId: 5, num: 1, q: -1 }]), false); // equipment
  assert.equal(isSupported(tpl(), [{ qid: 1, kind: 1, type: 29, itemId: 5, num: 1, q: 2 }]), false); // quality filter
});

test('isSupported: quests 47-50 (collect 516 / 30 / 1684, kill creature 157)', () => {
  const collect = (qid: number, itemId: number) => [{ qid, kind: 1, type: 29, itemId, num: 1, q: -1 }];
  assert.equal(isSupported(tpl({ id: 47, minLevel: 3 }), collect(47, 516)), true);
  assert.equal(isSupported(tpl({ id: 48, minLevel: 3 }), collect(48, 30)), true);
  assert.equal(isSupported(tpl({ id: 49, minLevel: 3 }), collect(49, 1684)), true);
  assert.equal(isSupported(tpl({ id: 50, minLevel: 5 }), [{ qid: 50, kind: 2, type: 12, itemId: 157, num: 1, q: 1 }]), true);
  assert.equal(isSupported(tpl({ id: 50, type: 6 }), [{ qid: 50, kind: 2, type: 12, itemId: 157, num: 1, q: 1 }]), false);
});

test('applyExp: level-up thresholds and cap', () => {
  const a = applyExp({ level: 1, exp: 0, attrPoints: 0 }, 48);
  assert.deepEqual(a, { level: 1, exp: 48, attrPoints: 0, statGain: 0, leveled: false });
  const b = applyExp(a, 53);
  assert.deepEqual(b, { level: 2, exp: 101, attrPoints: 5, statGain: 1, leveled: true });
  const c = applyExp({ level: 1, exp: 0, attrPoints: 0 }, 1_000_000);
  assert.equal(c.level, 20);
  assert.equal(c.attrPoints, 95);
  assert.equal(applyExp({ level: 20, exp: 456403, attrPoints: 0 }, 500_000).level, 20);
});

test('npc quest states 102 / 103 / 104 / -1', () => {
  const q1 = tpl({ id: 1, startNpc: 240, finishNpc: 231 });
  const q3 = tpl({ id: 3, startNpc: 231, finishNpc: 232 });
  assert.equal(npcStateOf(npcQuestStates(240, [q1], [])), 102);
  assert.equal(npcStateOf(npcQuestStates(231, [], [{ tpl: q1, met: false }])), 103);
  const s = npcQuestStates(231, [q3], [{ tpl: q1, met: true }]);
  assert.equal(s.get(3), 102);
  assert.equal(s.get(1), 104);
  assert.equal(npcStateOf(s), 104);
  assert.equal(npcStateOf(npcQuestStates(999, [q1], [])), -1);
  // active quest finishing at its start NPC overrides the offer entry
  const q46 = tpl({ id: 46, startNpc: 430, finishNpc: 430 });
  assert.equal(npcQuestStates(430, [q46], [{ tpl: q46, met: true }]).get(46), 104);
});
