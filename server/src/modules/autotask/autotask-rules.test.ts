// Unit tests for the pure auto-task rules: payload nesting, queueing and offline advance, cancel keeping floor(elapsed / time)
// battles, the gold quote, free-run counts, the start gate order and the clear check.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_TASKS, autoTaskFreeRuns, autoTaskGroupBase, autoTaskQuickGold, autoTaskReward, basicExp } from '@mc/shared';
import {
  advance, AT_TEXT, cancelTask, clearedAtLevel, emptyAutoState, enqueue, everCleared, finishNow, goldQuote, groupBusy, owesCompletion,
  payloadOf, rollDay, startRefusal, type DungeonGate, type StartCheck,
} from './autotask-rules';

const MIN = 60_000;
const BATTLE = 180_000;

test('the payload nests running / queue / finish under data and is {} when idle', () => {
  const st = emptyAutoState();
  assert.deepEqual(payloadOf(st, 120, 99), { todayNum: 2, useNum: 0, data: { data: {}, queue: {}, finish: {} }, ct: 99 });
  enqueue(st, 1, 1000, true);
  enqueue(st, 5, 1000, true);
  st.finish['2'] = 3;
  const p = payloadOf(st, 100, 2000);
  assert.deepEqual(p.data.data, { id: 1, st: 1000 });
  assert.deepEqual(p.data.queue, { '5': 1 });
  assert.deepEqual(p.data.finish, { '2': 3 });
  assert.equal(p.todayNum, 1);
});

test('one task runs, the next starts at the previous end (offline progress)', () => {
  const st = emptyAutoState();
  enqueue(st, 1, 0, false); // 6 battles = 18 min
  enqueue(st, 4, 0, false);
  assert.equal(advance(st, 17 * MIN), false);
  assert.equal(advance(st, 19 * MIN), true);
  assert.equal(st.finish['1'], AUTO_TASKS[1].battleCount);
  assert.deepEqual(st.run, { id: 4, st: 18 * MIN });
  assert.equal(advance(st, 18 * MIN + 7 * BATTLE + 1), true);
  assert.equal(st.finish['4'], 7);
  assert.equal(st.run, null);
});

test('a difficulty group holds one active / queued / unclaimed entry', () => {
  const st = emptyAutoState();
  enqueue(st, 5, 0, false);
  assert.equal(groupBusy(st, 4), true);
  assert.equal(groupBusy(st, 6), true);
  assert.equal(groupBusy(st, 7), false);
  assert.equal(autoTaskGroupBase(9), 7);
  assert.equal(autoTaskGroupBase(16), 16);
  assert.equal(autoTaskGroupBase(1), 1);
});

test('cancel keeps floor(elapsed / time) battles, at most count - 1; a queued task is dropped', () => {
  const st = emptyAutoState();
  enqueue(st, 4, 0, true);
  enqueue(st, 1, 0, true);
  assert.equal(cancelTask(st, 4, 2 * BATTLE + 5), true);
  assert.equal(st.finish['4'], 2);
  assert.deepEqual(st.run, { id: 1, st: 2 * BATTLE + 5 }); // the queued task started
  assert.ok(st.dg.includes(4));
  // before the first battle ends: nothing kept, dg flag dropped
  const st2 = emptyAutoState();
  enqueue(st2, 4, 0, true);
  assert.equal(cancelTask(st2, 4, BATTLE - 1), true);
  assert.deepEqual(st2.finish, {});
  assert.deepEqual(st2.dg, []);
  // the cap: elapsed past the end would be finished by advance, cancel itself caps at count - 1
  const st3 = emptyAutoState();
  enqueue(st3, 4, 0, true);
  cancelTask(st3, 4, 100 * BATTLE);
  assert.equal(st3.finish['4'], 6);
  // queued
  const st4 = emptyAutoState();
  enqueue(st4, 1, 0, true);
  enqueue(st4, 2, 0, true);
  assert.equal(cancelTask(st4, 2, 10), true);
  assert.deepEqual(st4.queue, []);
  assert.equal(cancelTask(st4, 2, 10), false);
  assert.equal(owesCompletion(st4, 1, 6), true);
  assert.equal(owesCompletion(st4, 1, 5), false);
});

test('gold quote = ceil(gold x remaining / total); queued tasks pay the full price', () => {
  const t = AUTO_TASKS[4]; // 7 battles, 10 gold
  const total = 7 * BATTLE;
  assert.equal(autoTaskQuickGold(t, total), 10);
  assert.equal(autoTaskQuickGold(t, total - 1), 10);
  assert.equal(autoTaskQuickGold(t, total / 2), 5);
  assert.equal(autoTaskQuickGold(t, 1), 1);
  assert.equal(autoTaskQuickGold(t, 0), 0);
  assert.equal(autoTaskQuickGold(AUTO_TASKS[6], (8 * BATTLE * 3) / 8), 5); // ceil(12 * 3 / 8) = 5
  const st = emptyAutoState();
  enqueue(st, 4, 0, false);
  enqueue(st, 1, 0, false);
  assert.equal(goldQuote(st, 4, total / 2), 5);
  assert.equal(goldQuote(st, 1, total / 2), 9);
  assert.equal(goldQuote(st, 2, 0), null);
});

