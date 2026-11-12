// Tests for wedding-rules.ts: scheduler decisions (open / close window / missed), hall admission, invitees, red envelope alternation,
// exact refund and ring / tier plan.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEDDING } from '@mc/shared';
import {
  admission, normalizeLine, partnerIn, pendingVows, pickInvitees, redBagRecipient, refundOf, ringPlan, schedulerAction, type Booking,
} from './wedding-rules';

const START = Date.UTC(2026, 10, 12, 7, 0, 0);

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 1, marriageId: 9, maleId: 10, femaleId: 20, bookerId: 20, line: 1, startAt: START, flag: 0, tier: 1, costBind: 1_000_000,
  costMoney: 1_990_000, started: false, maleAgreed: false, femaleAgreed: false, finishedAt: null, invited: [], redBags: 0, ...over,
});

test('schedulerAction: waits, opens at the start, closes after 60 min, refunds a hall that never opened', () => {
  assert.equal(schedulerAction(booking(), START - 1), null);
  assert.equal(schedulerAction(booking(), START), 'open');
  assert.equal(schedulerAction(booking({ started: true }), START + 10 * 60_000), null);
  assert.equal(schedulerAction(booking({ started: true }), START + WEDDING.openMs - 1), null);
  assert.equal(schedulerAction(booking({ started: true }), START + WEDDING.openMs), 'close');
  assert.equal(schedulerAction(booking(), START + WEDDING.openMs), 'missed'); // down for an hour: refund instead of opening
  assert.equal(schedulerAction(booking(), START + WEDDING.openMs + 5), 'missed');
});

test('schedulerAction: the hall closes 10 min after the rings, whichever comes first', () => {
  const rung = booking({ started: true, finishedAt: START + 5 * 60_000 });
  assert.equal(schedulerAction(rung, START + 14 * 60_000 + 59_000), null);
  assert.equal(schedulerAction(rung, START + 15 * 60_000), 'close');
  const late = booking({ started: true, finishedAt: START + 58 * 60_000 }); // rings near the end: the 60 min bound wins
  assert.equal(schedulerAction(late, START + WEDDING.openMs), 'close');
});

test('admission: missing, closed, invitation only, open', () => {
  assert.equal(admission(null, 5, false), 'gone');
  assert.equal(admission(booking(), 5, false), 'closed');
  const open = booking({ started: true });
  assert.equal(admission(open, 5, false), null);
  const only = booking({ started: true, flag: 1, invited: [7] });
  assert.equal(admission(only, 5, false), 'needInvite');
  assert.equal(admission(only, 5, true), null); // holds a card
  assert.equal(admission(only, 7, false), null); // on the guest list
  assert.equal(admission(only, 10, false), null); // the groom
  assert.equal(admission(only, 20, false), null); // the bride
});

test('pickInvitees: online friends outside the couple and the list, at most ten, no repeats', () => {
  const friends = Array.from({ length: 14 }, (_, i) => ({ cid: 100 + i, name: `F${i}` }));
  const b = booking({ invited: [100, 101] });
  const picks = pickInvitees([{ cid: 10, name: 'groom' }, { cid: 20, name: 'bride' }, ...friends, friends[3]], b, (id) => id !== 102);
  assert.deepEqual(picks.map((p) => p.cid), [103, 104, 105, 106, 107, 108, 109, 110, 111, 112]);
  assert.equal(picks.length, WEDDING.invitesPerCard);
  assert.deepEqual(pickInvitees(friends, b, () => false), []);
  assert.deepEqual(pickInvitees([friends[3], friends[3]], b, () => true).map((p) => p.cid), [103]);
});

test('redBagRecipient alternates groom, bride', () => {
  const b = booking();
  assert.deepEqual([0, 1, 2, 3].map((n) => redBagRecipient(b, n)), [10, 20, 10, 20]);
});

test('refundOf returns exactly what was paid, split kept', () => {
  assert.deepEqual(refundOf(booking()), { bind: 1_000_000, money: 1_990_000 });
  assert.deepEqual(refundOf(booking({ costBind: 0, costMoney: 5_000_000 })), { bind: 0, money: 5_000_000 });
});

test('ringPlan: ring per tier, the precious title only for tier 3', () => {
  assert.deepEqual(ringPlan(1), { ring: 1707, title: false });
  assert.deepEqual(ringPlan(2), { ring: 1708, title: false });
  assert.deepEqual(ringPlan(3), { ring: 1709, title: true });
  assert.equal(ringPlan(0), null);
});

test('partner, vow state and line normalisation', () => {
  const b = booking({ maleAgreed: true });
  assert.equal(partnerIn(b, 10), 20);
  assert.equal(partnerIn(b, 20), 10);
  assert.deepEqual(pendingVows(b), { male: false, female: true });
  assert.deepEqual([1, 7, 0, -2, 1000, 'x', undefined, 2.5].map(normalizeLine), [1, 7, 1, 1, 1, 1, 1, 1]);
});
