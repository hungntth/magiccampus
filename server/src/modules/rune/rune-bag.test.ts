// Pure rune rules: parsers, stacking, runeMove (bag / up-level hole), arrange, resolve, chip exchange (rare families stay), socket plans, stats.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyRuneBag, type DecoHoleRow, type RuneBag } from '@mc/shared';
import { BUFF_PROP } from '../character/character-stats';
import { emptyDeco, parseDeco } from '../deco/deco-state';
import type { DecoRuneDef, RuneChipDef } from '../gamedata/deco-data';
import { addChips, addRune, arrange, canAdd, moveRune, parseChipBag, parseRuneBag, planExchange, planResolve, takeOne } from './rune-bag';
import { planSocket, planUnsocket, planUpLevel } from './rune-socket';
import { PET_RUNE_PROPS, runeBonuses, runeTotals } from './rune-stats';

const rune = (id: number, kind: number, type: number, over: Partial<DecoRuneDef> = {}): DecoRuneDef => ({
  id, kind, type, level: 1, color: 1, nextId: id + 1, exp: 10, upExp: 25, propType: type, propNum: 100, name: `R${id}`, iconCode: '0', ...over,
});
const RUNES = new Map<number, DecoRuneDef>([
  [1, rune(1, 1, 1, { propNum: 187 })], [2, rune(2, 1, 1, { nextId: 0, propNum: 375 })], [3, rune(3, 1, 4)], [4, rune(4, 2, 5)], [5, rune(5, 2, 1)],
  [10, rune(10, 1, 14, { propNum: 312 })], [11, rune(11, 1, 13, { propNum: 375 })], [12, rune(12, 1, 62, { propNum: 6 })],
]);
const runeOf = (id: number) => RUNES.get(id);
const hole = (level: number): DecoHoleRow => ({ id: 9, position: 1, level, nextId: 0, costNum: 0, costSil: 0, rate: 0, props: [] });
const holeOf = () => hole(50);
const bagWith = (cha: Record<string, { n: number; r: number }>, pet: Record<string, { n: number; r: number }> = {}): RuneBag => ({ chaBag: cha, petBag: pet, upLvlHole: 0 });
const fullBag = (): RuneBag => bagWith(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i), { n: 1, r: 100 + i }])));

test('parsers keep valid slots and drop junk', () => {
  const bag = parseRuneBag({ chaBag: { 0: { n: 2, r: 1 }, 5: { n: 0, r: 1 }, x: { n: 1, r: 1 }, 100: { n: 1, r: 1 } }, petBag: { 3: { n: 1, r: 4 } }, upLvlHole: 7 });
  assert.deepEqual(bag, { chaBag: { 0: { n: 2, r: 1 } }, petBag: { 3: { n: 1, r: 4 } }, upLvlHole: 7 });
  assert.deepEqual(emptyRuneBag(), parseRuneBag(undefined));
  assert.deepEqual(parseChipBag({ bag: { 1: { chipId: '5', num: 12 }, 0: { chipId: '5', num: 1 }, 2: { chipId: 'x', num: 3 } } }), { 1: { chipId: '5', num: 12 } });
});

test('addRune stacks, prefers the asked slot, takeOne shrinks and frees', () => {
  let bag = addRune(emptyRuneBag(), 0, 1, 2)!;
  bag = addRune(bag, 0, 1, 3)!;
  assert.deepEqual(bag.chaBag, { 0: { r: 1, n: 5 } });
  bag = addRune(bag, 0, 3, 1, 7)!;
  assert.deepEqual(bag.chaBag[7], { r: 3, n: 1 });
  const t = takeOne(bag, 0, 0)!;
  assert.equal(t.bag.chaBag[0].n, 4);
  assert.equal(takeOne(bag, 0, 7)!.bag.chaBag[7], undefined);
  assert.equal(takeOne(bag, 0, 9), null);
  assert.equal(addRune(fullBag(), 0, 1, 1), null);
  assert.equal(canAdd(fullBag(), 0, 105), true);
  assert.equal(canAdd(fullBag(), 0, 1), false);
});

