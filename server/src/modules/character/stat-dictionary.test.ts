// Feature/buff prop dictionary (Go CommonFeaturePropToStat) and the fractional-flat rule of assembleStats.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addProp, assembleStats, BUFF_PROP, emptyBonuses, type PropEntry, type StatProfile } from './character-stats';
import { buffBonuses } from '../buff/buff-stats';

/** Go domain/character/equip_stats.go:177 + detail_props.go, mapped to the H5 keys (32 / 58 have no H5 key). */
const GO_COMMON: Record<number, string> = {
  1: 'stat:maxHp', 2: 'stat:maxMp', 3: 'stat:maxSp', 4: 'stat:attack', 5: 'stat:magicAttack', 6: 'stat:defense',
  7: 'stat:magicDefense', 8: 'stat:hit', 9: 'stat:dodge', 10: 'rate:finalCounter', 11: 'stat:speed', 12: 'rate:finalCombo',
  13: 'stat:critical', 14: 'rate:finalDefy', 17: 'rate:finalResiDizzy', 18: 'rate:finalResiConfusion', 19: 'rate:finalResiSleep',
  20: 'rate:finalResiPoison', 23: 'rate:finalResiLight', 30: 'rate:finalResiRage', 31: 'rate:finalResiCritical',
  34: 'rate:finalRebornRate', 43: 'rate:finalResiDizzy', 44: 'rate:finalResiConfusion', 45: 'rate:finalResiSleep',
  46: 'rate:finalResiPoison', 49: 'rate:finalResiLight', 50: 'rate:finalResiRage', 51: 'rate:finalResiCritical',
  52: 'rate:finalConfusion', 53: 'rate:finalDizzy', 54: 'rate:finalPoison', 55: 'rate:finalRage', 56: 'rate:finalSleep',
  57: 'rate:finalLight', 59: 'rate:finalPraDef', 60: 'rate:finalPraMagDef', 61: 'rate:finalResiDefy',
  62: 'rate:finalEnhPhyHurt', 63: 'rate:finalEnhMagicHurt', 71: 'rate:finalCriticalDamage', 72: 'rate:finalBreakReborn',
};

const label = (e: PropEntry): string => `${e.target.kind}:${e.target.key}`;

describe('BUFF_PROP dictionary', () => {
  it('matches the Go common-feature table entry by entry', () => {
    const have = Object.fromEntries(Object.entries(BUFF_PROP).map(([id, e]) => [Number(id), label(e)]));
    assert.deepEqual(have, GO_COMMON);
  });

  it('props 59 / 60 feed finalPraDef / finalPraMagDef (not finalReduceHurt)', () => {
    const b = buffBonuses([{ percent_flag: 0, prop1: 59, prop_num1: 5, prop2: 60, prop_num2: 7 }]);
    assert.equal(b.rates.finalPraDef, 5);
    assert.equal(b.rates.finalPraMagDef, 7);
    assert.equal(b.rates.finalReduceHurt1, undefined);
    assert.equal(b.rates.finalReduceHurt2, undefined);
  });
});

const prof: StatProfile = {
  attrs: { str: 10, agi: 10, sta: 10, int: 10, eng: 10 },
  apt: { str: 0, agi: 0, sta: 0, int: 0, eng: 0 },
};

describe('fractional flats', () => {
  it('accumulate as floats and are truncated once (0.09 x 12 = 1.08 -> +1 hit)', () => {
    const base = assembleStats(prof, emptyBonuses()).stats.hit;
    const b = emptyBonuses();
    for (let i = 0; i < 12; i++) addProp(b, BUFF_PROP, 8, 0.09, false);
    assert.ok(Math.abs((b.flat.hit ?? 0) - 1.08) < 1e-9);
    assert.equal(assembleStats(prof, b).stats.hit, base + 1);
  });

  it('a single sub-1 flat adds nothing, and float noise does not lose a whole point', () => {
    const base = assembleStats(prof, emptyBonuses()).stats;
    const one = emptyBonuses();
    addProp(one, BUFF_PROP, 8, 0.09, false);
    assert.equal(assembleStats(prof, one).stats.hit, base.hit);
    const three = emptyBonuses();
    for (let i = 0; i < 30; i++) addProp(three, BUFF_PROP, 9, 0.1, false); // 30 x 0.1 = 3.0000000000000004 or 2.9999..
    assert.equal(assembleStats(prof, three).stats.dodge, base.dodge + 3);
  });

  it('integer flats and percents are unchanged', () => {
    const b = emptyBonuses();
    addProp(b, BUFF_PROP, 4, 150, false);
    addProp(b, BUFF_PROP, 1, 10, true);
    const base = assembleStats(prof, emptyBonuses()).stats;
    const s = assembleStats(prof, b).stats;
    assert.equal(s.attack, base.attack + 150);
    assert.equal(s.maxHp, base.maxHp + Math.trunc((base.maxHp * 10) / 100));
  });
});
