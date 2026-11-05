// Pet arena rules: season ids, turns / cooldown / gold prices, Elo + points, rank award formula, milestones and the line-up shape.

import assert from 'node:assert/strict';
import test from 'node:test';
import { dayKey } from '@mc/shared';
import {
  addFightCost, arenaConfInputRefusal, arenaRegisterRefusal, arenaSlots, buyFight, carriedLastRank, challengePoints, climbMilestone,
  clearCooldownCost, cooldownLeft, displayTeamName, eloChange, fightBlocker, isTopRise, normalizeArenaConf, previousWeekSeason,
  rankAward, ratingGain, recordFight, resetDaily, settleFight, streakMilestone, teamNameValid, weekSeason, winRate,
  type ArenaDaily, type ArenaScore,
} from './arena-rules';

const daily = (over: Partial<ArenaDaily> = {}): ArenaDaily => ({ usedFights: 0, maxFights: 20, cooldownEndsAt: 0, fightDay: '', dayStartRank: 0, climbNotified: 0, ...over });
const score = (rating = 1000): ArenaScore => ({ rating, wins: 0, losses: 0, combo: 0, maxCombo: 0 });
/** 2026-11-04 12:00 UTC+7 (a Wednesday of ISO week 45). */
const WED = Date.UTC(2026, 10, 4, 5, 0, 0);

test('season is the ISO year and week of the UTC+7 date', () => {
  assert.equal(weekSeason(WED), 202645);
  assert.equal(previousWeekSeason(WED), 202644);
  assert.equal(weekSeason(Date.UTC(2026, 0, 1, 5)), 202601); // Thursday: week 1
  assert.equal(weekSeason(Date.UTC(2021, 0, 3, 5)), 202053); // Sunday of the long 2020 year
  assert.equal(previousWeekSeason(Date.UTC(2021, 0, 5, 5)), 202053);
  // Sunday 23:30 UTC+7 is still the old week, Monday 00:30 UTC+7 starts the next one.
  assert.equal(weekSeason(Date.UTC(2026, 10, 8, 16, 30)), 202645);
  assert.equal(weekSeason(Date.UTC(2026, 10, 8, 17, 30)), 202646);
});

test('last rank is the 0-based position within the award cap, else -1', () => {
  assert.equal(carriedLastRank(1), 0);
  assert.equal(carriedLastRank(200), 199);
  assert.equal(carriedLastRank(201), -1);
  assert.equal(carriedLastRank(0), -1);
});

test('daily reset restores 20 turns once per day and clears the day markers', () => {
  const e = daily({ usedFights: 7, maxFights: 25, fightDay: '2000-01-01', dayStartRank: 40, climbNotified: 100 });
  assert.equal(resetDaily(e, WED), true);
  assert.deepEqual([e.usedFights, e.maxFights, e.dayStartRank, e.climbNotified, e.fightDay], [0, 20, 0, 0, dayKey(WED)]);
  e.usedFights = 3;
  e.maxFights = 23;
  assert.equal(resetDaily(e, WED + 1000), false); // same day: bought turns stay
  assert.deepEqual([e.usedFights, e.maxFights], [3, 23]);
  e.maxFights = 5;
  assert.equal(resetDaily(e, WED), true); // a max below the base is healed
  assert.equal(e.maxFights, 20);
});

test('a fight needs a turn first, then a finished cooldown; recording starts 10 minutes', () => {
  const e = daily({ usedFights: 20 });
  assert.equal(fightBlocker(e, WED), 'noTurns');
  e.usedFights = 0;
  assert.equal(fightBlocker(e, WED), null);
  recordFight(e, WED);
  assert.equal(e.usedFights, 1);
  assert.equal(e.cooldownEndsAt, WED + 600_000);
  assert.equal(fightBlocker(e, WED + 1), 'cooldown');
  assert.equal(cooldownLeft(e, WED + 599_000), 1000);
  assert.equal(fightBlocker(e, WED + 600_000), null);
  e.usedFights = 20;
  assert.equal(fightBlocker({ ...e, cooldownEndsAt: WED + 5 }, WED), 'noTurns'); // turns win over the cooldown
});