test('runeMove: swap, move, up-level hole in and out, refusals', () => {
  const bag = bagWith({ 0: { n: 2, r: 1 }, 1: { n: 1, r: 3 } });
  assert.deepEqual(moveRune(bag, 0, 0, 5, runeOf)!.chaBag[5], { n: 2, r: 1 });
  const swapped = moveRune(bag, 0, 0, 1, runeOf)!;
  assert.equal(swapped.chaBag[0].r, 3);
  const into = moveRune(bag, 0, 0, -1, runeOf)!;
  assert.equal(into.upLvlHole, 1);
  assert.equal(into.chaBag[0].n, 1);
  assert.equal(moveRune(into, 0, 1, -1, runeOf), null, 'hole busy');
  const back = moveRune(into, 0, -1, 0, runeOf)!;
  assert.equal(back.upLvlHole, 0);
  assert.equal(back.chaBag[0].n, 2);
  assert.equal(moveRune(into, 0, -1, 1, runeOf), null, 'occupied by another rune');
  assert.equal(moveRune({ ...into, upLvlHole: 4 }, 0, -1, 9, runeOf), null, 'pet rune cannot enter the character bag');
  assert.equal(moveRune(bag, 0, 50, 2, runeOf), null);
});

test('arrange packs keys in order', () => {
  const bag = arrange(bagWith({ 7: { n: 1, r: 1 }, 2: { n: 1, r: 3 }, 40: { n: 2, r: 2 } }), 0);
  assert.deepEqual(Object.keys(bag.chaBag), ['0', '1', '2']);
  assert.equal(bag.chaBag[0].r, 3);
  assert.equal(bag.chaBag[2].r, 2);
});

test('planResolve sums exp x stack, skips mismatching ids', () => {
  const p = planResolve(bagWith({ 0: { n: 3, r: 1 }, 1: { n: 1, r: 3 }, 2: { n: 5, r: 2 } }), 0, { 0: 1, 1: 99, 2: 0, 9: 1 }, runeOf);
  assert.equal(p.gained, 3 * 10 + 5 * 10);
  assert.deepEqual(Object.keys(p.bag.chaBag), ['1']);
});

test('planExchange: floor(stack / num), remainder stays, rare families refused, unknown skipped', () => {
  const chips = new Map<number, RuneChipDef>([[1, { id: 1, kind: 1, name: 'c', num: 10, rid: 1, iconCode: '0' }], [2, { id: 2, kind: 1, name: 'c', num: 10, rid: 10, iconCode: '0' }]]);
  const r = planExchange({ 1: { chipId: '1', num: 25 }, 2: { chipId: '2', num: 30 }, 3: { chipId: '77', num: 99 } }, (id) => chips.get(id), runeOf);
  assert.equal(r.converted, 2);
  assert.equal(r.refusedRare, 3);
  assert.deepEqual(r.made.get(1), 2);
  assert.deepEqual(r.chips, { 1: { chipId: '1', num: 5 }, 2: { chipId: '2', num: 30 }, 3: { chipId: '77', num: 99 } });
  assert.deepEqual(addChips({ 1: { chipId: '5', num: 1 } }, 5, 2), { 1: { chipId: '5', num: 3 } });
  assert.deepEqual(addChips({ 1: { chipId: '5', num: 1 } }, 6, 2), { 1: { chipId: '5', num: 1 }, 2: { chipId: '6', num: 2 } });
});

