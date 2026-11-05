// PPVE rules: state defaults and the two daily markers, win-only advance, config parsing and line-up checks, prices, Khac Van level-up math.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { carveId, PPVE_MAX_FLOOR } from '@mc/shared';
import type { CarveRow } from '../gamedata/ppve-data';
import {
  applyCarveLevelUp, applyDailyReset, applyFloorWin, challengeRefusal, configInputRefusal, configSlots, defaultPpve, extraTryGold,
  freeExchangeFloor, freeExchangeKp, kpDataOf, lineupRefusal, normalizeConfig, normalizePpve, parseCmdList, planCarveLevelUp, PPVE_TEXT,
  ppveDataOf, scriptOf, type LevelUpPlan,
} from './ppve-rules';

const row = (id: number, costKp = 25): CarveRow => ({ id, costKp, prop: 1, pv: 30 });
const pricey = (id: number): CarveRow => row(id, 100);
const state = (over: Partial<{ ppvefloor: number; kp: number; p: Record<string, number[]> }> = {}): { ppvefloor: number; kp: number; p: Record<string, number[]> } => ({
  ppvefloor: 150, kp: 1000, p: {}, ...over,
});
const text = (p: LevelUpPlan): string => (p.ok ? '' : p.text);

describe('state and daily markers', () => {
  it('defaults match the legacy state', () => {
    const s = defaultPpve();
    assert.deepEqual([s.ppvefloor, s.todayFloor, s.freeTime, s.awardTime, s.goldTime, s.mlv], [0, -1, 3, 1, 0, 0]);
  });

  it('normalises a stored document and keeps only s0..s7 arrays of six ints', () => {
    const s = normalizePpve({ ppvefloor: '7', kp: -5, freeTime: 2, p: { s1: [1101, 'x', 2], s9: [1], bad: 3 }, ppveConfig: { 1: { pid: 5, pos: 1, cmdList: [] } } });
    assert.equal(s.ppvefloor, 7);
    assert.equal(s.kp, 0);
    assert.equal(s.freeTime, 2);
    assert.deepEqual(s.p, { s1: [1101, 0, 2, 0, 0, 0] });
    assert.deepEqual(s.ppveConfig['1'], { pid: 5, pos: 1, cmdList: {} });
  });

  it('the two markers reset independently', () => {
    const s = defaultPpve();
    Object.assign(s, { freeTime: 0, todayFloor: 9, goldTime: 2, goldClgTime: 2, awardTime: 0, gold4awardTimeDaily: 3, lastResetDay: '2026-11-04', lastDailyDay: '2026-11-05' });
    assert.equal(applyDailyReset(s, '2026-11-05'), true);
    assert.deepEqual([s.freeTime, s.todayFloor, s.lastResetDay], [3, -1, '2026-11-05']);
    assert.deepEqual([s.goldTime, s.awardTime, s.gold4awardTimeDaily], [2, 0, 3]); // lastDailyDay is already today: untouched
    s.lastDailyDay = '2026-11-04';
    assert.equal(applyDailyReset(s, '2026-11-05'), true);
    assert.deepEqual([s.goldTime, s.goldClgTime, s.awardTime, s.gold4awardTimeDaily], [0, 0, 1, 0]);
    assert.equal(applyDailyReset(s, '2026-11-05'), false);
  });

  it('wire views', () => {
    const s = defaultPpve();
    s.p = { s0: [1101, 0, 0, 0, 0, 0] };
    assert.deepEqual(Object.keys(kpDataOf(s)), ['ppvefloor', 'kp', 'freeTime', 'goldTime', 'goldClgTime', 'awardTime', 'gold4awardTimeDaily']);
    const d = ppveDataOf(s);
    assert.equal(Object.keys(d.p).length, 8);
    assert.equal(d.p.s0[0], 1101);
    assert.equal(s.p.s1, undefined); // persisted state untouched
  });
});

describe('challenge', () => {
  it('refuses at the max floor before checking tries, and without tries', () => {
    assert.equal(challengeRefusal({ ppvefloor: PPVE_MAX_FLOOR, freeTime: 0 }), PPVE_TEXT.maxFloor);
    assert.equal(challengeRefusal({ ppvefloor: 3, freeTime: 0 }), PPVE_TEXT.noTries);
    assert.equal(challengeRefusal({ ppvefloor: 3, freeTime: 1 }), null);
  });

  it('only a win advances and spends a try', () => {
    const s = defaultPpve();
    s.freeTime = 3;
    applyFloorWin(s, 1);
    assert.deepEqual([s.ppvefloor, s.todayFloor, s.freeTime], [1, 1, 2]);
    applyFloorWin(s, 2);
    applyFloorWin(s, 3);
    applyFloorWin(s, 4);
    assert.equal(s.freeTime, 0); // never negative
    assert.equal(s.ppvefloor, 4);
  });
});

