// Unit tests for the shared mail helpers (remaining days, content flags, clipping).
import test from 'node:test';
import assert from 'node:assert/strict';
import { clipText, mailHasContent, mailIsCod, mailIsSystem, mailRemainingDays } from './mail.js';

const DAY = 86_400_000;

test('remaining days: unread counts from the send date, truncating like Flash int()', () => {
  const now = 100 * DAY;
  assert.equal(mailRemainingDays({ date: now, readDate: -1 }, now), 30);
  assert.equal(mailRemainingDays({ date: now - 0.5 * DAY, readDate: -1 }, now), 29);
  assert.equal(mailRemainingDays({ date: now - 29.2 * DAY, readDate: -1 }, now), 0);
  assert.equal(mailRemainingDays({ date: now - 40 * DAY, readDate: -1 }, now), 0);
});

test('remaining days: read mail counts 10 days from the read date', () => {
  const now = 100 * DAY;
  assert.equal(mailRemainingDays({ date: now - 20 * DAY, readDate: now - 3 * DAY }, now), 7);
  assert.equal(mailRemainingDays({ date: 0, readDate: now }, now), 10);
});

test('content and cod flags', () => {
  assert.equal(mailHasContent({ money: 0, gold: 0, itemType: -1 }), false);
  assert.equal(mailHasContent({ money: 1, gold: 0, itemType: -1 }), true);
  assert.equal(mailHasContent({ money: 0, gold: 0, itemType: 29 }), true);
  assert.equal(mailIsCod({ codMoney: 0, codGold: 0 }), false);
  assert.equal(mailIsCod({ codMoney: 0, codGold: 2 }), true);
  assert.equal(mailIsSystem({ senderId: '0' }), true);
  assert.equal(mailIsSystem({ senderId: 5 }), false);
});

test('clipText trims then clips by code points', () => {
  assert.equal(clipText('  abc  ', 10), 'abc');
  assert.equal(clipText('abcdef', 3), 'abc');
  assert.equal(clipText('ăâêôơư', 3), 'ăâê');
});
