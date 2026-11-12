// Medal rules (M13 phase E2): move / equip, unequip, level up, dissolve, arrange, engrave lines and the stat totals.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { MedalRow } from '@mc/shared';
import { PET_RUNE_PROPS } from '../rune/rune-stats';
import { BUFF_PROP } from '../character/character-stats';
import { addMedal, arrangeBag, isError, planBreak, planMove, planUp, refreshEngrave, type MedalLook } from './medal-rules';
import { emptyMedalState, parseMedal, type MedalState } from './medal-state';
import { medalBonuses, wornRows } from './medal-stats';

const row = (id: number, basic: number, level: number, sid: number, over: Partial<MedalRow> = {}): MedalRow => ({
  id, basic, level, sid, clevel: 0, exp: 10, upExp: 100, q: 0, pt: 6, pv: 55400, pf: 0, name: `m${id}`, desc: '', icon: '0', join: '', ...over,
});
// basic 1..5 -> character slots 2001..2005, levels 0..2; line rows join all five.
const rows: MedalRow[] = [];
for (let b = 1; b <= 5; b++) for (let lv = 0; lv <= 2; lv++) rows.push(row(b * 10 + lv, b, lv, 2000 + b, { clevel: lv * 10, q: b === 5 ? 4 : 0 }));
rows.push(row(900, 0, 1, 2006, { join: '|1|2|3|4|5|', pt: 4, pv: 1000 }));
const look = (level = 50): MedalLook => ({
  row: (id) => rows.find((r) => r.id === id),
  next: (r) => rows.find((x) => x.basic === r.basic && x.level === r.level + 1 && x.sid < 2006),
  lines: rows.filter((r) => r.sid === 2006),
  level,
});
const state = (bag: MedalState['bag'], exp = 0): MedalState => ({ ...emptyMedalState(), exp, bag });
const ok = <T>(v: T | { error: string }): T => {
  assert.ok(!isError(v), isError(v) ? v.error : '');
  return v as T;
};

test('parse is tolerant: string numbers, bad slots and empty entries dropped', () => {
  const s = parseMedal({ exp: '12', bag: { 1: { i: 1, t: '11', n: 2 }, 700: { t: 11, n: 1 }, 2: { t: 0, n: 1 }, 2001: { t: 11, n: 1 } }, petBuff: { t: 5 } });
  assert.equal(s.exp, 12);
  assert.deepEqual(Object.keys(s.bag).map(Number), [1, 2001]);
  assert.equal(s.petBuff, 5);
});

test('equip takes one unit, checks slot kind and level, returns the old medal to the bag', () => {
  let s = state({ 1: { t: 11, n: 3 }, 2: { t: 21, n: 1 } });
  assert.match(String((planMove(s, 2, 2001, look()) as { error: string }).error), /Vị trí/);
  assert.match(String((planMove(state({ 1: { t: 12, n: 1 } }), 1, 2001, look(15)) as { error: string }).error), /Cấp độ/);
  const p = ok(planMove(s, 1, 2001, look()));
  assert.deepEqual(p.state.bag[1], { t: 11, n: 2 });
  assert.deepEqual(p.state.bag[2001], { t: 11, n: 1 });
  assert.equal(p.push.type, 1);
  assert.deepEqual(p.push.ba, { 1: { i: 1, t: 11, n: 2 } });
  assert.deepEqual(p.push.pa, { 2001: { i: 2001, t: 11, n: 1 } });
  s = p.state;
  s.bag[1]!.t = 10; // swap in another medal of the same slot kind
  const q = ok(planMove(s, 1, 2001, look()));
  assert.equal(q.state.bag[2001]!.t, 10);
  assert.deepEqual(q.state.bag[3], { t: 11, n: 1 }); // the old worn medal returns to the first free slot
});

test('unequip merges onto a same-template stack, never swaps another medal into a worn slot', () => {
  const s = state({ 5: { t: 21, n: 1 }, 2001: { t: 11, n: 1 }, 7: { t: 11, n: 2 } });
  const p = ok(planMove(s, 2001, 5, look()));
  assert.equal(p.state.bag[2001], undefined);
  assert.equal(p.push.del, 2001);
  assert.deepEqual(p.state.bag[5], { t: 21, n: 1 });
  assert.deepEqual(p.state.bag[7], { t: 11, n: 3 });
  assert.ok(isError(planMove(s, 2001, 2002, look())));
  assert.ok(isError(planMove(s, 99, 5, look())));
});

