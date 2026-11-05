// Tests for the Kiếp Nạn Vô Ưu rules: state roll, floor unlock, victory crediting, claim cycle, panel df, pin scaling (Go service_test / pins).

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NINE_BOSS_TEXT } from '@mc/shared';
import type { UnitPin } from './nineboss-config';
import {
  addTodayFloor, attackRefusal, claimVerdict, encounterLevel, hpLevelMult, nineCycle, ninePanel, openNineState, pctOf, recordVictory,
  scaledPin, topTodayFloor, unitLevel,
} from './nineboss-rules';

describe('nine boss state', () => {
  it('cycle is the UTC+7 date as a number', () => {
    assert.equal(nineCycle(Date.UTC(2026, 10, 4, 16, 59)), 20261104);
    assert.equal(nineCycle(Date.UTC(2026, 10, 4, 17, 0)), 20261105);
  });

  it('a new day clears only the day digits', () => {
    const s = openNineState({ maxFloor: 3, firstKills: 14, cycle: 20261103, todayFloors: '123', claimedCycle: 20261103 }, 20261104);
    assert.deepEqual(s, { maxFloor: 3, firstKills: 14, cycle: 20261104, todayFloors: '', claimedCycle: 20261103 });
  });

  it('defaults and clamps', () => {
    assert.deepEqual(openNineState(undefined, 20261104), { maxFloor: 0, firstKills: 0, cycle: 20261104, todayFloors: '', claimedCycle: 0 });
    assert.equal(openNineState({ maxFloor: 99 }, 1).maxFloor, 9);
  });

  it('today floors are sorted unique digits, top = highest', () => {
    assert.equal(addTodayFloor('', 3), '3');
    assert.equal(addTodayFloor('3', 1), '13');
    assert.equal(addTodayFloor('13', 3), '13');
    assert.equal(addTodayFloor('13', 10), '13');
    assert.equal(topTodayFloor('137'), 7);
    assert.equal(topTodayFloor(''), 0);
  });
});

describe('nine boss attack and victory', () => {
  it('needs level 130 and floor <= max + 1', () => {
    assert.equal(attackRefusal(129, 0, 1), NINE_BOSS_TEXT.LEVEL);
    assert.equal(attackRefusal(130, 0, 1), null);
    assert.equal(attackRefusal(130, 0, 2), NINE_BOSS_TEXT.LOCKED);
    assert.equal(attackRefusal(150, 4, 5), null);
    assert.equal(attackRefusal(150, 4, 6), NINE_BOSS_TEXT.LOCKED);
  });

  it('a victory raises max floor, adds the day digit and flags the first kill once', () => {
    const s = openNineState(undefined, 20261104);
    assert.deepEqual(recordVictory(s, 1), { credited: true, firstKill: true });
    assert.deepEqual(recordVictory(s, 1), { credited: true, firstKill: false });
    assert.deepEqual(recordVictory(s, 2), { credited: true, firstKill: true });
    assert.equal(s.maxFloor, 2);
    assert.equal(s.todayFloors, '12');
    assert.equal(s.firstKills, (1 << 1) | (1 << 2));
  });

  it('nothing is credited above max + 1', () => {
    const s = openNineState({ maxFloor: 1 }, 20261104);
    assert.deepEqual(recordVictory(s, 3), { credited: false, firstKill: false });
    assert.equal(s.maxFloor, 1);
    assert.equal(s.todayFloors, '');
  });
});

describe('nine boss claim', () => {
  const today = 20261104;

  it('free claim uses the highest floor cleared today, once per day', () => {
    const s = openNineState({ maxFloor: 5, cycle: today, todayFloors: '25' }, today);
    assert.deepEqual(claimVerdict(s, today, false), { ok: true, floor: 5 });
    s.claimedCycle = today;
    assert.deepEqual(claimVerdict(s, today, false), { ok: false, text: NINE_BOSS_TEXT.CLAIMED });
    assert.deepEqual(claimVerdict(s, today, true), { ok: false, text: NINE_BOSS_TEXT.CLAIMED });
  });

  it('free claim with nothing today, direct claim uses the max floor', () => {
    const s = openNineState({ maxFloor: 4, cycle: today }, today);
    assert.deepEqual(claimVerdict(s, today, false), { ok: false, text: NINE_BOSS_TEXT.NOTHING_TODAY });
    assert.deepEqual(claimVerdict(s, today, true), { ok: true, floor: 4 });
    assert.deepEqual(claimVerdict(openNineState(undefined, today), today, true), { ok: false, text: NINE_BOSS_TEXT.NOTHING_TODAY });
  });

  it('panel df = [0, claimedCycle, todayFloors, today]', () => {
    const s = openNineState({ maxFloor: 2, cycle: today, todayFloors: '12', claimedCycle: 20261103 }, today);
    assert.deepEqual(ninePanel(s, today), { f: 2, df: [0, 20261103, '12', today] });
  });
});

describe('unit pins', () => {
  const pin: UnitPin = { level: 160, hp: 11_332_881, mp: 1_000_000 };

  it('level follows the encounter level by the pin offset', () => {
    assert.equal(unitLevel(pin, 160, 160), 160);
    assert.equal(unitLevel(pin, 145, 160), 145);
    assert.equal(unitLevel({ ...pin, level: 159 }, 145, 160), 144);
    assert.equal(unitLevel({ ...pin, level: 161 }, 130, 160), 131);
    assert.equal(unitLevel(undefined, 140, 160), 140);
    assert.equal(unitLevel({ ...pin, level: 5 }, 130, 160), 1);
  });

  it('HP / MP scale along level^3 / 1000 and equal the video numbers at the pin level', () => {
    assert.deepEqual(scaledPin(pin, 160), { hp: 11_332_881, mp: 1_000_000 });
    const lo = scaledPin(pin, 130);
    assert.equal(lo.hp, Math.round(11_332_881 * (hpLevelMult(130) / hpLevelMult(160))));
    assert.ok(lo.hp < 11_332_881 && lo.mp < 1_000_000);
    // Go doc (nine-boss.md): Chu Ma Vuong is 6 078 696 HP at lv130 and 8 434 986 at lv145 (pin 11 332 881 at lv160)
    assert.equal(lo.hp, 6_078_696);
    assert.equal(scaledPin(pin, 145).hp, 8_434_986);
  });

  it('multiplier never drops below 1; percentages are capped at the client int', () => {
    assert.equal(hpLevelMult(5), 1);
    assert.equal(hpLevelMult(0), 1);
    assert.equal(pctOf(11_332_881, 150), 16_999_321);
    assert.equal(pctOf(2_000_000_000, 300), 2_147_483_647);
  });

  it('encounter level is the highest roster level, at least 130', () => {
    assert.equal(encounterLevel([120]), 130);
    assert.equal(encounterLevel([135, 150, 140]), 150);
  });
});
