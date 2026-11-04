// Unit tests for creatureStatsAt against the research vectors (creature 56 Lv3, creature 157 Lv2) and the level cap.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CreatureTemplate } from '../gamedata/combat-data';
import { capToPlayer, creatureStatsAt, spawnLevel, withDefaults } from './creature-stats';

const nam: CreatureTemplate = {
  id: 56, name: 'Nấm Lục', useLevel: 1, life: 3500, growBase: 0.8,
  att: { str: 1, agi: 1, sta: 3, int: 2, eng: 3 }, apt: { str: 900, agi: 900, sta: 2860, int: 1920, eng: 2420 },
  propHit: 0, propDodge: 0, propSpeed: 0, propCritical: 0, resCode: '2060100000016',
};
const keVuong: CreatureTemplate = {
  id: 157, name: 'Kê Vương', useLevel: 0, life: 3500, growBase: 0.8,
  att: { str: 10, agi: 5, sta: 40, int: 40, eng: 30 }, apt: { str: 2000, agi: 2000, sta: 2000, int: 1700, eng: 1700 },
  propHit: 10, propDodge: 0, propSpeed: 10, propCritical: 5, resCode: '2060100200011',
};

describe('creatureStatsAt', () => {
  it('creature 56 at level 3 matches the Go vector', () => {
    const s = creatureStatsAt(nam, 3);
    assert.equal(s.hpMax, 51);
    assert.equal(s.mpMax, 101);
    assert.equal(s.attack, 3);
    assert.equal(s.defense, 30);
    assert.equal(s.magicAttack, 17);
    assert.equal(s.magicDefense, 62);
    assert.equal(s.speed, 103);
    assert.equal(s.hit, 100);
    assert.equal(s.dodge, 0);
  });

  it('creature 157 at level 2 matches the Go vector', () => {
    const s = creatureStatsAt(keVuong, 2);
    assert.equal(s.hpMax, 374);
    assert.equal(s.mpMax, 924);
    assert.equal(s.attack, 64);
    assert.equal(s.defense, 320);
    assert.equal(s.speed, 135);
    assert.equal(s.hit, 112);
  });

  it('level multipliers start at level 10 (dmg) and level 11 (hp)', () => {
    const lv20 = creatureStatsAt(keVuong, 20);
    const lv2 = creatureStatsAt(keVuong, 2);
    assert.equal(lv20.attack, lv2.attack * 2);
    assert.ok(lv20.hpMax >= lv2.hpMax * 8);
  });
});

describe('spawn level, cap and defaults', () => {
  it('spawnLevel falls back row -> use_lv -> map -> 10', () => {
    assert.equal(spawnLevel(5, 1, 2), 5);
    assert.equal(spawnLevel(0, 7, 2), 7);
    assert.equal(spawnLevel(0, 0, 2), 2);
    assert.equal(spawnLevel(0, 0, -1), 10);
  });

  it('capToPlayer scales a high-level creature down to player level + 5 but spares bosses', () => {
    const big = creatureStatsAt(keVuong, 30);
    const capped = capToPlayer(big, 1, false);
    assert.equal(capped.level, 6);
    assert.ok(capped.hpMax < big.hpMax);
    assert.equal(capToPlayer(big, 1, true).level, 30);
    assert.equal(capToPlayer(creatureStatsAt(nam, 3), 1, false).level, 3);
  });

  it('withDefaults fills zero stats like applyTemplateStats', () => {
    const z = withDefaults({ ...creatureStatsAt(nam, 3), attack: 0, dodge: 0, critical: 0 });
    assert.equal(z.attack, 20 + 3 * 3);
    assert.equal(z.dodge, 5);
    assert.equal(z.critical, 5);
  });
});
