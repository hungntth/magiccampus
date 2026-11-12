// Unit tests of the pure Tiểu Tinh Linh rules: state decode (Go shapes), grow plan / curve / crits, feeding, satiety, guard / rest, skins,
// skill learn / upgrade, passive buffs and the battle rotation.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FAIRY, FAIRY_GROW_EXP, type FairyInfo, type FairyTemplateRow } from '@mc/shared';
import { CRIT, growBaseGain, growCultivations, growGain, growLevelOf, planGrow, rollCrit } from './fairy-grow';
import { applyFeed, levelOf, planFeed, planRaise, planSetRes, planState, planUnlockSkin } from './fairy-rules';
import { activeRotation, passiveBuffIds, planLearn, planUpSkill, type FairySkillTpl } from './fairy-skills';
import { guardFairy, guardLook, newFairy, nextFairyId, parseFairyState, parseSkillConfig, parseSkinState, rosterOf } from './fairy-state';

const TPL: FairyTemplateRow = { id: 2, name: 'Rocky', rc: '2060100300002', cc: 0, sta: 6, staG: 6, ste: 8, steG: 8, agi: 15, agiG: 15, inte: 6, inteG: 6, ener: 5, enerG: 5 };
const fresh = (over: Partial<FairyInfo> = {}): FairyInfo => ({ ...newFairy(1, TPL, '2026-11-12'), ...over });
const state = (...fs: FairyInfo[]) => ({ fairies: new Map(fs.map((f) => [f.id, f])) });
const dice = (...v: number[]) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };

// skill rows: passive family P (5917..5919, buffs 2417..2419), active families A (6227..6229) and B (6230..6232)
const ROWS: FairySkillTpl[] = [
  ...[1, 2, 3].map((l) => ({ id: 5916 + l, type: 11, level: l, codeName: 'P', buffId: 2416 + l })),
  ...[1, 2, 3].map((l) => ({ id: 6226 + l, type: 6, level: l, codeName: 'A', buffId: 2720 + l })),
  ...[1, 2, 3].map((l) => ({ id: 6229 + l, type: 6, level: l, codeName: 'B', buffId: 2723 + l })),
];
const skillOf = (id: number) => ROWS.find((r) => r.id === id);
const family = (code: string) => ROWS.filter((r) => r.codeName === code);

test('state decode: Go wrapper, string numbers, bad keys, skill slots, config lists', () => {
  const s = parseFairyState({ fairy: {
    '3': { id: 3, tid: '2', exp: '50', gexp: 600, doh: 20000, state: 1, flag: { gnum: '7', en: 2, rs: '2026-11-12' }, skillFlag: { s1: 5917, s21: 1, x: 2, s2: 0 },
      skillConfig: { select: '1', '1': { c0: 6227, c1: -1 }, '2': [6230, 0] } },
    x: { tid: 1 }, '4': { tid: 0 },
  } });
  assert.deepEqual([...s.fairies.keys()], [3]);
  const f = s.fairies.get(3)!;
  assert.equal(f.exp, 50);
  assert.equal(f.doh, FAIRY.DOH_MAX);
  assert.deepEqual(f.flag, { gnum: 7, en: 2, rs: '2026-11-12' });
  assert.deepEqual(f.skillFlag, { s1: 5917 });
  assert.deepEqual(f.skillConfig, { select: 1, '1': { c0: 6227, c1: -1, c2: -1, c3: -1, c4: -1 }, '2': { c0: 6230, c1: -1, c2: -1, c3: -1, c4: -1 } });
  assert.deepEqual(Object.keys(rosterOf(s)), ['3']);
  assert.equal(nextFairyId(s), 4);
  assert.deepEqual(parseSkillConfig({ select: -1, junk: 1 }), { select: -1 });
  assert.deepEqual(parseSkinState({ fairy_skin: { actFairy: '5', actFairyList: '7|5|5' } }), { actFairy: 5, list: [5, 7] });
});

test('guard look: active skin art, else the own template, nothing while resting', () => {
  const tpls = new Map([[2, TPL], [5, { ...TPL, id: 5, rc: '2060100300005' }]]);
  const of = (tid: number) => tpls.get(tid);
  const g = state(fresh({ state: 1 }));
  assert.equal(guardLook(g, { actFairy: 0, list: [] }, of), '2060100300002');
  assert.equal(guardLook(g, { actFairy: 5, list: [5] }, of), '2060100300005');
  assert.equal(guardLook(g, { actFairy: 9, list: [9] }, of), '2060100300002');
  assert.equal(guardLook(state(fresh()), { actFairy: 5, list: [5] }, of), null);
  assert.equal(guardFairy(state(fresh({ id: 4, state: 1 }), fresh({ id: 2, state: 1 })))?.id, 2);
});

