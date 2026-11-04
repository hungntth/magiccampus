// Tests for the VIP / PM rules: package buy / extend / downgrade, daily login exp, claim cycles, every implemented right's reward
// (incl. the right-1 cap), mark-first progress, the findback audit and its once-a-day behaviour. Clocks are injected.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAY_MS, PmRight, dayKey, parseCountConfig, type PmRightView } from '@mc/shared';
import {
  MSG_ALREADY, auditRollover, auditableRights, buyPackage, buffForLevel, claimError, claimedNow, dailyLoginExp, emptyVip,
  expRewardAmount, monthBagItem, nextProgress, pickTransform, rewardOf, type VipState,
} from './pm-rules';

const NOW = Date.UTC(2026, 10, 4, 5, 0); // 12:00 UTC+7
const active = (over: Partial<VipState> = {}): VipState => ({ ...emptyVip(), vipType: 1, expiresAt: NOW + DAY_MS, startedAt: NOW - DAY_MS, ...over });

const right = (id: number, type: number, values: (number | null)[], from = 1): PmRightView => ({
  id, type, sortIndex: id, desc: '', desc2: '', maxCount: 1, values,
  vip: Array.from({ length: 9 }, (_, i) => i + 1 >= from),
});
const RIGHTS: PmRightView[] = [
  right(1, 2, [2, 3, 3, 5, 5, 7, 7, 9, 9]),
  right(2, 2, [10, 15, 20, 20, 25, 25, 30, 35, 40]),
  right(7, 2, [null, null, null, 1, 2, 3, 4, 5, 6], 4),
  right(24, 4, [], 4),
];

test('buy: fresh purchase starts now, pmExp gains the cost, a card lifts exp to its level', () => {
  const r = buyPackage(emptyVip(), 3, NOW);
  assert.ok(!('error' in r));
  assert.equal(r.cost, 2888);
  assert.equal(r.patch.vipType, 3);
  assert.equal(r.patch.startedAt, NOW);
  assert.equal(r.patch.expiresAt, NOW + 180 * DAY_MS);
  assert.equal(r.patch.pmExp, 45000); // max(0 + 2888, threshold of level 3)
});

test('buy: renewing the same card extends from the current expiry and keeps the start', () => {
  const r = buyPackage(active({ pmExp: 20000 }), 1, NOW);
  assert.ok(!('error' in r));
  assert.equal(r.patch.expiresAt, NOW + DAY_MS + 30 * DAY_MS);
  assert.equal(r.patch.startedAt, NOW - DAY_MS);
  assert.equal(r.patch.pmExp, 20688);
});

test('buy: upgrading while active is allowed, a downgrade is refused', () => {
  const up = buyPackage(active(), 2, NOW);
  assert.ok(!('error' in up));
  assert.equal(up.patch.vipType, 2);
  const down = buyPackage(active({ vipType: 3 }), 1, NOW);
  assert.ok('error' in down);
});

test('buy: after expiry any card can be bought again and starts at now', () => {
  const r = buyPackage(active({ vipType: 3, expiresAt: NOW - 1, pmExp: 50000 }), 1, NOW);
  assert.ok(!('error' in r));
  assert.equal(r.patch.expiresAt, NOW + 30 * DAY_MS);
  assert.equal(r.patch.startedAt, NOW);
  assert.equal(r.patch.pmExp, 50688);
});

test('daily login exp: 500 / 1000 / 2000 by type, once per UTC+7 day, nothing when inactive', () => {
  assert.deepEqual(dailyLoginExp(active({ vipType: 1 }), NOW), { amount: 500, day: dayKey(NOW) });
  assert.equal(dailyLoginExp(active({ vipType: 2 }), NOW)?.amount, 1000);
  assert.equal(dailyLoginExp(active({ vipType: 3 }), NOW)?.amount, 2000);
  assert.equal(dailyLoginExp(active({ dailyExpDay: dayKey(NOW) }), NOW), null);
  assert.ok(dailyLoginExp(active({ dailyExpDay: dayKey(NOW - DAY_MS) }), NOW));
  assert.equal(dailyLoginExp(active({ expiresAt: NOW - 1 }), NOW), null);
  assert.equal(dailyLoginExp(emptyVip(), NOW), null);
});

test('claimError: unknown right, not a member, level flag off, passive right', () => {
  assert.ok(claimError(undefined, 3));
  assert.ok(claimError(RIGHTS[0], 0));
  assert.ok(claimError(RIGHTS[2], 3)); // book needs level 4
  assert.equal(claimError(RIGHTS[2], 4), null);
  assert.ok(claimError(right(4, 3, []), 5)); // type 3 passive
  assert.equal(claimError(RIGHTS[0], 1), null);
});

test('daily claim: once per day, marks the day, resets on the next day', () => {
  const cfg = parseCountConfig('1|1|1');
  const first = nextProgress(undefined, cfg, 2, NOW);
  assert.deepEqual(first, { day: dayKey(NOW), type: 2, time: 1 });
  assert.equal(nextProgress(first!, cfg, 2, NOW + 1000), null); // second claim refused
  assert.deepEqual(nextProgress(first!, cfg, 2, NOW + DAY_MS), { day: dayKey(NOW + DAY_MS), type: 2, time: 1 });
  assert.equal(claimedNow(first!, cfg, NOW), 1);
  assert.equal(claimedNow(first!, cfg, NOW + DAY_MS), 0);
});

test('monthly claim (2|30|1): once per calendar month', () => {
  const cfg = parseCountConfig('2|30|1');
  const first = nextProgress(undefined, cfg, 2, NOW);
  assert.equal(first?.day, '2026-11');
  assert.equal(nextProgress(first!, cfg, 2, NOW + 10 * DAY_MS), null);
  assert.equal(nextProgress(first!, cfg, 2, NOW + 30 * DAY_MS)?.day, '2026-12');
});

