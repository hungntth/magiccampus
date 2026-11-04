// Ranking rules: ordering, tie-break, empty categories, guild-name join, cache expiry with an injected clock.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RANK_TOP } from '@mc/shared';
import { RankCache, emptyReply, isLive, toRows, topChars, type RankChar } from './rank-rules';

const ch = (id: number, level: number, exp: number, money = 0, moneyBind = 0): RankChar =>
  ({ id, name: `c${id}`, level, exp, money, moneyBind });

test('exp: level first, then exp, then lower id', () => {
  const chars = [ch(1, 10, 500), ch(2, 12, 100), ch(3, 10, 900), ch(4, 10, 900)];
  assert.deepEqual(topChars('exp', chars).map((c) => c.id), [2, 3, 4, 1]);
});

test('money: bound + unbound, tie to lower id', () => {
  const chars = [ch(1, 1, 0, 100, 0), ch(2, 1, 0, 50, 60), ch(3, 1, 0, 0, 110), ch(4, 1, 0, 5, 0)];
  assert.deepEqual(topChars('money', chars).map((c) => c.id), [2, 3, 1, 4]);
  assert.equal(toRows('money', topChars('money', chars), new Map())[0].value, 110);
});

test('limit and input immutability', () => {
  const chars = Array.from({ length: 150 }, (_, i) => ch(i + 1, 1 + (i % 7), i));
  const snapshot = chars.map((c) => c.id);
  assert.equal(topChars('exp', chars).length, RANK_TOP);
  assert.equal(topChars('exp', chars, 3).length, 3);
  assert.deepEqual(chars.map((c) => c.id), snapshot);
});

test('categories without a data source are empty', () => {
  const chars = [ch(1, 5, 5, 5)];
  for (const c of ['expBattle', 'pop', 'popMonth', 'popWeek', 'totalBp', 'lastWeekBp', 'achPoint', 'treasureHunt'] as const) {
    assert.equal(isLive(c), false);
    assert.deepEqual(topChars(c, chars), []);
    assert.deepEqual(emptyReply(c), { name: c, data: [] });
  }
  assert.equal(isLive('exp'), true);
});

test('guild name join: level value, empty string without a guild', () => {
  const picked = [ch(1, 30, 1), ch(2, 20, 1)];
  const rows = toRows('exp', picked, new Map([[1, 'Thien Long']]));
  assert.deepEqual(rows, [
    { id: 1, name: 'c1', guild: 'Thien Long', value: 30 },
    { id: 2, name: 'c2', guild: '', value: 20 },
  ]);
});

test('cache serves within ttl, reloads after, shares concurrent misses, drops failures', async () => {
  let t = 1000;
  let loads = 0;
  const cache = new RankCache(300_000, () => t);
  const load = async () => { loads += 1; return emptyReply('exp'); };
  const [a, b] = await Promise.all([cache.get('exp', load), cache.get('exp', load)]);
  assert.equal(a, b);
  assert.equal(loads, 1);
  t += 299_999;
  await cache.get('exp', load);
  assert.equal(loads, 1);
  t += 1;
  await cache.get('exp', load);
  assert.equal(loads, 2);
  await cache.get('money', load); // other category, own entry
  assert.equal(loads, 3);
  await assert.rejects(cache.get('pop', async () => { throw new Error('boom'); }));
  await cache.get('pop', load);
  assert.equal(loads, 4);
});
