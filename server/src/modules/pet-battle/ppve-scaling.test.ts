// PPVE floor line-up: deterministic per floor, leader / minion roles, level band, floor multipliers and the team anchors; the enemy pool filter and the carve bonus.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BATTLE_ENEMY_SLOTS } from '@mc/shared';
import { creatureStatsAt, withDefaults } from '../combat/creature-stats';
import type { PetTemplate } from '../gamedata/pet-data';
import { buildPpveTables, ppveEnemyPool } from '../gamedata/ppve-data';
import { carveBonuses, carveTotals } from './ppve-carve';
import {
  attackForDamage, basicHit, ppveEnemyLevel, ppveFloorEnemies, ppveRoleMults, ppveScaleEnemy, seededRng, teamPowerOf, type TeamPower,
} from './ppve-scaling';

const tpl = (id: number, qLevel: number, resCode = '2060100000015'): PetTemplate => ({
  id, name: `c${id}`, useLevel: 1, life: 10000, growBase: 1, att: { str: 10, agi: 10, sta: 10, int: 10, eng: 10 },
  apt: { str: 1000, agi: 1000, sta: 1000, int: 1000, eng: 1000 }, propHit: 0, propDodge: 0, propSpeed: 0, propCritical: 0, resCode, element: 0,
  classId: 1, classIds: '1', qLevel, catchable: 0, isBind: 0, iconCode: '0', colorCode: '0', brightCode: '0',
});
const POOL = [tpl(1, 1), tpl(2, 2), tpl(3, 3), tpl(4, 3), tpl(5, 3), tpl(6, 1)];
const NO_TEAM: TeamPower = { topLevel: 0, avgMaxHp: 0, avgDefense: 0, avgMagicDefense: 0, avgBestAttack: 0 };

describe('enemy pool', () => {
  it('keeps qLevel 1..3 creatures with a 2060 res code, sorted by id', () => {
    const pool = ppveEnemyPool([tpl(9, 3), tpl(2, 1), tpl(5, 4), tpl(4, 2, '2070100000001'), tpl(1, 0), tpl(3, 2)]);
    assert.deepEqual(pool.map((t) => t.id), [2, 3, 9]);
  });
});

describe('seeded rng', () => {
  it('repeats per seed and stays in [0, 1)', () => {
    const a = seededRng(7919);
    const b = seededRng(7919);
    const xs = Array.from({ length: 50 }, () => a());
    assert.deepEqual(xs, Array.from({ length: 50 }, () => b()));
    assert.ok(xs.every((x) => x >= 0 && x < 1));
    assert.notDeepEqual(xs, Array.from({ length: 50 }, ((c) => () => c())(seededRng(7920))));
  });
});

describe('floor line-up', () => {
  it('is deterministic per floor and differs between floors', () => {
    const ids = (floor: number): number[] => ppveFloorEnemies(POOL, floor, NO_TEAM).map((e) => e.tpl.id);
    assert.deepEqual(ids(10), ids(10));
    const seen = new Set(Array.from({ length: 30 }, (_, f) => ids(f + 1).join(',')));
    assert.ok(seen.size > 5);
  });

  it('has five enemies on slots 0, 2, 1, 4, 3 with the leader first, picked from the top qLevel', () => {
    for (let floor = 1; floor <= 40; floor++) {
      const enemies = ppveFloorEnemies(POOL, floor, NO_TEAM);
      assert.deepEqual(enemies.map((e) => e.slot), [...BATTLE_ENEMY_SLOTS]);
      assert.equal(enemies[0].leader, true);
      assert.equal(enemies[0].slot, 0);
      assert.equal(enemies[0].tpl.qLevel, 3);
      assert.ok(enemies.slice(1).every((e) => !e.leader));
    }
  });

  it('is empty without a pool', () => {
    assert.deepEqual(ppveFloorEnemies([], 1, NO_TEAM), []);
  });

  it('the leader is tougher than a minion of the same template and stats grow with the floor', () => {
    const one = [tpl(3, 3)];
    const [leader, minion] = ppveFloorEnemies(one, 10, NO_TEAM);
    assert.ok(leader.stats.hpMax > minion.stats.hpMax);
    assert.ok(leader.stats.attack > minion.stats.attack);
    const late = ppveFloorEnemies(one, 120, NO_TEAM)[0];
    const early = ppveFloorEnemies(one, 2, NO_TEAM)[0];
    assert.ok(late.stats.hpMax > early.stats.hpMax && late.stats.level > early.stats.level);
  });
});

describe('level band', () => {
  it('starts at 18 + floor and is pulled toward (best pet level - 10) by at most 10, capped at 200', () => {
    assert.equal(ppveEnemyLevel(5, 0), 23);
    assert.equal(ppveEnemyLevel(5, 30), 23); // 30 - 10 = 20 < 23
    assert.equal(ppveEnemyLevel(5, 50), 33); // 50 - 10 = 40 but at most +10 above 23
    assert.equal(ppveEnemyLevel(5, 40), 30); // 40 - 10
    assert.equal(ppveEnemyLevel(150, 200), 178);
    assert.equal(ppveEnemyLevel(190, 400), 200);
  });
});

