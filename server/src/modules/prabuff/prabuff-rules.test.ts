// Prabuff state parsing and the player-track stat bonuses.

import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePraTrack, parsePraTracks, praBonuses, praPatch } from './prabuff-rules';

test('parses flat track fields defensively', () => {
  const raw = { t1_level: 3, t1_exp: 800, t5_level: 99, t7_exp: -4, t2_level: 'x' };
  assert.deepEqual(parsePraTrack(raw, 1), { level: 3, exp: 800 });
  assert.deepEqual(parsePraTrack(raw, 5), { level: 30, exp: 0 });
  assert.deepEqual(parsePraTrack(raw, 7), { level: 0, exp: 0 });
  assert.equal(parsePraTracks(undefined).length, 8);
  assert.deepEqual(praPatch(3, { level: 2, exp: 9 }), { t3_level: 2, t3_exp: 9 });
});

test('player tracks feed reduce / enhance rates and speed percent; pet tracks do nothing', () => {
  const tracks = parsePraTracks({ t1_level: 30, t2_level: 30, t3_level: 10, t5_level: 30, t7_level: 20, t8_level: 30 });
  const b = praBonuses(tracks);
  assert.equal(b.rates.finalReduceHurt1, 20.26);
  assert.equal(b.rates.finalReduceHurt2, 3.02);
  assert.equal(b.rates.finalEnhPhyHurt, 35);
  assert.equal(b.pct.speed, 10.6);
  assert.deepEqual(Object.keys(b.rates).sort(), ['finalEnhPhyHurt', 'finalReduceHurt1', 'finalReduceHurt2']);
});

test('no levels, no bonuses', () => {
  const b = praBonuses(parsePraTracks({}));
  assert.deepEqual([b.rates, b.pct], [{}, {}]);
});
