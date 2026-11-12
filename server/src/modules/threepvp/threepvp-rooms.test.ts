// Tests for the pure 3v3 room registry (M14 phase H): ids, join refusals, seat renumbering, ready / start, password and limit rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import { THREE_PVP } from '@mc/shared';
import { clampLimit, normalizePass, RoomBook, type Seat } from './threepvp-rooms';

const seat = (cid: number, level = 60): Seat => ({ cid, name: `P${cid}`, level });

test('normalizePass: digits only, max 6, leading zeros dropped', () => {
  assert.equal(normalizePass('123456'), '123456');
  assert.equal(normalizePass('0012'), '12');
  assert.equal(normalizePass('000'), '');
  assert.equal(normalizePass(''), '');
  assert.equal(normalizePass(4321), '4321');
  assert.equal(normalizePass('1234567'), null);
  assert.equal(normalizePass('12a'), null);
  assert.equal(normalizePass('-1'), null);
  assert.equal(normalizePass(null), null);
});

test('clampLimit: [50, max level], min <= max, junk refused', () => {
  assert.deepEqual(clampLimit(10, 999), { min: THREE_PVP.MIN_LEVEL, max: THREE_PVP.MAX_LEVEL });
  assert.deepEqual(clampLimit(70, 90), { min: 70, max: 90 });
  assert.deepEqual(clampLimit(90, 70), { min: 70, max: 90 });
  assert.deepEqual(clampLimit('60', '80'), { min: 60, max: 80 });
  assert.equal(clampLimit('x', 80), null);
});

test('create: smallest free id, defaults, wire view with masked password and seat map', () => {
  const book = new RoomBook();
  const a = book.create(seat(1));
  const b = book.create(seat(2));
  assert.deepEqual([a.id, b.id], [1, 2]);
  book.remove(1);
  assert.equal(book.create(seat(3)).id, 1, 'the freed id is reused');
  const wire = book.toWire(b);
  assert.equal(wire.pass, '');
  assert.deepEqual(wire.limit, { lev: { min: 50, max: 160 } });
  assert.deepEqual(Object.keys(wire.memberList), ['1']);
  b.pass = '123';
  assert.equal(book.toWire(b).pass, '*');
});

test('join refusals follow the Go order: full, queued, level, password; an invite skips the password', () => {
  const book = new RoomBook();
  const room = book.create(seat(1));
  room.pass = '42';
  room.min = 60;
  room.max = 100;
  assert.equal(book.joinRefusal(room, 70, '1'), 'pass');
  assert.equal(book.joinRefusal(room, 70, '42'), null);
  assert.equal(book.joinRefusal(room, 70, '0042'), null, 'normalised before comparing');
  assert.equal(book.joinRefusal(room, 59, '42'), 'level');
  assert.equal(book.joinRefusal(room, 101, '42'), 'level');
  room.invited.add(9);
  assert.equal(book.joinRefusal(room, 70, '', 9), null);
  assert.equal(book.joinRefusal(room, 70, '', 8), 'pass');
  room.queued = true;
  assert.equal(book.joinRefusal(room, 20, 'x'), 'queued', 'queued wins over level and password');
  room.queued = false;
  book.join(room, seat(2));
  book.join(room, seat(3));
  assert.equal(book.joinRefusal(room, 20, 'x'), 'full', 'full wins over everything');
  assert.equal(room.invited.has(9), true);
});

test('remove: seats renumber, ready resets, the next seat leads, the room dies when empty, queue is dropped', () => {
  const book = new RoomBook();
  const room = book.create(seat(1));
  book.join(room, seat(2));
  book.join(room, seat(3));
  book.toggleReady(room, 2);
  room.queued = true;
  const r = book.remove(1)!;
  assert.equal(r.newLeaderId, 2);
  assert.equal(r.wasQueued, true);
  assert.equal(room.queued, false);
  assert.equal(room.ready.size, 0);
  assert.equal(book.seatOf(room, 2), 1);
  assert.equal(book.seatOf(room, 3), 2);
  assert.equal(book.roomOf(1), undefined);
  const k = book.remove(3)!;
  assert.equal(k.newLeaderId, null);
  assert.equal(room.leaderId, 2);
  const last = book.remove(2)!;
  assert.equal(last.empty, true);
  assert.equal(book.get(room.id), undefined);
  assert.equal(book.remove(99), null);
});

test('ready and start: the leader needs every other member ready, a solo leader starts at once', () => {
  const book = new RoomBook();
  const room = book.create(seat(1));
  assert.equal(book.canStart(room), true);
  book.join(room, seat(2));
  book.join(room, seat(3));
  assert.equal(book.canStart(room), false);
  assert.equal(book.toggleReady(room, 1), null, 'the leader does not toggle');
  assert.equal(book.toggleReady(room, 99), null);
  assert.equal(book.toggleReady(room, 2), true);
  assert.equal(book.canStart(room), false);
  assert.equal(book.toggleReady(room, 3), true);
  assert.equal(book.canStart(room), true);
  assert.equal(book.toggleReady(room, 3), false);
  assert.equal(book.canStart(room), false);
});

test('emptySeats lists the seats armLeader pretends are ready (2..3)', () => {
  const book = new RoomBook();
  const room = book.create(seat(1));
  assert.deepEqual(book.emptySeats(room), [2, 3]);
  book.join(room, seat(2));
  assert.deepEqual(book.emptySeats(room), [3]);
  book.join(room, seat(3));
  assert.deepEqual(book.emptySeats(room), []);
});

test('toWire: leader and ready members show state 1, others 0', () => {
  const book = new RoomBook();
  const room = book.create(seat(1));
  book.join(room, seat(2));
  book.join(room, seat(3));
  book.toggleReady(room, 2);
  const w = book.toWire(room).memberList;
  assert.deepEqual([w['1'].state, w['2'].state, w['3'].state], [1, 1, 0]);
  assert.equal(w['2'].name, 'P2');
});
