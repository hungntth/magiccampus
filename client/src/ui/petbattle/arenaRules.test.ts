// Tests for the arena window rules: log lines for attacker / defender, war report, cooldown clock, turn price.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arenaLogText, cooldownLeft, fmtClock, pushCapped, sysText, turnPrice } from './arenaRules';

test('attacker and defender lines read from their own side', () => {
  assert.match(arenaLogText({ guest: false, g_name: 'Bob', result: 1, pnt: 24, bid: 'b' }), /Khiêu chiến Bob thành công.*24 điểm/);
  assert.match(arenaLogText({ guest: false, g_name: 'Bob', result: 2, pnt: 12, bid: 'b' }), /Khiêu chiến Bob thất bại, nhận 12 điểm/);
  assert.match(arenaLogText({ guest: true, h_name: 'Ann', result: 1, bid: 'b' }), /^Annkhiêu chiến thành công/);
  assert.match(arenaLogText({ guest: true, h_name: 'Ann', result: 2, bid: 'b' }), /bảo vệ thành công/);
});

test('war report text by type and empty for no report', () => {
  assert.match(sysText({ id: 1, data: [1, 5, 'Cy', 5] }), /Cy tuần này.*5 lần/);
  assert.match(sysText({ id: 2, data: [2, 5, 'Cy', 120] }), /tăng 120 hạng/);
  assert.equal(sysText(null), '');
  assert.equal(sysText({}), '');
});

test('cooldown clock and turn price', () => {
  assert.equal(cooldownLeft(10_500, 10_000), 1);
  assert.equal(cooldownLeft(9_000, 10_000), 0);
  assert.equal(fmtClock(65), '01:05');
  assert.equal(fmtClock(-3), '00:00');
  assert.equal(turnPrice(20), 5);
  assert.equal(turnPrice(24), 25);
});

test('the log keeps the newest lines', () => {
  assert.deepEqual(pushCapped([1, 2, 3], 4, 3), [2, 3, 4]);
});