test('finishNow turns the task into a full finish and starts the next queued one', () => {
  const st = emptyAutoState();
  enqueue(st, 1, 0, false);
  enqueue(st, 2, 0, false);
  assert.equal(finishNow(st, 1, 5000), true);
  assert.equal(st.finish['1'], 6);
  assert.deepEqual(st.run, { id: 2, st: 5000 });
  assert.equal(finishNow(st, 3, 5000), false);
});

test('free runs: lv 100-119 one, 120+ two, below none; the day key resets the counter only', () => {
  assert.deepEqual([99, 100, 119, 120, 160].map(autoTaskFreeRuns), [0, 1, 1, 2, 2]);
  const st = emptyAutoState();
  assert.equal(rollDay(st, '2026-11-05'), true);
  st.use = 2;
  enqueue(st, 1, 0, false);
  assert.equal(rollDay(st, '2026-11-05'), false);
  assert.equal(rollDay(st, '2026-11-06'), true);
  assert.equal(st.use, 0);
  assert.equal(st.run?.id, 1);
});

test('sweep reward: per-battle rounded exp, silver only for tasks 10-15 battles 1-5', () => {
  const per = Math.round(basicExp(120) * 1.5);
  assert.deepEqual(autoTaskReward(1, 6, 120), { exp: per * 6, moneyBind: 0 });
  const r = autoTaskReward(12, 8, 120);
  assert.equal(r.exp, Math.round(basicExp(120) * 3.12) * 8);
  assert.ok(r.moneyBind > 0);
  assert.equal(autoTaskReward(16, 1, 120).exp, Math.round(basicExp(120) * 2.5));
  assert.equal(autoTaskReward(12, 5, 120).moneyBind, autoTaskReward(12, 8, 120).moneyBind);
});

const gate = (p: Partial<DungeonGate> = {}): DungeonGate => ({
  name: 'Mê Huyễn Động', level: 50, ticketName: 'Hoa Mê Ảo', everCleared: true, clearedAtDifficulty: true, openRunToday: false, tickets: 1, ...p,
});
const check = (p: Partial<StartCheck> = {}): StartCheck => ({
  task: AUTO_TASKS[1], tid: 1, charLevel: 120, money: 10_000_000, books: 0, state: emptyAutoState(), gate: gate(), ...p,
});

test('start gate refusals follow Go order and strings', () => {
  assert.equal(startRefusal(check()), null);
  const busy = emptyAutoState();
  enqueue(busy, 1, 0, false);
  assert.equal(startRefusal(check({ state: busy })), AT_TEXT.BUSY);
  assert.equal(startRefusal(check({ money: 199_999 })), AT_TEXT.NO_MONEY);
  const spent = emptyAutoState();
  spent.use = 2;
  assert.equal(startRefusal(check({ state: spent })), AT_TEXT.NO_RUNS);
  assert.equal(startRefusal(check({ state: spent, books: 1 })), null);
  assert.equal(startRefusal(check({ charLevel: 90 })), AT_TEXT.NO_RUNS); // below 100: no free run
  assert.equal(startRefusal(check({ gate: null })), 'Mê Huyễn Động chưa mở, chưa thể tự động hoàn thành.');
  assert.equal(startRefusal(check({ gate: gate({ level: 130 }) })), 'Cần đạt cấp 130 mới có thể tự động hoàn thành Mê Huyễn Động.');
  assert.equal(
    startRefusal(check({ gate: gate({ everCleared: false }) })),
    'Cần tự mình hoàn thành Mê Huyễn Động ở độ khó này ít nhất 1 lần mới có thể tự động hoàn thành.',
  );
  assert.equal(startRefusal(check({ gate: gate({ clearedAtDifficulty: false }) })), AT_TEXT.NEVER_CLEARED('Mê Huyễn Động'));
  assert.match(startRefusal(check({ gate: gate({ openRunToday: true }) }))!, /^Ngươi đang trong lượt Mê Huyễn Động hôm nay/);
  assert.equal(startRefusal(check({ gate: gate({ tickets: 0 }) })), 'Cần mang theo 1 Hoa Mê Ảo để tự động hoàn thành Mê Huyễn Động.');
});

test('the clear check: any clear for one-difficulty dungeons, the difficulty itself otherwise', () => {
  assert.equal(clearedAtLevel(undefined, 3, 2), true); // stamped before levels were recorded
  assert.equal(clearedAtLevel([1], 3, 1), true);
  assert.equal(clearedAtLevel([1], 3, 2), false);
  assert.equal(clearedAtLevel([1], 1, 2), true);
  assert.equal(everCleared(undefined, undefined), false);
  assert.equal(everCleared(5, undefined), true);
  assert.equal(everCleared(undefined, 5), true);
});
