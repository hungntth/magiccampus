// Unit tests for the stat formula, the bonus assembly order, changeProperty parsing and the lvUp gate.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addProp, assembleStats, buildBaseStats, BUFF_PROP, detailData, emptyBonuses, EQUIP_PROP, toCharProperty,
  type AttrKey, type StatProfile,
} from './character-stats';
import { canManualLevelUp, parseChangeProperty, parseStat } from './character-points';

const k = (s: number, a: number, t: number, i: number, e: number): Record<AttrKey, number> => ({
  str: s, agi: a, sta: t, int: i, eng: e,
});
const profile = (att: number[], apt: number[]): StatProfile => ({
  attrs: k(att[0], att[1], att[2], att[3], att[4]),
  apt: k(apt[0], apt[1], apt[2], apt[3], apt[4]),
});

// [att S/A/T/I/E, apt S/A/T/I/E, maxHp, maxMp, atk, def, matk, mdef, hit, dodge, speed, crit]
const LV1: [string, number[], number[], number[]][] = [
  ['class 1', [15, 10, 15, 5, 5], [2300, 2100, 2500, 1500, 1600], [377, 104, 87, 128, 26, 74, 104, 2, 142, 2]],
  ['class 2', [8, 10, 8, 12, 12], [1500, 2200, 1600, 2200, 2500], [161, 323, 42, 63, 81, 237, 102, 2, 143, 2]],
  ['class 3', [9, 7, 7, 13, 14], [1800, 1500, 1900, 2400, 2400], [158, 366, 45, 52, 92, 270, 101, 1, 123, 1]],
  ['class 4', [8, 10, 5, 15, 12], [1600, 1700, 1700, 2700, 2300], [111, 367, 41, 45, 107, 265, 102, 2, 136, 2]],
  ['class 5', [11, 10, 11, 10, 8], [2000, 2000, 2000, 2000, 2000], [244, 212, 62, 87, 59, 153, 103, 2, 140, 2]],
  ['class 6', [12, 12, 10, 8, 8], [2500, 2200, 2200, 1500, 1600], [237, 165, 78, 91, 41, 119, 103, 3, 152, 3]],
];

describe('buildBaseStats', () => {
  for (const [name, att, apt, want] of LV1) {
    it(`${name} Lv1 matches the legacy vector`, () => {
      const s = buildBaseStats(profile(att, apt));
      assert.deepEqual(
        [s.maxHp, s.maxMp, s.attack, s.defense, s.magicAttack, s.magicDefense, s.hit, s.dodge, s.speed, s.critical],
        want,
      );
      assert.equal(s.maxSp, 150);
    });
  }

  it('class 1 Lv5 (+4 to every attribute)', () => {
    const s = buildBaseStats(profile([19, 14, 19, 9, 9], [2300, 2100, 2500, 1500, 1600]));
    assert.deepEqual([s.maxHp, s.maxMp, s.attack, s.defense], [472, 185, 112, 165]);
  });
});

describe('assembleStats', () => {
  const base = profile([15, 10, 15, 5, 5], [2300, 2100, 2500, 1500, 1600]);

  it('a gear Strength flat goes through the formula (aptitude scaling)', () => {
    const b = emptyBonuses();
    addProp(b, EQUIP_PROP, 20, 10, false);
    const f = assembleStats(base, b);
    assert.equal(f.attrs.str, 25);
    assert.deepEqual(f.stats, buildBaseStats(profile([25, 10, 15, 5, 5], [2300, 2100, 2500, 1500, 1600])));
  });

  it('percent props apply after the flats, with integer truncation', () => {
    const b = emptyBonuses();
    addProp(b, EQUIP_PROP, 1, 100, false); // +100 maxHp flat
    addProp(b, EQUIP_PROP, 24, 10, false); // +10 % maxHp
    const f = assembleStats(base, b);
    const flatHp = 377 + 100;
    assert.equal(f.stats.maxHp, flatHp + Math.trunc((flatHp * 10) / 100));
  });

  it('equipment 21 maps to Stamina and only 24/25 are percent', () => {
    const b = emptyBonuses();
    addProp(b, EQUIP_PROP, 21, 3, false);
    addProp(b, EQUIP_PROP, 2, 50, false);
    assert.equal(b.attr.sta, 3);
    assert.equal(b.attr.agi, 0);
    assert.equal(b.flat.maxMp, 50);
    assert.deepEqual(b.pct, {});
  });

  it('buff percent_flag turns scalable stats into percents; rates stay flat', () => {
    const b = emptyBonuses();
    addProp(b, BUFF_PROP, 5, 4, true); // magic attack +4 %
    addProp(b, BUFF_PROP, 13, 7, true); // crit is not percent-scalable
    addProp(b, BUFF_PROP, 10, 888, false);
    assert.deepEqual(b.pct, { magicAttack: 4 });
    assert.equal(b.flat.critical, 7);
    assert.equal(b.rates.finalCounter, 888);
    assert.equal(detailData(b.rates).finalCounter, 888);
  });

  it('toCharProperty exposes final aliases and distributed points', () => {
    const f = assembleStats(base, emptyBonuses());
    const p = toCharProperty(f, 7, k(1, 2, 3, 4, 5));
    assert.equal(p.finalHp, 377);
    assert.equal(p.finalStrength, 15);
    assert.equal(p.lastPoint, 7);
    assert.equal(p.aptEnergy, 5);
    assert.equal(Object.keys(detailData({})).length, 26);
  });
});

describe('changeProperty parsing', () => {
  it('treats "", negatives and garbage as 0 and truncates numbers', () => {
    const r = parseChangeProperty({ addStrength: '3', addAgility: '', addStamina: '-3', addIntelligence: 'abc', addEnergy: 2.9 });
    assert.deepEqual(r, { add: { str: 3, agi: 0, sta: 0, int: 0, eng: 2 }, total: 5 });
    assert.equal(parseStat('12'), 12);
    assert.equal(parseStat(null), 0);
  });

  it('rejects non-object args', () => {
    assert.equal(parseChangeProperty('x'), null);
    assert.equal(parseChangeProperty(null), null);
    assert.equal(parseChangeProperty([1]), null);
    assert.equal(parseChangeProperty({})?.total, 0);
  });
});

describe('lvUp gate', () => {
  it('only from level 20 up, with enough cumulative exp, below the cap', () => {
    assert.equal(canManualLevelUp(19, 1e12), false); // auto range
    assert.equal(canManualLevelUp(20, 545586), false); // LEVEL_EXP[20] = 545587
    assert.equal(canManualLevelUp(20, 545587), true);
    assert.equal(canManualLevelUp(160, 1e12), false);
  });
});
