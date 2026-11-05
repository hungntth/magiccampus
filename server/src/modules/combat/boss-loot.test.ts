// Boss loot rules: eligibility filters, rate / quest gates, reward types, level gap.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eligibleBossLoot, toBossLootRow, type BossLootRow } from '../gamedata/boss-loot';
import { aboveBossGap, bossRate, rollBossLoot } from './boss-loot';
import type { LootContext } from './loot';

const row = (over: Partial<BossLootRow> = {}): BossLootRow => ({
  id: 1, bossNid: 706, itemId: 100, quality: 0, rate: 50000, qtyMin: 1, qtyMax: 1, bound: false, type: 29, tierFilter: null, sourceFilter: null,
  questId: 0, active: true, ...over,
});
const ctx = (quests: number[] = []): LootContext => ({ activeQuests: new Set(quests), needs: new Map() });

test('toBossLootRow maps the seed columns', () => {
  const r = toBossLootRow({ id: 5, boss_nid: 2204, item_id: 7, rate: 4000, qty_min: 1, qty_max: 2, bound: true, type: 29, tier_filter: null, source_filter: 'daily', qid: 0, is_active: true });
  assert.deepEqual([r.bossNid, r.itemId, r.rate, r.qtyMax, r.bound, r.sourceFilter, r.questId], [2204, 7, 4000, 2, true, 'daily', 0]);
});

test('eligibleBossLoot filters by tier, source and active', () => {
  const rows = [row({ id: 1 }), row({ id: 2, sourceFilter: 'daily' }), row({ id: 3, tierFilter: 'mythic' }), row({ id: 4, active: false })];
  assert.deepEqual(eligibleBossLoot(rows, 'schedule', 'normal').map((r) => r.id), [1]);
  assert.deepEqual(eligibleBossLoot(rows, 'daily', 'normal').map((r) => r.id), [1, 2]);
  assert.deepEqual(eligibleBossLoot(rows, 'schedule', 'mythic').map((r) => r.id), [1, 3]);
});

test('rate: qid rows need the quest, a still-needed item is x5 capped at 50000', () => {
  assert.equal(bossRate(row({ questId: 9 }), ctx()), 0);
  assert.equal(bossRate(row({ questId: 9, rate: 100 }), ctx([9])), 100);
  const c = ctx();
  c.needs.set(100, { current: 0, required: 3 });
  assert.equal(bossRate(row({ rate: 9000 }), c), 45000);
  assert.equal(bossRate(row({ rate: 20000 }), c), 50000);
});

test('roll: success is rand(50000) + 1 <= rate; qty uniform; types map to drop kinds', () => {
  const rows = [row({ rate: 1, qtyMin: 2, qtyMax: 4 }), row({ id: 2, type: 31, rate: 50000, qtyMin: 100, qtyMax: 100 }), row({ id: 3, type: 35, itemId: 213, rate: 50000 }), row({ id: 4, type: 30, itemId: 2, rate: 50000, bound: true })];
  const lows = rollBossLoot(rows, ctx(), () => 0); // rand 0 -> roll 1: every row hits, qty at min
  assert.deepEqual(lows.map((d) => d.kind), ['item', 'exp', 'currency', 'basic']);
  assert.equal(lows[0].kind === 'item' && lows[0].qty, 2);
  const none = rollBossLoot([row({ rate: 1 })], ctx(), () => 0.5);
  assert.equal(none.length, 0);
});

test('a drop of a needed item raises the need for the next roll', () => {
  const c = ctx();
  c.needs.set(100, { current: 0, required: 1 });
  rollBossLoot([row({ rate: 50000, qtyMin: 1, qtyMax: 1 })], c, () => 0);
  assert.equal(c.needs.get(100)!.current, 1);
});

test('level gap: more than 10 levels above the boss', () => {
  assert.equal(aboveBossGap(100, 90), false);
  assert.equal(aboveBossGap(101, 90), true);
});
