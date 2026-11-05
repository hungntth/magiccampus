// Tests for the Mật Đạo rules: book refusals in Go order, exp multiplier of the three floors, exp base, elite life.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bookRefusal, eliteLife, isSecretPassageBook, isSecretPassageMap, passageExpBase, passageExpMulti, SECRET_PASSAGE_TEXT as T,
} from './secret-passage-rules';

const ok = { level: 60, reqLevel: 10, inBattle: false, inGroup: false, mapId: 31 };

test('only books 128 and 2137 and maps 140104-140106 count', () => {
  assert.deepEqual([128, 2137, 129].map(isSecretPassageBook), [true, true, false]);
  assert.deepEqual([140104, 140105, 140106, 140107, 31].map(isSecretPassageMap), [true, true, true, false, false]);
});

test('refusals keep the book: level, battle, group, already inside (in that order)', () => {
  assert.equal(bookRefusal(ok), null);
  assert.equal(bookRefusal({ ...ok, level: 9 }), T.LEVEL);
  assert.equal(bookRefusal({ ...ok, level: 9, inBattle: true }), T.LEVEL);
  assert.equal(bookRefusal({ ...ok, inBattle: true, inGroup: true }), T.IN_BATTLE);
  assert.equal(bookRefusal({ ...ok, inGroup: true, mapId: 140106 }), T.IN_GROUP);
  assert.equal(bookRefusal({ ...ok, mapId: 140105 }), T.INSIDE);
});

test('exp: map exp_multi (min 1) x 2 on the level x 10 base unless the row has its own', () => {
  assert.equal(passageExpMulti(2), 4);
  assert.equal(passageExpMulti(2.5), 5);
  assert.equal(passageExpMulti(0), 2);
  assert.equal(passageExpBase(-1, 60, 2), 2400); // floors 1-2: 600 x 2 x 2
  assert.equal(passageExpBase(-1, 60, 2.5), 3000); // floor 3
  assert.equal(passageExpBase(500, 60, 2), 2000);
});

test('elite life is halved, never below 1', () => {
  assert.equal(eliteLife(286_459), 143_229);
  assert.equal(eliteLife(1), 1);
});