test('grow curve and gains (Go grow_curve.go)', () => {
  assert.equal(growLevelOf(0), 0);
  assert.equal(growLevelOf(499), 0);
  assert.equal(growLevelOf(500), 1);
  assert.equal(growLevelOf(99_999_999), 50);
  assert.equal(growCultivations(0), 2);
  assert.equal(growCultivations(19), 18);
  assert.equal(growCultivations(49), 330);
  assert.equal(growBaseGain(0), 250);
  assert.equal(growGain(0, CRIT.SMALL), 2500);
  assert.equal(growGain(600, CRIT.BIG), 1500 - 600);
  assert.equal(rollCrit(() => 0.004), CRIT.BIG);
  assert.equal(rollCrit(() => 0.03), CRIT.SMALL);
  assert.equal(rollCrit(() => 0.9), CRIT.NONE);
});

test('grow plan: silver small crit only, gold batch per affordable cultivation, refusals', () => {
  const f = fresh();
  const silver = planGrow(f, 0, 5, dice(0.001));
  assert.ok(!('error' in silver));
  assert.equal(silver.cri, CRIT.SMALL); // a big crit is downgraded on silver
  assert.equal(silver.done, 1);
  assert.equal(silver.gnum, FAIRY.DAILY_GROWS - 1);
  const big = planGrow(f, 1, 1, dice(0.001));
  assert.ok(!('error' in big) && big.cri === CRIT.BIG && big.gexp === FAIRY_GROW_EXP[0]);
  const batch = planGrow(f, 2, 7, dice(0.9));
  assert.ok(!('error' in batch) && batch.done === 7 && batch.gnum === FAIRY.DAILY_GROWS);
  assert.deepEqual(planGrow(f, 2, 0, dice(0.9)), { error: 'rmb' });
  assert.deepEqual(planGrow({ ...f, flag: { ...f.flag, gnum: 0 } }, 0, 5, dice(0.9)), { error: 'out' });
  assert.deepEqual(planGrow({ ...f, gexp: FAIRY_GROW_EXP[49] }, 1, 5, dice(0.9)), { error: 'lv' });
  assert.deepEqual(planGrow(f, 7, 5, dice(0.9)), { error: 'out' });
  const capped = planGrow({ ...f, gexp: FAIRY_GROW_EXP[49] - 10 }, 2, 20, dice(0.9));
  assert.ok(!('error' in capped) && capped.done === 1 && capped.gexp === FAIRY_GROW_EXP[49] && capped.exp === 10);
});

test('feeding: fruits only, one feed per stack, level cap, applyFeed', () => {
  const f = fresh();
  const plan = planFeed(f, [{ id: 9, tid: 7, type: 601, stack: 5 }, { id: 10, tid: 3392, type: 501, stack: 2 }, { id: 10, tid: 3392, type: 501, stack: 2 }], 1);
  assert.deepEqual(plan, { takes: [{ id: 10, n: 1, exp: 400 }] });
  const next = applyFeed(f, [{ exp: 400 }]);
  assert.equal(next.exp, 400);
  assert.equal(next.flag.en, FAIRY.DAILY_FEEDS - 1);
  assert.equal(levelOf(400), 3);
  assert.deepEqual(planFeed({ ...f, flag: { ...f.flag, en: 0 } }, [], 1), { error: 'out' });
  assert.deepEqual(planFeed({ ...f, exp: 123_500 }, [], 1), { error: 'max' });
  assert.deepEqual(planFeed(f, [{ id: 1, tid: 3390, type: 501, stack: 0 }], 1), { error: 'item' });
});

test('raise: crafting materials only, +100 per unit, cap, full', () => {
  const f = fresh({ doh: 9_950 });
  assert.deepEqual(planRaise(f, { id: 1, tid: 7, type: 601, stack: 3 }, 1), { doh: FAIRY.DOH_MAX, n: 1 });
  assert.deepEqual(planRaise(f, { id: 1, tid: 3390, type: 501, stack: 3 }, 1), { error: 'item' });
  assert.deepEqual(planRaise(f, undefined, 1), { error: 'item' });
  assert.deepEqual(planRaise(f, { id: 1, tid: 7, type: 605, stack: 1 }, 2), { error: 'num' });
  assert.deepEqual(planRaise(fresh(), { id: 1, tid: 7, type: 601, stack: 1 }, 1), { error: 'full' });
});

