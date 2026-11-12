// Pure helpers of the Hồn Khí window (run from server/: node --test --import tsx ../client/src/ui/deco/decoRules.test.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DecoPositionInfo, DecoShowRow, RuneBag, RuneRow } from '@mc/shared';
import { dissolveGain, firstSocket, pageHoles, pageTotals, showState } from './decoRules';

const rune = (i: number, k: number, pt: number, pn = 100): RuneRow => ({ i, k, ty: pt, lv: 1, q: 1, nx: 0, e: 10, ue: 25, pt, pn, ic: '0', nm: 0 });
const RUNES = new Map([[1, rune(1, 1, 1, 187)], [2, rune(2, 1, 4)], [3, rune(3, 2, 5)]]);
const runeOf = (id: number) => RUNES.get(id);
const pos = (level: number, r: number[] = [], over: Partial<DecoPositionInfo> = {}): DecoPositionInfo => ({
  position: 1, hid: 1, did: 0, isShow: 0, showLvl: 1, level, n: 0, r: [...r, ...new Array<number>(16 - r.length).fill(0)], activeFlag: { r: {}, s: {} }, ...over,
});

test('pageHoles: odd for the character page, even for the pet page', () => {
  assert.deepEqual(pageHoles(0), [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(pageHoles(1), [2, 4, 6, 8, 10, 12, 14, 16]);
});

test('firstSocket skips locked slots, filled holes and duplicate prop types', () => {
  assert.equal(firstSocket(pos(0), RUNES.get(1)!, runeOf), 0, 'every slot locked at level 0');
  assert.equal(firstSocket(pos(5), RUNES.get(1)!, runeOf), 1);
  assert.equal(firstSocket(pos(10, [1]), RUNES.get(2)!, runeOf), 3);
  assert.equal(firstSocket(pos(50, [0, 0, 1]), RUNES.get(1)!, runeOf), 0, 'same type already on the page');
  assert.equal(firstSocket(pos(50), RUNES.get(3)!, runeOf), 2, 'pet rune goes to an even hole');
});

test('showState reads the activated map and the equipped show', () => {
  const show = { id: 5 } as DecoShowRow;
  assert.equal(showState(pos(0), show, 100), 'locked');
  const p = pos(0, [], { activeFlag: { r: {}, s: { 5: 1 } } });
  assert.equal(showState(p, show, 100), 'owned');
  assert.equal(showState({ ...p, did: 5 }, show, 100), 'worn');
  assert.equal(showState(pos(0, [], { activeFlag: { r: {}, s: { 5: 50 } } }), show, 100), 'locked', 'expired');
});

test('dissolveGain and pageTotals', () => {
  const bag: RuneBag = { chaBag: { 0: { n: 3, r: 1 }, 1: { n: 1, r: 2 } }, petBag: {}, upLvlHole: 0 };
  assert.equal(dissolveGain(bag, 0, new Set(['0', '1', '9']), runeOf), 40);
  const info = { 1: pos(50, [1, 3]), 2: pos(50, [1]) };
  assert.deepEqual(pageTotals(info, 0, runeOf), [{ t: 1, v: 374 }]);
  assert.deepEqual(pageTotals(info, 1, runeOf), [{ t: 5, v: 100 }]);
});
