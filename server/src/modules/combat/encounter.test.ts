// Unit tests for the encounter rate clamp, the enemy count and the spawn-row roll.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { MapCreatureRow } from '../gamedata/combat-data';
import { enemyCount, normalizeEncounterRate, pickRow, rollEncounter } from './encounter';

const row = (id: number, cid: number, start: number, end: number, boss = 0): MapCreatureRow => ({
  id, mapId: 3, creatureId: cid, startRate: start, endRate: end, level: 3, bossFlag: boss, exp: -1, expMulti: 1, withCloud: -1,
});
const rows = [row(1, 56, 0, 50), row(2, 4, 50, 99), row(3, 181, 99.5, 100, 2)];
const seq = (...v: number[]) => {
  let i = 0;
  return (): number => v[i++] ?? 0;
};

describe('normalizeEncounterRate', () => {
  it('0 and negatives never encounter', () => {
    assert.equal(normalizeEncounterRate(0), 0);
    assert.equal(normalizeEncounterRate(-5), 0);
    assert.equal(normalizeEncounterRate(Number.NaN), 0);
  });
  it('seed value 50 (per-mille 0.05) is lifted to the 0.30 floor', () => {
    assert.equal(normalizeEncounterRate(50), 0.3);
  });
  it('clamps to 0.30..0.75 and treats <= 1 as a fraction', () => {
    assert.equal(normalizeEncounterRate(0.5), 0.5);
    assert.equal(normalizeEncounterRate(0.9), 0.75);
    assert.equal(normalizeEncounterRate(5000), 0.75);
    assert.equal(normalizeEncounterRate(400), 0.4);
  });
});

describe('enemyCount / pickRow / rollEncounter', () => {
  it('1 or 2 enemies, capped by the distinct creature count', () => {
    assert.equal(enemyCount(rows, seq(0.1)), 1);
    assert.equal(enemyCount(rows, seq(0.9)), 2);
    assert.equal(enemyCount([row(1, 56, 0, 100), row(2, 56, 0, 100)], seq(0.9)), 1);
  });

  it('pickRow follows the [start, end) bands and falls back to a random row', () => {
    assert.equal(pickRow(rows, seq(0.49)).creatureId, 56); // roll 49
    assert.equal(pickRow(rows, seq(0.5)).creatureId, 4); // roll 50 is the next band
    assert.equal(pickRow(rows, seq(0.995, 0.0)).bossFlag, 2); // inside the boss band when it is in the list
    assert.equal(pickRow([row(1, 56, 0, 10)], seq(0.9, 0.0)).creatureId, 56); // gap -> random row
  });

  it('rollEncounter: rate failure, boss rows excluded, order of rolls', () => {
    assert.equal(rollEncounter(0, rows, seq(0)), null);
    assert.equal(rollEncounter(50, rows, seq(0.31)), null); // 0.31 >= 0.30
    // roll 0.1 passes, count roll 0.9 -> 2, band rolls 0.2 -> creature 56, 0.7 -> creature 4
    const got = rollEncounter(50, rows, seq(0.1, 0.9, 0.2, 0.7));
    assert.deepEqual(got?.map((r) => r.creatureId), [56, 4]);
    // the boss band (99.5-100) is not in the pool, so the roll falls back to a random normal row
    const noBoss = rollEncounter(50, rows, seq(0.1, 0.1, 0.999, 0));
    assert.ok(noBoss && noBoss.every((r) => r.bossFlag === 0));
    assert.equal(rollEncounter(50, [row(9, 181, 0, 100, 2)], seq(0.1)), null);
  });
});