test('guard / rest: one guard, first guard binds', () => {
  const s = state(fresh({ id: 1, state: 1, binded: 1 }), fresh({ id: 2 }));
  const p = planState(s, 2, 1)!;
  assert.deepEqual(p.rested, [1]);
  assert.equal(p.bound, true);
  assert.equal(p.state.fairies.get(2)!.state, 1);
  assert.equal(p.state.fairies.get(1)!.state, 0);
  assert.equal(s.fairies.get(1)!.state, 1); // input untouched
  const r = planState(p.state, 2, 5)!;
  assert.equal(r.newState, 0);
  assert.equal(r.bound, false);
  assert.equal(planState(s, 9, 1), null);
});

test('skins: owned via unlock or roster, show / hide, unlock refusals', () => {
  const roster = state(fresh({ tid: 2 }));
  const skin = { actFairy: 0, list: [5] };
  assert.deepEqual(planSetRes(skin, roster, 2, 2), { skin: { actFairy: 2, list: [5] }, type: 2 });
  assert.deepEqual(planSetRes({ actFairy: 5, list: [5] }, roster, 5, 1), { skin: { actFairy: 0, list: [5] }, type: 1 });
  assert.equal(planSetRes(skin, roster, 9, 2), null);
  assert.deepEqual(planUnlockSkin(skin, roster, 9, true), { skin: { actFairy: 0, list: [5, 9] }, cost: FAIRY.SKIN_COST });
  assert.ok('error' in planUnlockSkin(skin, roster, 2, true));
  assert.ok('error' in planUnlockSkin(skin, roster, 15, true));
  assert.ok('error' in planUnlockSkin(skin, roster, 99, false));
});

test('learn: book family once, grow level gate, free slot; upgrade chain and book count', () => {
  const grown = fresh({ gexp: FAIRY_GROW_EXP[10] }); // grow level 11
  assert.deepEqual(planLearn(grown, 3577, 11, skillOf), { sindex: 's1', skill: 5917 });
  assert.deepEqual(planLearn(fresh({ gexp: 600 }), 3577, 11, skillOf), { error: 1 });
  assert.deepEqual(planLearn({ ...grown, skillFlag: { s1: 5918 } }, 3577, 11, skillOf), { error: 1 }); // upgraded copy still blocks
  assert.deepEqual(planLearn({ ...grown, skillFlag: { s1: 5918 } }, 3986, 11, skillOf), { sindex: 's2', skill: 6227 });
  assert.deepEqual(planLearn(grown, 1, 0, skillOf), { error: 1 });
  const full = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`s${i + 1}`, 6230]));
  assert.deepEqual(planLearn({ ...grown, skillFlag: full }, 3577, 11, skillOf), { error: 1 });
  const learned = { ...grown, skillFlag: { s1: 5917, s2: 5918 + 1 } };
  assert.deepEqual(planUpSkill(learned, 1, skillOf, family), { sindex: 's1', skill: 5918, books: 1 });
  assert.deepEqual(planUpSkill({ ...grown, skillFlag: { s1: 5918 } }, 1, skillOf, family), { sindex: 's1', skill: 5919, books: 3 });
  assert.deepEqual(planUpSkill(learned, 2, skillOf, family), { error: 3 });
  assert.deepEqual(planUpSkill(learned, 3, skillOf, family), { error: 2 });
  assert.deepEqual(planUpSkill(learned, 21, skillOf, family), { error: 2 });
});

test('passives: best level per family; rotation of the selected list', () => {
  const f = fresh({ skillFlag: { s1: 5917, s2: 5919, s3: 6228, s4: 6230 }, skillConfig: { '0': { c0: 6227, c1: -1, c2: 6232, c3: 5917, c4: 999 } } });
  assert.deepEqual(passiveBuffIds(f, skillOf), [2419]);
  assert.deepEqual(activeRotation(f, skillOf), [6228, 0, 6230, 0, 0]);
  assert.equal(activeRotation({ ...f, skillConfig: { ...f.skillConfig, select: -1 } }, skillOf), null);
  assert.equal(activeRotation({ ...f, skillConfig: { select: 2 } }, skillOf), null);
  assert.equal(activeRotation({ ...f, skillFlag: { s1: 5917 } }, skillOf), null);
});