test('a larger max allows several claims in the cycle', () => {
  const cfg = parseCountConfig('1|1|3');
  let p = nextProgress(undefined, cfg, 2, NOW);
  p = nextProgress(p!, cfg, 2, NOW);
  p = nextProgress(p!, cfg, 2, NOW);
  assert.equal(p?.time, 3);
  assert.equal(nextProgress(p!, cfg, 2, NOW), null);
});

test('right 1: exp is capped at one level of exp', () => {
  // level 10: basic exp x value would exceed a level's exp for large values; the cap holds
  const need = expRewardAmount(10, 9);
  assert.ok(need > 0);
  assert.ok(expRewardAmount(10, 2) <= need);
  assert.equal(expRewardAmount(10, 9), need);
  assert.equal(expRewardAmount(10, 0), 0);
  assert.equal(expRewardAmount(10, null), 0);
  // a value large enough to pass the cap never pays more than the cap
  assert.ok(expRewardAmount(10, 1_000_000) === need);
});

const CTX = { charLevel: 10, characterId: 7, now: NOW, transformPool: ['111', '222', '333'] };

test('rewards of each implemented right', () => {
  const [exp, coupon, book] = RIGHTS;
  assert.equal(rewardOf(exp, 5, CTX)?.kind, 'exp');
  assert.deepEqual(rewardOf(coupon, 1, CTX), { kind: 'goldBind', amount: 10 });
  assert.deepEqual(rewardOf(coupon, 9, CTX), { kind: 'goldBind', amount: 40 });
  assert.deepEqual(rewardOf(book, 6, CTX), { kind: 'item', itemId: 3630, qty: 3 });
  assert.equal(rewardOf(book, 3, CTX), null); // no value below level 4
  const buff = rewardOf(right(3, 2, [4, 4, 6, 6, 8, 8, 10, 10, 12]), 8, CTX);
  assert.equal(buff?.kind === 'buff' && buff.buffId, 3308);
  assert.ok(buff?.kind === 'buff' && buff.seconds > 0 && buff.seconds <= 86400);
  assert.deepEqual(rewardOf(right(10, 2, []), 1, CTX), { kind: 'item', itemId: 3232, qty: 1 });
  assert.deepEqual(rewardOf(right(10, 2, []), 9, CTX), { kind: 'item', itemId: 3238, qty: 1 });
  assert.equal(rewardOf(right(13, 2, []), 2, CTX)?.kind, 'transform');
  assert.equal(rewardOf(right(13, 2, []), 2, { ...CTX, transformPool: [] }), null);
  assert.equal(rewardOf(right(99, 2, [1]), 2, CTX), null);
});

test('buff and bag ids by level', () => {
  assert.deepEqual([1, 2, 7, 8, 9].map(buffForLevel), [2504, 2505, 2510, 3308, 3309]);
  assert.deepEqual([1, 7, 8].map(monthBagItem), [3232, 3238, 3238]);
});

test('transform pick is stable per day and character and changes with the day', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(pickTransform(pool, NOW, 7), pickTransform(pool, NOW + 1000, 7));
  assert.notEqual(pickTransform(pool, NOW, 7), pickTransform(pool, NOW + DAY_MS, 7));
  assert.equal(pickTransform([], NOW, 7), null);
});

test('findback audit: entitlement needs right 24 enabled for the level', () => {
  assert.deepEqual(auditableRights(RIGHTS, 3), []);
  assert.deepEqual(auditableRights(RIGHTS, 4), [1, 2, 7]);
  assert.deepEqual(auditableRights(RIGHTS.slice(0, 2), 4), []);
});

test('findback audit: first audit only records, the next day flags unclaimed rights', () => {
  const first = auditRollover(active(), NOW, [1, 2, 7]);
  assert.deepEqual(first, { auditDay: dayKey(NOW), auditRights: [1, 2, 7] });
  assert.equal(auditRollover({ ...active(), ...first }, NOW + 1000, [1, 2, 7]), null); // once a day
  const day2 = auditRollover({ ...active(), auditDay: dayKey(NOW), auditRights: [1, 2, 7], process: { 2: { day: dayKey(NOW), type: 2, time: 1 } } }, NOW + DAY_MS, [1, 2, 7]);
  assert.equal(day2?.findback, true);
  assert.deepEqual(day2?.missed, [1, 7]);
  assert.equal(day2?.auditDay, dayKey(NOW + DAY_MS));
});

test('findback audit: everything claimed yesterday raises no flag; a gap of days counts everything as missed', () => {
  const claimed = { 1: { day: dayKey(NOW), type: 2, time: 1 }, 2: { day: dayKey(NOW), type: 2, time: 1 }, 7: { day: dayKey(NOW), type: 2, time: 1 } };
  const ok = auditRollover({ ...active(), auditDay: dayKey(NOW), auditRights: [1, 2, 7], process: claimed }, NOW + DAY_MS, [1, 2, 7]);
  assert.equal(ok?.findback, undefined);
  const gap = auditRollover({ ...active(), auditDay: dayKey(NOW), auditRights: [1, 2], process: claimed }, NOW + 3 * DAY_MS, [1, 2]);
  assert.deepEqual(gap?.missed, [1, 2]);
  assert.equal(gap?.findback, true);
});

test('mark-first: a refused second claim never reaches the reward step (nextProgress is the gate)', () => {
  const cfg = parseCountConfig('1|1|1');
  const marked = nextProgress(undefined, cfg, 2, NOW)!;
  assert.equal(nextProgress(marked, cfg, 2, NOW), null);
  assert.ok(MSG_ALREADY.length > 0);
  assert.equal(PmRight.FINDBACK, 24);
});
