// Awakening rules: gates, cost plan (auto-buy), the roll with an injected RNG, pity, the cumulative stat sum (rows 1..L) and talents.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildFeatureTables } from '../gamedata/feature-data';
import { addSkillPoint, awakenBonuses, awakenGate, awakenHit, awakenMiss, awakenRoll, awakenTotals, planAwakenCost, reduceSkillPoint } from './awaken-rules';
import type { AwakenState } from './feature-state';

const raw = [
  { id: 1, name: 'A1', item_num: 10, money: 280000, rate: 100, points: 0, req_level: 80, prop1: 1, prop_num1: 1959, prop2: -1, prop_num2: 0 },
  { id: 2, name: 'A2', item_num: 10, money: 420000, rate: 90, points: 2, req_level: 80, prop1: 4, prop_num1: 490, prop2: 5, prop_num2: 392 },
  { id: 3, name: 'A3', item_num: 12, money: 560000, rate: 50, points: 1, req_level: 90, prop1: 1, prop_num1: 100, prop2: 62, prop_num2: 1.5 },
];
const t = buildFeatureTables([], raw, [{ id: 1001, skill_code_name: 'SKILL111001|x', name: 'S', cost_points: 2, max_level: 2, req_points: 0 }], []);
const rowOf = (l: number) => t.awakening.get(l);
const fresh = (over: Partial<AwakenState> = {}): AwakenState => ({ level: 0, point: 0, pointUsed: 0, pointDict: {}, awakenAdd: 0, ...over });

describe('awakenGate', () => {
  it('checks max level, row and player level', () => {
    assert.equal(awakenGate(80, fresh(), rowOf(1)), null);
    assert.match(awakenGate(79, fresh(), rowOf(1))!, /80/);
    assert.match(awakenGate(100, fresh({ level: 77 }), undefined)!, /giác ngộ/);
    assert.match(awakenGate(100, fresh({ level: 5 }), undefined)!, /dữ liệu/);
  });
});

describe('planAwakenCost', () => {
  const row = rowOf(1)!;
  it('takes the items when the bag has them', () => {
    assert.deepEqual(planAwakenCost(row, 15, false), { kind: 'pay', takeItems: 10, boughtItems: 0, gold: 0 });
  });
  it('asks for gold without autoBuy and buys the rest with it', () => {
    assert.deepEqual(planAwakenCost(row, 4, false), { kind: 'needGold', gold: 60 });
    assert.deepEqual(planAwakenCost(row, 4, true), { kind: 'pay', takeItems: 4, boughtItems: 6, gold: 60 });
    assert.deepEqual(planAwakenCost(row, 0, true), { kind: 'pay', takeItems: 0, boughtItems: 10, gold: 100 });
  });
});

describe('roll / hit / miss', () => {
  it('rolls rate + pity percent against the injected rng', () => {
    assert.equal(awakenRoll(() => 0.89, 90, 0), true);
    assert.equal(awakenRoll(() => 0.9, 90, 0), false);
    assert.equal(awakenRoll(() => 0.9, 90, 1), true); // pity
  });
  it('a hit levels up, grants points and clears the pity; a miss adds one step', () => {
    const hit = awakenHit(fresh({ level: 1, point: 3, awakenAdd: 4 }), rowOf(2)!);
    assert.deepEqual(hit, fresh({ level: 2, point: 5, awakenAdd: 0 }));
    assert.equal(awakenMiss(fresh({ awakenAdd: 2 })).awakenAdd, 3);
  });
});

describe('cumulative stats', () => {
  it('sums rows 1..L (not only row L)', () => {
    assert.deepEqual(awakenTotals(2, rowOf), [{ t: 1, v: 1959 }, { t: 4, v: 490 }, { t: 5, v: 392 }]);
    const b = awakenBonuses(3, rowOf);
    assert.equal(b.flat.maxHp, 1959 + 100);
    assert.equal(b.flat.attack, 490);
    assert.equal(b.flat.magicAttack, 392);
    assert.equal(b.rates.finalEnhPhyHurt, 1.5);
  });
  it('level 0 gives nothing', () => {
    assert.deepEqual(awakenBonuses(0, rowOf).flat, {});
  });
});

describe('talent points', () => {
  const skill = t.awakenSkills.get(1001)!;
  it('addSkillPoint needs free points, room and spent points', () => {
    assert.equal(addSkillPoint(fresh({ point: 1 }), skill).ok, false);
    const ok = addSkillPoint(fresh({ point: 5 }), skill);
    assert.deepEqual(ok.ok && ok.state, fresh({ point: 3, pointUsed: 2, pointDict: { SKILL111001: 1 } }));
    assert.equal(addSkillPoint(fresh({ point: 9, pointDict: { SKILL111001: 2 } }), skill).ok, false);
    assert.equal(addSkillPoint(fresh({ point: 5 }), { ...skill, req: 4 }).ok, false);
  });
  it('reduceSkillPoint refunds and removes empty entries', () => {
    assert.equal(reduceSkillPoint(fresh(), skill).ok, false);
    const r = reduceSkillPoint(fresh({ point: 0, pointUsed: 2, pointDict: { SKILL111001: 1 } }), skill);
    assert.deepEqual(r.ok && r.state, fresh({ point: 2, pointUsed: 0, pointDict: {} }));
  });
});
