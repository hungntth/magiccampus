// Tests for RoomBook and the room-facing PartyBook additions (M14 phase F).

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM } from '@mc/shared';
import { PartyBook } from './party-rules';
import { RoomBook } from './room-rules';

const AD = { fid: 1, type: 1, minLevel: 50, maxLevel: 90, scheduledAt: 0 };

test('create cooldown: 5 minutes per leader, forgotten on disconnect', () => {
  let now = 1000;
  const rooms = new RoomBook(() => now);
  assert.equal(rooms.cooldownLeft(1), 0);
  rooms.markCreated(1);
  assert.equal(rooms.cooldownLeft(1), ROOM.createCooldownMs);
  now += 100_000;
  assert.equal(rooms.cooldownLeft(1), ROOM.createCooldownMs - 100_000);
  assert.equal(rooms.cooldownLeft(2), 0);
  now += ROOM.createCooldownMs;
  assert.equal(rooms.cooldownLeft(1), 0);
  rooms.markCreated(1);
  rooms.forget(1);
  assert.equal(rooms.cooldownLeft(1), 0);
});

test('applications: one per applicant, expire lazily, cap per room', () => {
  let now = 0;
  const rooms = new RoomBook(() => now);
  assert.equal(rooms.apply(10, 1), 'ok');
  assert.equal(rooms.apply(10, 2), 'already');
  assert.equal(rooms.pendingOf(10), 1);
  assert.deepEqual(rooms.applicantsOf(1), [10]);
  now += ROOM.applyTtlMs;
  assert.equal(rooms.pendingOf(10), undefined);
  assert.equal(rooms.apply(10, 2), 'ok');
  for (let i = 0; i < ROOM.maxApplicants - 1; i++) assert.equal(rooms.apply(100 + i, 2), 'ok');
  assert.equal(rooms.apply(999, 2), 'full');
  assert.equal(rooms.apply(999, 3), 'ok');
  assert.equal(rooms.dropParty(2).length, ROOM.maxApplicants);
  assert.equal(rooms.pendingOf(10), undefined);
  assert.equal(rooms.drop(999), true);
  assert.equal(rooms.drop(999), false);
});

test('room party survives with one member and dissolves when empty', () => {
  const book = new PartyBook(() => 0);
  const party = book.createSolo(1)!;
  assert.equal(book.createSolo(1), null);
  party.room = { ...AD };
  assert.deepEqual(book.addToParty(party.id, 2).ok, true);
  assert.deepEqual(party.members, [1, 2]);
  const kick = book.kick(1, 2);
  assert.ok(kick.ok && kick.result.kind === 'left');
  assert.equal(book.partyOf(1)?.id, party.id, 'one member left: the room stays');
  const gone = book.leave(1);
  assert.equal(gone.kind, 'dismissed');
  assert.equal(book.partyById(party.id), undefined);
});

test('leader leaving a room with two members promotes the other, a plain party still dissolves at one', () => {
  const book = new PartyBook(() => 0);
  const party = book.createSolo(1)!;
  party.room = { ...AD };
  book.addToParty(party.id, 2);
  const r = book.leave(1);
  assert.ok(r.kind === 'left' && r.newLeaderId === 2);
  assert.equal(book.partyOf(2)?.leaderId, 2);
  const plain = book.createSolo(5)!;
  book.addToParty(plain.id, 6);
  assert.equal(book.leave(6).kind, 'dismissed');
});

test('addToParty refuses a member of a party, a full party and a missing party', () => {
  const book = new PartyBook(() => 0);
  const party = book.createSolo(1)!;
  for (let c = 2; c <= 5; c++) assert.ok(book.addToParty(party.id, c).ok);
  const full = book.addToParty(party.id, 6);
  assert.ok(!full.ok && full.reason === 'full');
  const other = book.createSolo(7)!;
  const dup = book.addToParty(other.id, 2);
  assert.ok(!dup.ok && dup.reason === 'inGroup');
  const gone = book.addToParty(999, 8);
  assert.ok(!gone.ok && gone.reason === 'gone');
  assert.equal(book.allParties().length, 2);
});
