// Tests for the TXKC state rules: season / day / week roll-overs, the period bounds, task progress from diary counts, the payload.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TXKC_DAILY_TASKS, TXKC_WEEKLY_TASKS } from '@mc/shared';
import { addTxkcExp, buildTxkcData, newTxkc, rollTxkc, taskDef, taskDone, taskProgress, txkcPeriod } from './txkc-rules';

const at = (y: number, m: number, d: number, h = 5): number => Date.UTC(y, m - 1, d, h); // 12:00 UTC+7 by default

test('the period is the calendar month, with the Monday of the week and the days left', () => {
  const p = txkcPeriod(at(2026, 11, 5)); // Thursday
  assert.deepEqual(p, { season: '2026-11', day: '2026-11-05', week: '2026-11-02', start: '2026-11-01', end: '2026-11-30', days: 26 });
  assert.equal(txkcPeriod(at(2026, 2, 28)).end, '2026-02-28');
  assert.equal(txkcPeriod(at(2026, 12, 31)).days, 1);
});

test('rolling: a new season wipes, a new day closes the dailies, a new week clears the weekly claims', () => {
  const p0 = txkcPeriod(at(2026, 11, 5));
  const s = newTxkc(p0);
  Object.assign(s, { exp: 1300, adv: 1, awd1: 2, awd2: 1, dopen: 1, dc: { '1': 1 }, sp: 4, wc: { '2': 1 } });
  const sameDay = rollTxkc(s, p0);
  assert.deepEqual(sameDay, s);
  const nextDay = rollTxkc(s, txkcPeriod(at(2026, 11, 6)));
  assert.deepEqual([nextDay.dopen, nextDay.dc, nextDay.sp, nextDay.exp, nextDay.wc], [0, {}, 0, 1300, { '2': 1 }]);
  const nextWeek = rollTxkc(s, txkcPeriod(at(2026, 11, 9))); // Monday
  assert.deepEqual([nextWeek.wc, nextWeek.week, nextWeek.adv, nextWeek.awd1], [{}, '2026-11-09', 1, 2]);
  const nextSeason = rollTxkc(s, txkcPeriod(at(2026, 12, 1)));
  assert.deepEqual([nextSeason.exp, nextSeason.adv, nextSeason.awd1, nextSeason.season], [0, 0, 0, '2026-12']);
  assert.equal(rollTxkc(null, p0).season, '2026-11');
});

test('exp is capped at 70 levels', () => {
  const s = newTxkc(txkcPeriod(at(2026, 11, 5)));
  s.exp = 34_900;
  addTxkcExp(s, 500);
  assert.equal(s.exp, 35_000);
});

test('task progress sums diary ids; the vitality task reads the points', () => {
  const counts = { tasks: { '21': 2, '36': 3, '19': 4 }, vitality: 1200 };
  const dungeons = taskDef(TXKC_WEEKLY_TASKS, 1)!;
  assert.equal(taskProgress(counts, dungeons), 5);
  assert.equal(taskDone(counts, dungeons), true);
  assert.equal(taskDone(counts, taskDef(TXKC_WEEKLY_TASKS, 2)!), false);
  assert.equal(taskDone(counts, taskDef(TXKC_WEEKLY_TASKS, 6)!), true);
});

test('payload: dailies only once opened, wire values claimed / done / progress', () => {
  const p = txkcPeriod(at(2026, 11, 5));
  const s = newTxkc(p);
  s.exp = 1250;
  const closed = buildTxkcData(s, p, { tasks: {}, vitality: 0 }, { tasks: { '19': 12 }, vitality: 0 });
  assert.equal(closed.flag.dd, undefined);
  assert.deepEqual([closed.flag.lev, closed.flag.exp, closed.flag.p], [2, 250, 0]);
  assert.equal(closed.flag.wd['2'], '12/30');
  Object.assign(s, { dopen: 1, sp: 26, dc: { '1': 1 } });
  const open = buildTxkcData(s, p, { tasks: { '1': 3, '2': 1, '4': 3 }, vitality: 0 }, { tasks: {}, vitality: 0 });
  assert.equal(open.flag.spIndex, 26);
  assert.deepEqual([open.flag.dd!['1'], open.flag.dd!['2'], open.flag.dd!['4'], open.flag.dd!['6']], ['exped', '1/3', 'true', '0/1']);
  assert.equal(Object.keys(open.flag.dd!).length, TXKC_DAILY_TASKS.length);
});