test('bag to bag: move, merge and swap', () => {
  const s = state({ 1: { t: 11, n: 1 }, 2: { t: 21, n: 2 }, 3: { t: 11, n: 4 } });
  assert.deepEqual(ok(planMove(s, 1, 9, look())).state.bag[9], { t: 11, n: 1 });
  const merged = ok(planMove(s, 1, 3, look()));
  assert.deepEqual(merged.state.bag[3], { t: 11, n: 5 });
  assert.equal(merged.push.del, 1);
  const swapped = ok(planMove(s, 1, 2, look()));
  assert.deepEqual([swapped.state.bag[1]!.t, swapped.state.bag[2]!.t], [21, 11]);
});

test('engrave line follows the worn slots (needs all five, lowest level >= 1)', () => {
  const worn = state({ 2001: { t: 11, n: 1 }, 2002: { t: 21, n: 1 }, 2003: { t: 31, n: 1 }, 2004: { t: 41, n: 1 }, 2005: { t: 51, n: 1 } });
  assert.equal(refreshEngrave(worn, look()), true);
  assert.equal(worn.charBuff, 900);
  worn.bag[2005]!.t = 50; // level 0 medal in the set -> no line
  refreshEngrave(worn, look());
  assert.equal(worn.charBuff, 0);
  const b = medalBonuses(wornRows(worn, 'char', look().row, look().lines), BUFF_PROP);
  assert.equal(b.flat.defense, 554 * 5); // five worn medals, prop 6
});

test('level up spends up_exp, moves one unit to the next level, checks exp and character level', () => {
  const s = state({ 1: { t: 11, n: 2 } }, 150);
  assert.match(String((planUp(state({ 1: { t: 11, n: 1 } }, 50), 1, look()) as { error: string }).error), /kinh nghiệm/);
  assert.match(String((planUp(s, 1, look(5)) as { error: string }).error), /Cấp độ nhân vật/);
  assert.match(String((planUp(state({ 1: { t: 12, n: 1 } }, 500), 1, look()) as { error: string }).error), /cao nhất/);
  const p = ok(planUp(s, 1, look()));
  assert.equal(p.state.exp, 50);
  assert.deepEqual(p.state.bag[1], { t: 11, n: 1 });
  assert.deepEqual(p.state.bag[2], { t: 12, n: 1 });
  assert.equal(p.push.medalExp, 50);
  const single = ok(planUp(state({ 1: { t: 11, n: 1 }, 4: { t: 12, n: 2 } }, 100), 1, look()));
  assert.equal(single.state.bag[1], undefined);
  assert.deepEqual(single.state.bag[4], { t: 12, n: 3 });
  assert.equal(single.push.del, 1);
});

test('dissolve credits exp x count, clamps the count and refuses rare medals', () => {
  const s = state({ 1: { t: 11, n: 3 }, 2: { t: 51, n: 1 } });
  const p = ok(planBreak(s, 1, 99, look())) as { state: MedalState; push: { medalExp: number; del?: number } };
  assert.equal(p.state.exp, 30);
  assert.equal(p.push.del, 1);
  assert.deepEqual(planBreak(s, 2, 1, look()), { rare: true });
  assert.ok(isError(planBreak(s, 9, 1, look())));
  assert.ok(isError(planBreak(s, 1, 0, look())));
});

test('add and arrange', () => {
  const a = ok(addMedal(state({ 1: { t: 11, n: 1 } }), 11, 2));
  assert.equal(a.slot, 1);
  assert.equal(a.state.bag[1]!.n, 3);
  const b = ok(addMedal(a.state, 21, 1));
  assert.equal(b.slot, 2);
  const arranged = arrangeBag(state({ 5: { t: 21, n: 1 }, 400: { t: 11, n: 1 }, 2001: { t: 31, n: 1 } }));
  assert.deepEqual(Object.keys(arranged.bag).map(Number), [1, 2, 2001]);
  assert.equal(arranged.bag[1]!.t, 21);
});

test('pet medals map through the pet dictionary', () => {
  const s = state({ 1001: { t: 11, n: 1 } });
  const petRows = [row(11, 1, 1, 1001, { pt: 4, pv: 1234 })];
  const b = medalBonuses(wornRows(s, 'pet', (id) => petRows.find((r) => r.id === id), []), PET_RUNE_PROPS);
  assert.equal(b.flat.attack, 12); // 12.34 rounds after summing
});
