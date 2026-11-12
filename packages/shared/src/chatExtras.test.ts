// Tests for the chat leftovers helpers (M14 phase G): headline length, ban duration, time formats, lift command.

import test from 'node:test';
import assert from 'node:assert/strict';
import { banDuration, CHAT_BAN, formatBanLeft, formatBanUntil, HEADLINE, isBanLiftCommand, plainLength } from './chatExtras.js';

test('plainLength strips tags, unescapes entities and trims', () => {
  assert.equal(plainLength('  hello  '), 5);
  assert.equal(plainLength('<font color="#ff0000">abc</font>'), 3);
  assert.equal(plainLength('a&amp;b'), 3);
  assert.equal(plainLength('&lt;&gt;'), 2);
  assert.equal(plainLength('Xin chào bạn'), 12);
  assert.equal(plainLength('x'.repeat(HEADLINE.maxChars)), HEADLINE.maxChars);
  assert.ok(plainLength('x'.repeat(HEADLINE.maxChars + 1)) > HEADLINE.maxChars);
  assert.equal(plainLength('😀😀'), 2);
});

test('banDuration: positive 4th arg = 12 h, anything else 20 min', () => {
  assert.equal(banDuration(undefined).ms, CHAT_BAN.shortMs);
  assert.equal(banDuration(0).ms, CHAT_BAN.shortMs);
  assert.equal(banDuration(-3).ms, CHAT_BAN.shortMs);
  assert.equal(banDuration('abc').ms, CHAT_BAN.shortMs);
  assert.deepEqual(banDuration(12), { ms: CHAT_BAN.longMs, label: '12 giờ' });
  assert.equal(banDuration('1').ms, CHAT_BAN.longMs);
  assert.equal(banDuration(0).label, '20 phút');
});

test('formatBanUntil is UTC+7 HH:MM DD/MM', () => {
  assert.equal(formatBanUntil(Date.UTC(2026, 10, 12, 16, 30)), '23:30 12/11');
  assert.equal(formatBanUntil(Date.UTC(2026, 10, 12, 17, 5)), '00:05 13/11');
});

test('formatBanLeft rounds up to minutes and switches to hours', () => {
  assert.equal(formatBanLeft(1), '1 phút');
  assert.equal(formatBanLeft(61_000), '2 phút');
  assert.equal(formatBanLeft(CHAT_BAN.shortMs), '20 phút');
  assert.equal(formatBanLeft(CHAT_BAN.longMs), '12 giờ');
  assert.equal(formatBanLeft(90 * 60_000), '1 giờ 30 phút');
});

test('isBanLiftCommand matches both commands case-insensitively, whole message only', () => {
  assert.equal(isBanLiftCommand('/huycam'), true);
  assert.equal(isBanLiftCommand(' /HuyCamChat '), true);
  assert.equal(isBanLiftCommand('/huycam please'), false);
  assert.equal(isBanLiftCommand('huycam'), false);
});