test('planSocket validates parity, kind, level, filled hole and same type; planUnsocket needs room', () => {
  const bag = bagWith({ 0: { n: 2, r: 1 }, 1: { n: 1, r: 3 } }, { 0: { n: 1, r: 4 } });
  const deco = emptyDeco();
  const ok = planSocket(bag, deco, 0, 0, 1, 1, runeOf, holeOf);
  assert.ok(ok.ok);
  if (!ok.ok) return;
  assert.equal(ok.deco.pos['1'].r[0], 1);
  assert.equal(ok.bag.chaBag[0].n, 1);
  assert.equal(planSocket(bag, deco, 0, 0, 2, 1, runeOf, holeOf).ok, false, 'even hole for a character bag');
  assert.equal(planSocket(bag, deco, 1, 0, 2, 1, runeOf, holeOf).ok, true, 'pet rune on an even hole');
  assert.equal(planSocket(bag, deco, 1, 0, 1, 1, runeOf, holeOf).ok, false, 'pet bag on an odd hole');
  assert.equal(planSocket(bag, deco, 0, 5, 1, 1, runeOf, holeOf).ok, false, 'empty bag slot');
  assert.equal(planSocket(bag, deco, 0, 0, 1, 1, runeOf, () => hole(1)).ok, false, 'slot locked at level 1');
  assert.equal(planSocket(ok.bag, ok.deco, 0, 0, 1, 1, runeOf, holeOf).ok, false, 'filled hole');
  const dup = planSocket(ok.bag, ok.deco, 0, 0, 3, 1, runeOf, holeOf);
  assert.equal(dup.ok, false, 'same prop type on the same page');
  assert.ok(planSocket(ok.bag, ok.deco, 0, 0, 3, 2, runeOf, holeOf).ok, 'same type on another Hồn Khí');
  const un = planUnsocket(ok.bag, ok.deco, 0, 0, 1, 1, runeOf);
  assert.ok(un.ok && un.deco.pos['1'].r[0] === 0 && un.bag.chaBag[0].n === 2);
  assert.equal(planUnsocket(ok.bag, ok.deco, 0, 0, 3, 1, runeOf).ok, false, 'empty hole');
  assert.equal(planUnsocket(fullBag(), ok.deco, 0, 0, 1, 1, runeOf).ok, false, 'bag full');
});

test('planUpLevel: staged rune, max level, not enough exp, spends up_exp', () => {
  const staged = (id: number): RuneBag => ({ ...emptyRuneBag(), upLvlHole: id });
  assert.equal(planUpLevel(emptyRuneBag(), 99, runeOf).ok, false);
  assert.equal(planUpLevel(staged(2), 99, runeOf).ok, false, 'max level');
  assert.equal(planUpLevel(staged(1), 24, runeOf).ok, false);
  const p = planUpLevel(staged(1), 25, runeOf);
  assert.ok(p.ok && p.cost === 25 && p.bag.upLvlHole === 2);
});

test('rune stats: open slots only, one value per type per page, panel scale, pet page, flat rounding', () => {
  const deco = parseDeco({ pos: { 1: { hid: 1, r: [1, 4, 0, 0, 11, 0, 12, 0, 10, 0, 0, 0, 0, 0, 0, 0] }, 2: { hid: 1, r: [2] } } });
  const level = (l: number) => (id: number) => ({ ...hole(l), id });
  const at50 = runeTotals(deco, 'cha', level(50), runeOf);
  assert.equal(at50.get(1), 187 + 375, 'two Hồn Khí add up');
  assert.equal(at50.get(13), 0.0375);
  assert.equal(at50.get(62), 0.06);
  assert.equal(at50.get(14), 0.0312);
  assert.equal(runeTotals(deco, 'pet', level(50), runeOf).get(5), 100);
  const lv5 = runeTotals(deco, 'cha', level(5), runeOf);
  assert.equal(lv5.get(1), 187 + 375, 'slot 1 opens at level 5');
  assert.equal(lv5.has(13), false, 'slot 5 needs level 15');
  const b = runeBonuses(at50, BUFF_PROP);
  assert.equal(b.flat.maxHp, 562);
  assert.equal(b.flat.critical, undefined, 'tiny flat values round to nothing');
  assert.equal(b.rates.finalDefy, 0.0312);
  assert.equal(runeBonuses(runeTotals(deco, 'pet', level(50), runeOf), PET_RUNE_PROPS).flat.magicAttack, 100);
});
