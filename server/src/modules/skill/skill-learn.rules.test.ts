// Unit tests for the skill learning rules: validation order, family next level, cost plan, book key, training bonus.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SKILL_ERR } from '@mc/shared';
import type { SkillTemplate } from '../gamedata/skill-data';
import { bookSkillKey, chargePlan, familyEntry, pickBookSkill, trainingBonus, upgradeError, validateSkill } from './skill-learn.rules';

const tpl = (o: Partial<SkillTemplate> = {}): SkillTemplate => ({
  id: 1, name: 'Phi Vũ', type: 3, kind: 1, level: 1, useMp: 10, useSp: 0, iconCode: '0', targetType: 4, reqLevel: 10, base: 10, mult: 1,
  buffId: 0, creKind: '', codeName: 'SKILL1', scriptReqL: '', description: '', useEnv: 0, reqClass: [1], reqCl: 0, expSkill: 100,
  price: 50, ...o,
});

describe('validateSkill', () => {
  const c = { level: 10, classId: 1, cl: 0 };
  it('order: level, class, rank', () => {
    assert.equal(validateSkill(tpl({ reqLevel: 11, reqClass: [2], reqCl: 3 }), c), SKILL_ERR.LEVEL);
    assert.equal(validateSkill(tpl({ reqClass: [2], reqCl: 3 }), c), SKILL_ERR.CLASS);
    assert.equal(validateSkill(tpl({ reqCl: 3 }), c), SKILL_ERR.CLASS_RANK);
    assert.equal(validateSkill(tpl({ reqCl: 10 }), { ...c, cl: 5 }), SKILL_ERR.REBIRTH);
    assert.equal(validateSkill(tpl({ reqClass: [] }), c), null);
  });
});

describe('family', () => {
  const l1 = tpl({ id: 1, level: 1 });
  const l2 = tpl({ id: 2, level: 2 });
  const l3 = tpl({ id: 3, level: 3 });
  const lookup = (id: number): SkillTemplate | undefined => [l1, l2, l3].find((t) => t.id === id);
  it('finds the learned row by code_name', () => {
    assert.equal(familyEntry([{ skillId: 9 }, { skillId: 1 }], l2, lookup)?.row.skillId, 1);
    assert.equal(familyEntry([{ skillId: 9 }], l2, lookup), null);
  });
  it('upgrade must be exactly current + 1', () => {
    assert.equal(upgradeError(null, l2), SKILL_ERR.NOT_LEARNED);
    assert.equal(upgradeError(l2, l2), SKILL_ERR.SAME_LEVEL);
    assert.equal(upgradeError(l1, l3), SKILL_ERR.ONE_BY_ONE);
    assert.equal(upgradeError(l1, l2), null);
  });
});

describe('chargePlan', () => {
  it('exp first, then moneyBind whole, else money whole, never split', () => {
    assert.deepEqual(chargePlan({ expSkill: 100, price: 50 }, { pool: 99, money: 999, moneyBind: 999 }), { ok: false, err: SKILL_ERR.NO_EXP });
    assert.deepEqual(chargePlan({ expSkill: 100, price: 50 }, { pool: 100, money: 0, moneyBind: 50 }), { ok: true, field: 'moneyBind' });
    assert.deepEqual(chargePlan({ expSkill: 100, price: 50 }, { pool: 100, money: 50, moneyBind: 49 }), { ok: true, field: 'money' });
    assert.deepEqual(chargePlan({ expSkill: 100, price: 50 }, { pool: 100, money: 30, moneyBind: 30 }), { ok: false, err: SKILL_ERR.NO_SILVER });
    assert.deepEqual(chargePlan({ expSkill: 0, price: 0 }, { pool: 0, money: 0, moneyBind: 0 }), { ok: true, field: null });
  });
});

describe('books', () => {
  it('key after "sách kỹ năng" and "-"', () => {
    assert.equal(bookSkillKey('Sách Kỹ Năng - Phi  Vũ '), 'phi vũ');
    assert.equal(bookSkillKey('Phi Vũ'), 'phi vũ');
  });
  it('own class wins, else first by id; magic-weapon rows skipped', () => {
    const rows = [tpl({ id: 5, reqClass: [2] }), tpl({ id: 7, reqClass: [1] }), tpl({ id: 3, useEnv: 5 }), tpl({ id: 8, level: 2 })];
    assert.equal(pickBookSkill(rows, 'Sách Kỹ Năng - Phi Vũ', 1)?.id, 7);
    assert.equal(pickBookSkill(rows, 'Sách Kỹ Năng - Phi Vũ', 3)?.id, 5);
    assert.equal(pickBookSkill(rows, 'Sách Kỹ Năng - Không Có', 1), null);
  });
});

describe('trainingBonus', () => {
  it('base × level × tier × 10 for Luyện rows', () => {
    assert.deepEqual(trainingBonus(tpl({ name: 'Luyện Sinh Mệnh Sơ Cấp', kind: 5, type: 11, level: 1 })), { stat: 'maxHp', value: 1100 });
    assert.deepEqual(trainingBonus(tpl({ name: 'Luyện Tốc Độ Cao Cấp', kind: 5, type: 11, level: 10 })), { stat: 'speed', value: 900 });
    assert.deepEqual(trainingBonus(tpl({ name: 'Luyện Phòng Ma Pháp Trung Cấp', kind: 5, type: 11, level: 2 })), { stat: 'magicDefense', value: 1200 });
    assert.equal(trainingBonus(tpl({ name: 'Phi Vũ', kind: 5, type: 11 })), null);
    assert.equal(trainingBonus(tpl({ name: 'Luyện Sinh Mệnh Sơ Cấp', kind: 1, type: 11 })), null);
  });
});