describe('scaling and anchors', () => {
  const base = withDefaults(creatureStatsAt(tpl(3, 3), 30));

  it('role multipliers: leader x1.5 / x1.2, minions 0.5 growing to 1', () => {
    assert.deepEqual(ppveRoleMults(10, true), { hp: 1.5, atk: 1.2 });
    assert.equal(ppveRoleMults(0, false).hp, 0.5);
    assert.ok(Math.abs(ppveRoleMults(50, false).atk - 0.7) < 1e-9);
    assert.equal(ppveRoleMults(125, false).hp, 1);
    assert.equal(ppveRoleMults(150, false).hp, 1);
  });

  it('floor multipliers apply without a team: HP / attack x(1 + 0.01 floor), defence x(1 + 0.004 floor)', () => {
    const s = ppveScaleEnemy(base, 50, NO_TEAM, true);
    assert.equal(s.hpMax, Math.trunc(base.hpMax * 1.5 * 1.5));
    assert.equal(s.attack, Math.trunc(base.attack * 1.5 * 1.2));
    assert.equal(s.defense, Math.trunc(base.defense * 1.2));
  });

  it('the attack anchor makes an enemy hit for at least the team share of average HP', () => {
    const team: TeamPower = { topLevel: 40, avgMaxHp: 100000, avgDefense: 4000, avgMagicDefense: 4000, avgBestAttack: 0 };
    const s = ppveScaleEnemy(base, 10, team, false);
    const share = (0.015 + 10 * 0.0003) * 0.54 * team.avgMaxHp; // minion role 0.5 + 0.004 * 10
    assert.ok(basicHit(s.attack, team.avgDefense) >= share - 1);
    assert.ok(Math.abs(basicHit(attackForDamage(share, team.avgDefense), team.avgDefense) - share) < 1);
  });

  it('the HP anchor makes an enemy survive a number of the team basic hits', () => {
    const team: TeamPower = { topLevel: 40, avgMaxHp: 1000, avgDefense: 10, avgMagicDefense: 10, avgBestAttack: 50000 };
    const s = ppveScaleEnemy(base, 40, team, true);
    const hits = (3 + Math.floor(40 / 20)) * 1.5;
    assert.ok(s.hpMax >= Math.ceil(hits * basicHit(50000, Math.min(s.defense, s.magicDefense))));
  });

  it('team power averages the line-up', () => {
    const tp = teamPowerOf([
      { level: 10, hpMax: 100, defense: 10, magicDefense: 20, attack: 30, magicAttack: 50 },
      { level: 30, hpMax: 300, defense: 30, magicDefense: 40, attack: 70, magicAttack: 10 },
    ]);
    assert.deepEqual(tp, { topLevel: 30, avgMaxHp: 200, avgDefense: 20, avgMagicDefense: 30, avgBestAttack: 60 });
    assert.deepEqual(teamPowerOf([]), NO_TEAM);
  });
});

describe('carve bonus', () => {
  const tables = buildPpveTables(
    [{ id: 1101, costkp: 25, p: 1, pv: 30 }, { id: 1102, costkp: 30, p: 1, pv: 60 }, { id: 1201, costkp: 25, p: 31, pv: 0.05 }, { id: 2101, costkp: 25, p: 99, pv: 5 }],
    [], [{ id: 1, p1: 1, pv1: 300, p2: 4, pv2: 75, p3: 0, pv3: 0, p4: 0, pv4: 0, p5: 0, pv5: 0 }],
  );
  const carve = (id: number) => tables.carves.get(id);
  const master = (mlv: number) => tables.masters.get(mlv);

  it('sums the opened nodes and the master row per prop (cumulative pv: a node counts once)', () => {
    const totals = carveTotals({ p: { s0: [1102, 1201, 0, 0, 0, 0], s1: [2101, 0, 0, 0, 0, 0] }, mlv: 1 }, carve, master);
    assert.equal(totals.get(1), 60 + 300);
    assert.equal(totals.get(31), 0.05);
    assert.equal(totals.get(4), 75);
    assert.equal(totals.get(99), 5);
  });

  it('turns the totals into flats and rates through the talent prop table; unknown props add nothing', () => {
    const b = carveBonuses({ p: { s0: [1101, 1201, 0, 0, 0, 0], s1: [2101, 0, 0, 0, 0, 0] }, mlv: 0 }, carve, master);
    assert.equal(b.flat.maxHp, 30);
    assert.ok(Object.values(b.rates).some((v) => v === 0.05));
    assert.equal(Object.keys(b.flat).length, 1);
  });

  it('an empty state gives empty bonuses', () => {
    const b = carveBonuses({ p: {}, mlv: 0 }, carve, master);
    assert.deepEqual(b.flat, {});
    assert.deepEqual(b.rates, {});
  });
});