test('turn prices: (max - 19) * 5 up to the cap of 30, cooldown ceil(s / 30)', () => {
  assert.equal(addFightCost(20), 5);
  assert.equal(addFightCost(21), 10);
  assert.equal(addFightCost(29), 50);
  assert.equal(addFightCost(3), 5);
  const e = daily({ maxFights: 29 });
  assert.equal(buyFight(e), true);
  assert.equal(e.maxFights, 30);
  assert.equal(buyFight(e), false);
  assert.equal(clearCooldownCost(0), 0);
  assert.equal(clearCooldownCost(1), 1);
  assert.equal(clearCooldownCost(30_000), 1);
  assert.equal(clearCooldownCost(30_001), 2);
  assert.equal(clearCooldownCost(600_000), 20);
});

test('Elo change is the truncated K 32 swing, at least 1, the same for both sides', () => {
  assert.equal(eloChange(1000, 1000, true), 16);
  assert.equal(eloChange(1000, 1000, false), 16);
  assert.equal(eloChange(1000, 1400, true), 29); // 32 * (1 - 0.0909)
  assert.equal(eloChange(1400, 1000, true), 2); // 32 * 0.0909 truncated
  assert.equal(eloChange(3000, 1000, true), 1); // 32 * 0.00001 -> 0 -> 1
  assert.equal(ratingGain(true, 2), 10);
  assert.equal(ratingGain(true, 25), 25);
  assert.equal(ratingGain(false, 25), 5);
});

test('points by level group: wins 6 12 16 20 24 28, a loss pays half rounded down', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((g) => challengePoints(g, true)), [6, 12, 16, 20, 24, 28]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((g) => challengePoints(g, false)), [3, 6, 8, 10, 12, 14]);
  assert.equal(challengePoints(9, true), 6); // an unknown group counts as A
});

test('settling a fight moves ratings, streaks and records like Go RecordWin / RecordLoss', () => {
  const a = score(1000);
  const d = score(1000);
  assert.equal(settleFight(a, d, true), 16);
  assert.deepEqual(a, { rating: 1016, wins: 1, losses: 0, combo: 1, maxCombo: 1 });
  assert.deepEqual(d, { rating: 984, wins: 0, losses: 1, combo: 0, maxCombo: 0 });
  settleFight(a, d, true);
  assert.equal(a.maxCombo, 2);
  settleFight(a, d, false); // an attacker loss: +5 rating anyway, streak reset, the defender wins
  assert.deepEqual([a.losses, a.combo, a.maxCombo], [1, 0, 2]);
  assert.equal(d.wins, 1);
  assert.equal(d.combo, 1);
  const low = score(1);
  settleFight(score(1), low, true);
  assert.equal(low.rating, 0); // never below zero
});

test('rank award is round(coef * 1.02^(200 - rank)) with coef 40..140 by group', () => {
  assert.equal(rankAward(0, 200), 40);
  assert.equal(rankAward(5, 200), 140);
  assert.equal(rankAward(0, 1), Math.round(40 * 1.02 ** 199));
  assert.equal(rankAward(3, 101), Math.round(100 * 1.02 ** 99));
  assert.equal(rankAward(2, 0), 0);
  assert.equal(rankAward(2, 201), 0);
  assert.equal(rankAward(9, 200), 40);
});