describe('config', () => {
  it('parses an object or an array cmdList into numbered rows and drops junk', () => {
    const fromObj = parseCmdList({ 1: { action: '-50', id: '8', level: 2, t: '52' }, 0: { action: -10, id: 0, level: 1, t: 1 }, 2: { action: 7 } });
    assert.deepEqual(fromObj, { 0: { action: -10, id: 0, level: 1, t: 1 }, 1: { action: -50, id: 8, level: 2, t: 52 } });
    assert.deepEqual(parseCmdList([{ action: -10, t: 3 }]), { 0: { action: -10, id: 0, level: 1, t: 3 } });
    assert.deepEqual(parseCmdList(undefined), {});
    assert.deepEqual(parseCmdList([]), {});
  });

  it('keeps a script in round order', () => {
    const script = scriptOf(parseCmdList({ 0: { action: -50, id: 8, level: 1, t: 2 }, 1: { action: -10, id: 0, level: 1, t: 1 } }));
    assert.deepEqual(script, { 0: { action: -50, id: 8, level: 1, t: 2 }, 1: { action: -10, id: 0, level: 1, t: 1 } });
  });

  it('normalises by position, drops bad rows and orders the slots', () => {
    const cfg = normalizeConfig({ a: { pid: 9, pos: 3 }, b: { pid: 4, pos: 1 }, c: { pid: 0, pos: 2 }, d: { pid: 5, pos: 9 }, e: { pid: 6, pos: 3 }, f: 'x' });
    assert.deepEqual(Object.keys(cfg).sort(), ['1', '3']);
    assert.deepEqual(configSlots(cfg).map((s) => s.pid), [4, 9]);
  });

  it('a pet in two positions fills only one slot', () => {
    const cfg = normalizeConfig({ 1: { pid: 4, pos: 1 }, 2: { pid: 4, pos: 2 } });
    assert.deepEqual(configSlots(cfg).map((s) => [s.pid, s.pos]), [[4, 1]]);
  });

  it('refuses more than five entries; an empty config is allowed', () => {
    const six = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, { pid: i, pos: i }]));
    assert.equal(configInputRefusal(six), PPVE_TEXT.configCount);
    assert.equal(configInputRefusal({}), null);
    assert.equal(configInputRefusal(null), null);
  });

  it('line-up pets must be owned, bound and of different templates', () => {
    const slots = configSlots(normalizeConfig({ 1: { pid: 1, pos: 1 }, 2: { pid: 2, pos: 2 } }));
    assert.equal(lineupRefusal([{ id: 1, tid: 10, binded: 1 }, { id: 2, tid: 11, binded: 1 }], slots), null);
    assert.equal(lineupRefusal([{ id: 1, tid: 10, binded: 1 }], slots), PPVE_TEXT.configNotOwned);
    assert.equal(lineupRefusal([{ id: 1, tid: 10, binded: 1 }, { id: 2, tid: 11, binded: 0 }], slots), PPVE_TEXT.configNotBound);
    assert.equal(lineupRefusal([{ id: 1, tid: 10, binded: 1 }, { id: 2, tid: 10, binded: 1 }], slots), PPVE_TEXT.configSameTemplate);
  });
});

describe('prices', () => {
  it('extra tries cost 10 / 20 / 50, then 50 again (third and above)', () => {
    assert.deepEqual([0, 1, 2, 3, 9].map(extraTryGold), [10, 20, 50, 50, 50]);
    assert.equal(extraTryGold(-1), 10);
  });

  it('the free exchange reads the next floor row, clamped', () => {
    assert.equal(freeExchangeFloor(0), 1);
    assert.equal(freeExchangeFloor(10), 11);
    assert.equal(freeExchangeFloor(150), 150);
    assert.equal(freeExchangeKp({ floor: 11, award: 1, freeExchange: 40, itemId: 1 }), 40);
    assert.equal(freeExchangeKp(undefined), 50);
  });
});

describe('Khac Van level up', () => {
  it('opens the first node of an icon at id base + 1', () => {
    assert.deepEqual(planCarveLevelUp(state(), 0, 0, row), { ok: true, id: carveId(0, 0, 1), level: 1, cost: 25, part: 0, icon: 0 });
  });

  it('a later level is id + 1 priced at that row', () => {
    const plan = planCarveLevelUp(state({ p: { s2: [0, 0, 0, carveId(2, 3, 5), 0, 0] } }), 2, 3, pricey);
    assert.deepEqual(plan, { ok: true, id: carveId(2, 3, 6), level: 6, cost: 100, part: 2, icon: 3 });
  });

  it('locks by best floor', () => {
    const open = (icon: number, floor: number): boolean => planCarveLevelUp(state({ ppvefloor: floor }), 0, icon, row).ok;
    assert.deepEqual([open(1, 19), open(1, 20), open(5, 99), open(5, 100), open(0, 0)], [false, true, false, true, true]);
    assert.equal(text(planCarveLevelUp(state({ ppvefloor: 0 }), 0, 2, row)), PPVE_TEXT.carveLocked);
  });

  it('refuses max level, missing KP, bad ids and bad indexes', () => {
    assert.equal(text(planCarveLevelUp(state({ p: { s0: [carveId(0, 0, 20), 0, 0, 0, 0, 0] } }), 0, 0, row)), PPVE_TEXT.carveMax);
    assert.equal(text(planCarveLevelUp(state({ kp: 24 }), 0, 0, row)), PPVE_TEXT.carveNoKp);
    assert.equal(text(planCarveLevelUp(state({ p: { s0: [5, 0, 0, 0, 0, 0] } }), 0, 0, row)), PPVE_TEXT.carveInvalid);
    assert.equal(text(planCarveLevelUp(state(), 8, 0, row)), PPVE_TEXT.carveInvalid);
    assert.equal(text(planCarveLevelUp(state(), 0, -1, row)), PPVE_TEXT.carveInvalid);
    assert.equal(text(planCarveLevelUp(state(), 0, 0, () => undefined)), PPVE_TEXT.carveMax);
  });

  it('applying spends the KP and raises the master level every 20 node levels', () => {
    const s = defaultPpve();
    s.kp = 1000;
    s.ppvefloor = 150;
    let raised = 0;
    for (let i = 0; i < 20; i++) {
      const plan = planCarveLevelUp(s, 0, 0, row);
      assert.ok(plan.ok);
      if (applyCarveLevelUp(s, plan)) raised++;
    }
    assert.equal(s.p.s0[0], carveId(0, 0, 20));
    assert.equal(s.kp, 1000 - 20 * 25);
    assert.equal(s.mlv, 1);
    assert.equal(raised, 1);
  });
});
