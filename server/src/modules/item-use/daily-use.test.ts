// Daily use cap state (2795 x3 / 2796 x5 per UTC+7 day).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyLimitNotice, reserveDailyUse } from './daily-use';

test('counts up to the cap, then refuses', () => {
  let state: Record<string, unknown> = {};
  for (let i = 1; i <= 3; i++) {
    const next = reserveDailyUse(state, 2795, 3, '2026-11-07');
    assert.ok(next);
    assert.equal(next['2795'], i);
    state = next;
  }
  assert.equal(reserveDailyUse(state, 2795, 3, '2026-11-07'), null);
});

test('another template shares the day record; a new day starts from zero', () => {
  const state = reserveDailyUse({ day: '2026-11-07', '2795': 3 }, 2796, 5, '2026-11-07');
  assert.deepEqual(state, { day: '2026-11-07', '2795': 3, '2796': 1 });
  assert.deepEqual(reserveDailyUse({ day: '2026-11-06', '2795': 3 }, 2795, 3, '2026-11-07'), { day: '2026-11-07', '2795': 1 });
});

test('notice text', () => {
  assert.equal(dailyLimitNotice('Kết Tinh', 3), 'Kết Tinh mỗi ngày chỉ dùng được 3 cái, hôm nay bạn đã dùng đủ. Hãy quay lại vào ngày mai!');
});