test('milestones: top-3 rise, 100 / 200 climbs once each, streak every fifth win', () => {
  assert.equal(isTopRise(10, 3), true);
  assert.equal(isTopRise(2, 1), true);
  assert.equal(isTopRise(2, 2), false);
  assert.equal(isTopRise(0, 3), true);
  assert.equal(isTopRise(10, 4), false);
  assert.equal(climbMilestone(150, 60, 0), 0);
  assert.equal(climbMilestone(250, 140, 0), 100);
  assert.equal(climbMilestone(250, 140, 100), 0);
  assert.equal(climbMilestone(300, 90, 100), 200);
  assert.equal(climbMilestone(300, 90, 200), 0);
  assert.equal(climbMilestone(0, 1, 0), 0);
  assert.deepEqual([4, 5, 9, 10, 15].map(streakMilestone), [false, true, false, true, true]);
});

test('team names, display name and win rate', () => {
  assert.equal(displayTeamName('nl', 'Hung'), 'Hung');
  assert.equal(displayTeamName('', 'Hung'), 'Hung');
  assert.equal(displayTeamName('Rong', 'Hung'), 'Rong');
  assert.equal(teamNameValid('nl'), true);
  assert.equal(teamNameValid('Doi Rong 1'), true);
  assert.equal(teamNameValid('<b>x</b>'), false);
  assert.equal(teamNameValid('a'.repeat(17)), false);
  assert.equal(winRate(0, 0), '0');
  assert.equal(winRate(1, 3), '33%');
  assert.equal(winRate(2, 3), '66%');
});

test('arena config keeps positions 5..9, one entry per position, and cmdLists are parsed', () => {
  const conf = normalizeArenaConf({
    5: { pid: 11, pos: 5, cmdList: [{ action: -10, id: 1000, level: 1, t: 2 }] },
    6: { pid: 12, pos: 4 }, // position out of range
    7: { pid: 13, pos: 7 },
    x: { pid: 14, pos: 7 }, // repeated position
    8: { pid: 0, pos: 8 },
    9: 'junk',
  });
  assert.deepEqual(Object.keys(conf), ['5', '7']);
  assert.equal(conf['5'].cmdList['0'].t, 2);
  assert.deepEqual(conf['7'].cmdList, {});
  assert.deepEqual(normalizeArenaConf(null), {});
  assert.equal(arenaConfInputRefusal(Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, { pid: i }]))) !== null, true);
  assert.equal(arenaConfInputRefusal({ 5: { pid: 1 } }), null);
});

test('arena slots are ordered by position and unique by pet id', () => {
  const conf = normalizeArenaConf({
    a: { pid: 5, pos: 9 }, b: { pid: 6, pos: 5 }, c: { pid: 5, pos: 7 },
  });
  assert.deepEqual(arenaSlots(conf).map((s) => [s.pos, s.pid]), [[5, 6], [7, 5]]);
});

test('registration checks the team size of the level group, ownership, binding and templates', () => {
  const slots = (n: number): { pid: number; pos: number; cmdList: Record<string, never> }[] => Array.from({ length: n }, (_, i) => ({ pid: i + 1, pos: 5 + i, cmdList: {} }));
  const pets = (n: number, binded = 1): { id: number; tid: number; binded: number }[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, tid: 100 + i, binded }));
  assert.equal(arenaRegisterRefusal(pets(2), slots(2), 50), null);
  assert.notEqual(arenaRegisterRefusal(pets(3), slots(3), 50), null); // group A: 2
  assert.equal(arenaRegisterRefusal(pets(3), slots(3), 80), null); // group B: 3
  assert.notEqual(arenaRegisterRefusal(pets(4), slots(4), 80), null);
  assert.equal(arenaRegisterRefusal(pets(5), slots(5), 120), null); // group D: 5
  assert.notEqual(arenaRegisterRefusal([], [], 120), null);
  assert.notEqual(arenaRegisterRefusal(pets(1), slots(2), 50), null); // not owned
  assert.notEqual(arenaRegisterRefusal(pets(2, 0), slots(2), 50), null); // not bound
  const dup = [{ id: 1, tid: 7, binded: 1 }, { id: 2, tid: 7, binded: 1 }];
  assert.notEqual(arenaRegisterRefusal(dup, slots(2), 50), null);
});
