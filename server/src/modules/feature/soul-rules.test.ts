// Train soul rules: gate, per-call gain (1 crystal = 1 exp, capped by the level need), per-level exp reset and the current-row stats.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assembleStats, type StatProfile } from '../character/character-stats';
import { buildFeatureTables } from '../gamedata/feature-data';
import { applySoul, soulBonuses, soulGain, soulGate } from './soul-rules';

const soulRaw = [
  { id: 1, require_num: 150, prop1: 1, prop_num1: 231, prop2: 8, prop_num2: 0.09, prop3: 31, prop_num3: 0.05 },
  { id: 2, require_num: 200, prop1: 1, prop_num1: 470, prop2: 8, prop_num2: 0.19 },
];
const tables = buildFeatureTables(soulRaw, [], [], []);

describe('soulGate', () => {
  it('needs level 50, a level below 100 and crystals', () => {
    assert.match(soulGate(49, { lvl: 0, exp: 0 }, 5)!, /cấp 50/);
    assert.match(soulGate(50, { lvl: 100, exp: 0 }, 5)!, /cao nhất/);
    assert.match(soulGate(50, { lvl: 3, exp: 0 }, 0)!, /Kết Tinh/);
    assert.equal(soulGate(50, { lvl: 3, exp: 0 }, 1), null);
  });
});

describe('soulGain / applySoul', () => {
  it('spends min(held, step, remaining need) and resets exp on level up', () => {
    assert.equal(soulGain(50, 150, 0), 50);
    assert.equal(soulGain(1_000_000, 1_000_000, 0), 10_000); // one step
    assert.equal(soulGain(1_000, 150, 120), 30); // never more than the level needs
    assert.equal(soulGain(0, 150, 0), 0);
    assert.deepEqual(applySoul({ lvl: 0, exp: 0 }, 100, 150), { lvl: 0, exp: 100 });
    assert.deepEqual(applySoul({ lvl: 0, exp: 100 }, 50, 150), { lvl: 1, exp: 0 });
  });

  it('levels up after the per-level need is paid across calls (1:1)', () => {
    let st = { lvl: 0, exp: 0 };
    let spent = 0;
    while (st.lvl === 0) {
      const g = soulGain(1_000, soulRaw[0].require_num, st.exp);
      spent += g;
      st = applySoul(st, g, soulRaw[0].require_num);
    }
    assert.equal(spent, 150);
    assert.deepEqual(st, { lvl: 1, exp: 0 });
  });
});

describe('soulBonuses', () => {
  const profile: StatProfile = { attrs: { str: 10, agi: 10, sta: 10, int: 10, eng: 10 }, apt: { str: 0, agi: 0, sta: 0, int: 0, eng: 0 } };

  it('uses only the current level row (absolute) and keeps rates raw', () => {
    const b1 = soulBonuses(tables.soul.get(1));
    assert.equal(b1.flat.maxHp, 231);
    assert.equal(b1.rates.finalResiCritical, 0.05);
    const b2 = soulBonuses(tables.soul.get(2));
    assert.equal(b2.flat.maxHp, 470); // not 231 + 470
  });

  it('truncates the fractional hit once at the end', () => {
    const base = assembleStats(profile, soulBonuses(undefined)).stats.hit;
    const hit = assembleStats(profile, soulBonuses(tables.soul.get(1))).stats.hit;
    assert.equal(hit, base); // 0.09 alone is below one point
  });

  it('is empty for level 0', () => {
    assert.deepEqual(soulBonuses(undefined).flat, {});
  });
});
