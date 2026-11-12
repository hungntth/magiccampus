// Pure helpers of the Hồn Khí / rune contract: look tiers, rune slot unlocks, show art by tier, expiry, panel scales and texts.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DECO_RUNE_UNLOCK_LEVELS, decoMaxShowLvl, decoRuneSlotOpen, decoShowArt, decoShowDue, decoShowLive, isRareRuneType, runeBagOfKind, runeHoleBag, runePanelScale,
  runeStatValue, runeValueText,
} from './index.js';

test('look tier by hole level: 1 below 30, 2 below 50, 3 at 50', () => {
  assert.deepEqual([0, 29, 30, 49, 50].map(decoMaxShowLvl), [1, 1, 2, 2, 3]);
});

test('rune slots open by level in pairs (character odd hole, pet even hole)', () => {
  assert.equal(DECO_RUNE_UNLOCK_LEVELS.length, 16);
  assert.deepEqual([4, 5].map((l) => decoRuneSlotOpen(l, 0)), [false, true]);
  assert.equal(decoRuneSlotOpen(49, 15), false);
  assert.equal(decoRuneSlotOpen(50, 15), true);
  assert.equal(decoRuneSlotOpen(50, 16), false);
});

test('show art picks main / mask of the tier, clamped', () => {
  const show = { res: ['11', '12', '21', '0', '31', '32'] };
  assert.deepEqual(decoShowArt(show, 1), ['11', '12']);
  assert.deepEqual(decoShowArt(show, 2), ['21', '0']);
  assert.deepEqual(decoShowArt(show, 3), ['31', '32']);
  assert.deepEqual(decoShowArt(show, 9), ['31', '32']);
  assert.deepEqual(decoShowArt(show, 0), ['11', '12']);
});

test('show expiry: permanent for t <= 1 minute, else now + t minutes; live until due', () => {
  assert.equal(decoShowDue(1, 1000), 1);
  assert.equal(decoShowDue(2, 1000), 1000 + 120_000);
  assert.equal(decoShowLive(1, 5), true);
  assert.equal(decoShowLive(10, 5), true);
  assert.equal(decoShowLive(4, 5), false);
});

test('rune panel scale and text (TipDecoRune)', () => {
  assert.deepEqual([1, 8, 34, 99].map(runePanelScale), [1, 10_000, 100, 0]);
  assert.equal(runeStatValue(1, 187), 187);
  assert.equal(runeStatValue(13, 375), 0.0375);
  assert.equal(runeValueText(34, 6), '0.06%');
  assert.equal(runeValueText(14, 312), '0.0312');
  assert.equal(runeStatValue(99, 5), 0);
});

test('rare families, bag kinds and hole parity', () => {
  assert.deepEqual([14, 61, 59, 60, 62, 63, 1].map(isRareRuneType), [true, true, true, true, true, true, false]);
  assert.deepEqual([1, 2].map(runeBagOfKind), [0, 1]);
  assert.deepEqual([1, 2, 15, 16].map(runeHoleBag), [0, 1, 0, 1]);
});
