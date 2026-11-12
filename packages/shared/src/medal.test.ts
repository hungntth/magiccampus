// Medal engrave line + panel value rules (M13 phase E2).

import assert from 'node:assert/strict';
import test from 'node:test';
import { MEDAL, medalEngraveLine, medalIsBag, medalIsEquip, medalPanelValue, type MedalRow } from './medal.js';

const row = (id: number, basic: number, level: number, sid: number, join = ''): MedalRow => ({
  id, basic, level, sid, clevel: 0, exp: 1, upExp: 1, q: 0, pt: 1, pv: 12345, pf: 0, name: `m${id}`, desc: '', icon: '0', join,
});

test('slot predicates', () => {
  assert.ok(medalIsBag(1) && medalIsBag(600) && !medalIsBag(0) && !medalIsBag(601));
  assert.ok(medalIsEquip(1001) && medalIsEquip(2005) && !medalIsEquip(1006) && !medalIsEquip(2006));
  assert.equal(MEDAL.BAG_MAX, 600);
});

test('panel value is prop_val / 100', () => {
  assert.equal(medalPanelValue({ pv: 55400 }), 554);
});

test('engrave line needs five distinct basics, uses the lowest level and the matching join', () => {
  const worn = [1, 2, 3, 4, 5].map((b, i) => row(100 + i, b, 3 + (i === 2 ? 0 : 2), 2001 + i));
  const lines = [row(900, 0, 3, 2006, '|1|2|3|4|5|'), row(901, 0, 5, 2006, '|1|2|3|4|5|'), row(902, 0, 3, 2006, '|1|2|3|4|6|'), row(903, 0, 3, 1006, '|1|2|3|4|5|')];
  assert.equal(medalEngraveLine(MEDAL.CHAR_ENGRAVE, worn, lines)?.id, 900);
  assert.equal(medalEngraveLine(MEDAL.PET_ENGRAVE, worn, lines)?.id, 903);
  assert.equal(medalEngraveLine(MEDAL.CHAR_ENGRAVE, [...worn.slice(0, 4), undefined], lines), undefined);
  assert.equal(medalEngraveLine(MEDAL.CHAR_ENGRAVE, worn.map((m) => ({ ...m, level: 0 })), lines), undefined);
  assert.equal(medalEngraveLine(MEDAL.CHAR_ENGRAVE, [...worn.slice(0, 4), { ...worn[0]!, id: 7 }], lines), undefined);
});
