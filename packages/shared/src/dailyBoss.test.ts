// Daily boss config and the attempt / cooldown gate with an injected clock.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOSS_DAILY_CONFIG, BOSS_DAILY_COOLDOWN_MS, BOSS_DAILY_TOTAL, bossDailyAfterStart, bossDailyGate, bossDailyRoll, type BossDailyCounters,
} from './dailyBoss.js';

const empty = (day = '2026-11-04'): BossDailyCounters => ({ day, used: 0, perBoss: {} });
const T0 = Date.parse('2026-11-04T05:00:00Z');
const reason = (c: BossDailyCounters, id: number, now: number): string => {
  const g = bossDailyGate(c, id, now);
  return g.ok ? 'ok' : g.reason;
};

test('79 configured bosses with the Go attempt counts', () => {
  assert.equal(BOSS_DAILY_CONFIG.size, 79);
  assert.deepEqual([BOSS_DAILY_CONFIG.get(2204)?.num, BOSS_DAILY_CONFIG.get(2221)?.num, BOSS_DAILY_CONFIG.get(2567)?.num], [2, 4, 4]);
  assert.equal(BOSS_DAILY_CONFIG.get(2265)?.type, 2);
  assert.equal(BOSS_DAILY_CONFIG.get(2265)?.step, BOSS_DAILY_COOLDOWN_MS);
});

test('type 1 boss: attempts consumed at start, refused at the limit, reset next day', () => {
  let c = empty();
  assert.equal(reason(c, 2204, T0), 'ok');
  c = bossDailyAfterStart(c, 2204, '2026-11-04', T0);
  c = bossDailyAfterStart(c, 2204, '2026-11-04', T0 + 1);
  assert.deepEqual([c.used, c.perBoss['2204']], [2, { n: 2 }]);
  assert.equal(reason(c, 2204, T0 + 2), 'attempts');
  assert.equal(reason(c, 2205, T0 + 2), 'ok');
  const next = bossDailyRoll(c, '2026-11-05');
  assert.deepEqual([next.used, next.perBoss['2204']], [0, { n: 0 }]);
  assert.equal(reason(next, 2204, T0 + 86_400_000), 'ok');
});

test('type 2 boss: 72 h cooldown survives the day roll', () => {
  const c = bossDailyAfterStart(empty(), 2265, '2026-11-04', T0);
  assert.deepEqual(c.perBoss['2265'], { t: T0 });
  const tomorrow = bossDailyRoll(c, '2026-11-05');
  assert.deepEqual(tomorrow.perBoss['2265'], { t: T0 });
  assert.equal(reason(tomorrow, 2265, T0 + 86_400_000), 'cooldown');
  assert.equal(reason(tomorrow, 2265, T0 + BOSS_DAILY_COOLDOWN_MS), 'ok');
});

test('total cap and unknown boss', () => {
  assert.equal(reason({ day: '2026-11-04', used: BOSS_DAILY_TOTAL, perBoss: {} }, 2204, T0), 'total');
  assert.equal(reason(empty(), 9999, T0), 'unknown');
});
