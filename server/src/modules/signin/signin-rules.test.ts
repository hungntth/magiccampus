// Tests for the sign-in rules: streaks across month boundaries, crit meter, surprise / lucky days, retroactive pick, gold split.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  allSignedThrough, calendarRewards, dayBit, firstUnsignedBefore, isSigned, legacyCard, legacyState, luckyAwardDay,
  luckyClaimTier, rollCrit, runEndingAt, signedMap, splitGold, wrap5, type LuckyInput,
} from './signin-rules';

const bits = (...days: number[]): number => days.reduce((n, d) => n | dayBit(d), 0);

test('bitmap helpers', () => {
  assert.equal(isSigned(bits(3), 3), true);
  assert.equal(isSigned(bits(3), 4), false);
  assert.equal(dayBit(31) > 0, true); // stays a positive int32
  assert.deepEqual(signedMap(bits(1, 3), 5), { '1': true, '3': true });
  assert.equal(allSignedThrough(bits(1, 2, 3), 3), true);
  assert.equal(allSignedThrough(bits(1, 3), 3), false);
});

test('retroactive picks the first unsigned day before today', () => {
  assert.equal(firstUnsignedBefore(bits(1, 2, 4), 6), 3);
  assert.equal(firstUnsignedBefore(bits(1, 2, 3), 4), null);
  assert.equal(firstUnsignedBefore(0, 1), null);
});

test('streak run crosses into the previous month', () => {
  const prev = { bitmap: bits(29, 30), days: 30 };
  assert.equal(runEndingAt(bits(1, 2), prev, 2), 4);
  assert.equal(runEndingAt(bits(2), prev, 2), 1); // day 1 unsigned stops the run
  assert.equal(runEndingAt(0, prev, 0), 2); // day 0 = last day of the previous month
  assert.equal(runEndingAt(bits(1), null, 1), 1);
});

test('legacy panel state wraps 1..5', () => {
  assert.deepEqual([0, 1, 5, 6, 10, 11].map(wrap5), [0, 1, 5, 1, 5, 1]);
  assert.deepEqual(legacyState(3, 0, null), { signinedToday: false, signedYesterday: false, continueSigninTime: 0 });
  assert.deepEqual(legacyState(3, bits(1, 2), null), { signinedToday: false, signedYesterday: true, continueSigninTime: 2 });
  assert.deepEqual(legacyState(3, bits(1, 2, 3), null), { signinedToday: true, signedYesterday: true, continueSigninTime: 3 });
  assert.equal(legacyState(7, bits(1, 2, 3, 4, 5, 6, 7), null).continueSigninTime, 2); // 7th day = card 2 of the next cycle
  assert.equal(legacyState(1, 0, { bitmap: bits(30), days: 30 }).signedYesterday, true);
});

test('the card a sign-in pays follows the streak that includes today', () => {
  assert.equal(legacyCard(1, 0, null), 1);
  assert.equal(legacyCard(3, bits(1, 2), null), 3);
  assert.equal(legacyCard(6, bits(1, 2, 3, 4, 5), null), 1); // sixth day starts a new cycle
  assert.equal(legacyCard(4, bits(1, 3), null), 2); // the gap at day 2 broke the run: day 3 alone, today is its second day
});

test('crit meter: +5 before the roll, a hit resets it', () => {
  assert.deepEqual(rollCrit(0, () => 0.99), { hit: false, crit: 5 });
  assert.deepEqual(rollCrit(0, () => 0.04), { hit: true, crit: 0 }); // 4 < 5
  assert.deepEqual(rollCrit(0, () => 0.05), { hit: false, crit: 5 }); // 5 is not < 5
  assert.deepEqual(rollCrit(100, () => 0.999), { hit: true, crit: 0 }); // 100% always hits
  assert.equal(rollCrit(98, () => 0.999).hit, true); // clamped to 100
});

test('calendar rewards: surprise only on Saturday with a complete streak, crit on a hit', () => {
  assert.deepEqual(calendarRewards(2, true, false), ['calDaily']);
  assert.deepEqual(calendarRewards(6, true, false), ['calDaily', 'calSurprise']);
  assert.deepEqual(calendarRewards(6, false, false), ['calDaily']);
  assert.deepEqual(calendarRewards(6, true, true), ['calDaily', 'calSurprise', 'calCrit']);
  assert.deepEqual(calendarRewards(6, true, true, false), ['calDaily', 'calCrit']); // retroactive: no surprise
});

const tiers = [{ weekIndex: 1, pointThreshold: 499, goldAmount: 500 }, { weekIndex: 2, pointThreshold: 999, goldAmount: 1000 }];
const lucky = (o: Partial<LuckyInput> = {}): LuckyInput => ({
  weekday: 4, today: 5, bitmap: bits(1, 2, 3, 4, 5), consumeTotal: 600, claimed: false, tiers, ...o,
});

test('lucky claim gates', () => {
  assert.equal(luckyClaimTier(lucky())?.goldAmount, 500);
  assert.equal(luckyAwardDay(lucky()), 5);
  assert.equal(luckyClaimTier(lucky({ weekday: 3 })), null); // not Thursday
  assert.equal(luckyClaimTier(lucky({ bitmap: bits(1, 2, 3, 5) })), null); // streak incomplete
  assert.equal(luckyClaimTier(lucky({ consumeTotal: 498 })), null); // spend below threshold
  assert.equal(luckyClaimTier(lucky({ claimed: true })), null); // once a month
  assert.equal(luckyClaimTier(lucky({ tiers: [] })), null); // no tier rows for the month (the seed only has May 2026)
  assert.equal(luckyClaimTier(lucky({ today: 12, consumeTotal: 1000, bitmap: bits(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12) }))?.weekIndex, 2);
  assert.equal(luckyAwardDay(lucky({ claimed: true })), 0);
});

test('gold is paid bound first', () => {
  assert.deepEqual(splitGold(80, 100, 50), { bind: 50, gold: 0 });
  assert.deepEqual(splitGold(20, 100, 50), { bind: 20, gold: 30 });
  assert.equal(splitGold(10, 10, 50), null);
});
