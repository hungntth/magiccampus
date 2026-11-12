// Tests for the 3v3 pure rules (M14 phase H): points, medals, streak buff, result decision, pairing, schedule, title tiers.

import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleResult } from './battle.js';
import { startOfDayMs } from './dayKey.js';
import { THREE_PVP } from './threePvp.js';
import {
  announceMark, decideResult, gmWindow, matchNotice, medalsFor, nextWeeklyStart, pairRooms, phaseAt, pointsFor, rankBonus, streakBuff,
  titleTierFor, weeklyWindow, type PairRoom,
} from './threePvpRules.js';

// 2026-11-13 is a Friday (UTC+7)
const FRI = startOfDayMs(Date.UTC(2026, 10, 13, 3, 0));
const at = (h: number, m = 0): number => FRI + (h * 60 + m) * 60_000;

test('points by room size: win 3/6/10, loss or draw 1/2/3', () => {
  assert.deepEqual([1, 2, 3].map((n) => pointsFor(n, true)), [3, 6, 10]);
  assert.deepEqual([1, 2, 3].map((n) => pointsFor(n, false)), [1, 2, 3]);
  assert.equal(pointsFor(0, true), 3);
  assert.equal(pointsFor(9, false), 3);
});

test('medals = points x 10 + rank bonus (1: 500, 2-3: 300, 4-10: 200, 11-50: 100), none outside the paid list', () => {
  assert.deepEqual([1, 2, 3, 4, 10, 11, 50, 51].map(rankBonus), [500, 300, 300, 200, 200, 100, 100, 0]);
  assert.equal(medalsFor(30, 1), 800);
  assert.equal(medalsFor(7, 60), 70);
  assert.equal(medalsFor(0, 1), 0);
  assert.equal(medalsFor(10, 0), 0);
  assert.equal(medalsFor(10, THREE_PVP.MAX_RANKED + 1), 0);
});

test('streakBuff: none below 5 losses, 2435 at 5 up to 2439 from 9', () => {
  assert.equal(streakBuff(4), null);
  assert.deepEqual([5, 6, 7, 8, 9, 20].map(streakBuff), [2435, 2436, 2437, 2438, 2439, 2439]);
});

test('decideResult: wipe loses, both wiped draws, combat winner when both stand, cap is a draw', () => {
  assert.equal(decideResult(BattleResult.WIN, 2, 0), 'a');
  assert.equal(decideResult(BattleResult.LOSE, 0, 1), 'b');
  assert.equal(decideResult(BattleResult.WIN, 0, 0), 'draw');
  assert.equal(decideResult(BattleResult.WIN, 3, 3), 'a'); // flee by b: combat says the attacker won
  assert.equal(decideResult(BattleResult.LOSE, 3, 3), 'b');
  assert.equal(decideResult(BattleResult.FLED, 3, 3), 'draw');
  assert.equal(decideResult(BattleResult.WIN, 0, 2), 'b', 'alive counts beat the combat code');
});

test('pairRooms: size first, then strength; leftover alone; avoids the last opponent when someone else is free', () => {
  const room = (id: number, size: number, strength: number, lastOpponent: number | null = null): PairRoom => ({ id, size, strength, lastOpponent });
  assert.deepEqual(pairRooms([room(1, 1, 60), room(2, 3, 200), room(3, 3, 210), room(4, 1, 55)]), [[3, 2], [1, 4]]);
  assert.deepEqual(pairRooms([room(1, 3, 200), room(2, 3, 190), room(3, 3, 180)]), [[1, 2]]);
  // 1 played 2 last: 1 meets 3 even though 2 is stronger
  assert.deepEqual(pairRooms([room(1, 3, 300, 2), room(2, 3, 290, 1), room(3, 3, 100)]), [[1, 3]]);
  // two rooms only: a rematch is allowed
  assert.deepEqual(pairRooms([room(1, 2, 120, 2), room(2, 2, 110, 1)]), [[1, 2]]);
  assert.deepEqual(pairRooms([room(1, 3, 100)]), []);
  assert.deepEqual(pairRooms([]), []);
});

test('weeklyWindow: Friday 19:00-22:00 UTC+7 only', () => {
  assert.equal(weeklyWindow(at(18, 59)), null);
  const w = weeklyWindow(at(19, 0));
  assert.ok(w && w.key === '2026-11-13' && w.startMs === at(19) && w.endMs === at(22) && !w.gm);
  assert.ok(weeklyWindow(at(21, 59)));
  assert.equal(weeklyWindow(at(22, 0)), null);
  assert.equal(weeklyWindow(at(20) + 86_400_000), null, 'Saturday');
  assert.equal(weeklyWindow(at(20) - 86_400_000), null, 'Thursday');
});

test('nextWeeklyStart is the coming Friday 19:00', () => {
  assert.equal(nextWeeklyStart(at(18)), at(19));
  assert.equal(nextWeeklyStart(at(19)), at(19) + 7 * 86_400_000);
  assert.equal(nextWeeklyStart(at(23)), at(19) + 7 * 86_400_000);
});

test('gmWindow: default 15, at least 5, at most 180, key carries the day and a gm stamp', () => {
  const now = at(10, 30);
  assert.equal(gmWindow(now, undefined).endMs - now, 15 * 60_000);
  assert.equal(gmWindow(now, 1).endMs - now, 5 * 60_000);
  assert.equal(gmWindow(now, 30).endMs - now, 30 * 60_000);
  assert.equal(gmWindow(now, 99999).endMs - now, 180 * 60_000);
  assert.equal(gmWindow(now, 'x').endMs - now, 15 * 60_000);
  assert.match(gmWindow(now, 15).key, /^2026-11-13-gm-\d{6}$/);
  assert.equal(gmWindow(now, 15).gm, true);
});

test('phaseAt: closed -> fighting -> settling -> closed once settled', () => {
  const run = { startMs: 1000, endMs: 5000 };
  assert.equal(phaseAt(500, run), 'closed');
  assert.equal(phaseAt(1000, run), 'fighting');
  assert.equal(phaseAt(4999, run), 'fighting');
  assert.equal(phaseAt(5000, run), 'settling');
  assert.equal(phaseAt(9000, { ...run, settledAt: 6000 }), 'closed');
  assert.equal(phaseAt(3000, null), 'closed');
});

test('announceMark: 30 and 5 minutes before the start, only on Fridays and only within 5 s', () => {
  assert.equal(announceMark(at(18, 30)), 30);
  assert.equal(announceMark(at(18, 55) + 4_000), 5);
  assert.equal(announceMark(at(18, 55) + 6_000), null);
  assert.equal(announceMark(at(18, 30) + 86_400_000), null);
});

test('titleTierFor: highest reached tier', () => {
  assert.equal(titleTierFor(1199), null);
  assert.equal(titleTierFor(1200)?.titleId, 220);
  assert.equal(titleTierFor(5999)?.titleId, 222);
  assert.equal(titleTierFor(10_000_000)?.titleId, 229);
});

test('matchNotice words', () => {
  assert.equal(matchNotice('a', ['A', 'B'], ['C']), '[Chiến Trường Dũng Sĩ] A, B đã đánh bại C!');
  assert.equal(matchNotice('b', ['A'], ['C', 'D']), '[Chiến Trường Dũng Sĩ] C, D đã đánh bại A!');
  assert.equal(matchNotice('draw', ['A'], ['C']), '[Chiến Trường Dũng Sĩ] A và C bất phân thắng bại!');
});
