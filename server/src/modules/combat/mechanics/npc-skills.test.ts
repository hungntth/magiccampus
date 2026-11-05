// Unit tests for the NPC skill catalogue: Go description ratios, areas from rows and text, boss specials, buff defs.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBuffDef, buildNpcSkill, npcSkillCost } from './npc-skills';
import { parseDamageRatio, parseDot, parseHot, immunityProps } from './skill-text';
import { buffRow, tpl } from './test-kit';

const none = (): undefined => undefined;

describe('skill text', () => {
  it('reads the earliest damage ratio and its kind (Go skill_damage_desc.go)', () => {
    assert.deepEqual(parseDamageRatio('Tấn công 1 mục tiêu, gây 300% sát thương vật lý'), { ratio: 3, flat: 0, kind: 'physical' });
    assert.deepEqual(parseDamageRatio('Tạo 150% sát thương vật lý cho mục tiêu.'), { ratio: 1.5, flat: 0, kind: 'physical' });
    assert.equal(parseDamageRatio('Gây 60% sát thương ma pháp cho 5 mục tiêu')?.kind, 'magic');
    assert.equal(parseDamageRatio('bằng 1.5 lần công kích ma pháp')?.ratio, 1.5);
    assert.deepEqual(parseDamageRatio('Gây 200 điểm sát thương'), { ratio: 1, flat: 200, kind: undefined });
    assert.equal(parseDamageRatio('Tấn công đơn thể mạnh mẽ'), null);
    // A ratio right after "giảm" / "tăng" is not the damage ratio.
    assert.equal(parseDamageRatio('giảm 30% công kích'), null);
  });
  it('parses DOT, HOT and immunity texts', () => {
    assert.deepEqual(parseDot('Mỗi lượt gây 0.3 lần sát thương ma pháp'), { kind: 'magic', value: 0.3 });
    assert.deepEqual(parseDot('Mỗi lượt giảm 9% giới hạn HP'), { kind: 'maxHp', value: 9 });
    assert.deepEqual(parseDot('Mỗi lượt giảm 2% HP, tối đa bằng x3 Công VL'), { kind: 'curHp', value: 2, capAttack: 3 });
    assert.deepEqual(parseHot('Mỗi lượt hồi phục 5% giới hạn HP', 3), { kind: 'maxHp', value: 5 });
    assert.equal(parseHot('Tăng phòng ngự', 3), null);
    assert.deepEqual(immunityProps('Trạng thái vô địch'), [908, 909]);
    assert.deepEqual(immunityProps('Tăng miễn giảm sát thương VL'), [910]);
  });
});

describe('buildNpcSkill', () => {
  it('maps types: 1 melee approach, 2 / 8 physical in place, 3 / 4 magic, 5 heal, 6 state, 11 passive, 7 unsupported', () => {
    const k = (type: number) => buildNpcSkill(tpl({ type }), none);
    assert.equal(k(1).approach, true);
    assert.equal(k(1).spec.ranged, false);
    assert.equal(k(2).physical, true);
    assert.equal(k(2).spec.ranged, true);
    assert.equal(k(3).spec.magic, true);
    assert.equal(k(5).kind, 'heal');
    assert.equal(k(6).kind, 'state');
    assert.equal(k(11).kind, 'passive');
    assert.equal(k(7).kind, 'unsupported');
  });
  it('generic numbers without a text ratio: 10 + (1 + req_level / 200), scaled by level', () => {
    const a = buildNpcSkill(tpl({ type: 3, reqLevel: 100 }), none);
    assert.deepEqual([a.spec.base, a.spec.mult], [10, 1.5]);
    const b = buildNpcSkill(tpl({ type: 3, level: 3 }), none);
    assert.equal(b.spec.base, 12);
    assert.ok(Math.abs(b.spec.mult - 1.2) < 1e-9);
    const c = buildNpcSkill(tpl({ type: 1, description: 'gây 300% sát thương vật lý', level: 5 }), none);
    assert.deepEqual([c.spec.base, c.spec.mult, c.spec.magic], [0, 3, false]);
  });
  it('areas: row pattern, state / heal multi, damage text decides target_num > 1', () => {
    assert.equal(buildNpcSkill(tpl({ areaAttack: 2, targetNum: 3 }), none).area, 'H');
    assert.equal(buildNpcSkill(tpl({ type: 6, targetNum: 3 }), none).area, 'M');
    assert.equal(buildNpcSkill(tpl({ type: 3, targetNum: 5, description: 'Sát thương 1 mục tiêu' }), none).area, '');
    assert.equal(buildNpcSkill(tpl({ type: 3, targetNum: 5, description: 'Tấn công tất cả mục tiêu' }), none).area, 'M');
    assert.equal(buildNpcSkill(tpl({ type: 3, targetNum: 5, description: 'Tấn công 5 kẻ địch ngẫu nhiên' }), none).area, 'R');
    assert.equal(buildNpcSkill(tpl({ type: 8, targetNum: 5, description: 'Tấn công tất cả mục tiêu' }), none).area, '');
  });
  it('type 23: kill text, Diệt Thần Trảm max-HP share, area capped by the text count', () => {
    assert.equal(buildNpcSkill(tpl({ id: 7000, type: 23, description: 'Giết chết 1 mục tiêu.' }), none).kill, true);
    const dtt = buildNpcSkill(tpl({ id: 5879, type: 23, description: 'Giết chết 1 mục tiêu.' }), none);
    assert.deepEqual([dtt.kill, dtt.maxHpPct], [undefined, { max: 0.95, min: 0.7 }]);
    const aa = buildNpcSkill(tpl({ type: 23, areaAttack: 4, targetNum: 10, description: 'Gây 60% sát thương ma pháp cho 5 mục tiêu' }), none);
    assert.deepEqual([aa.area, aa.areaSize, aa.spec.magic], ['R', 5, true]);
  });
  it('heal skills on target_type 11 heal the own side', () => {
    assert.equal(buildNpcSkill(tpl({ type: 5, targetType: 11 }), none).target, 'team');
  });
  it('buff defs: statuses from kind 1 / 10, mods with percent_flag, DOT, rate and rounds', () => {
    assert.equal(buildBuffDef(buffRow({ kind: 1, state: 10 }), 2).status, 10);
    assert.equal(buildBuffDef(buffRow({ kind: 10 }), 2).status, 80);
    assert.equal(buildBuffDef(buffRow({ kind: 1, state: 40 }), 2).status, undefined);
    const st = buildBuffDef(buffRow({ prop1: 4, prop_num1: 20, prop2: 12, prop_num2: 5, percent_flag: 1 }), 3);
    assert.deepEqual(st.mods, [{ prop: 4, value: 20, percent: true }, { prop: 12, value: 5, percent: true }]);
    const dot = buildBuffDef(buffRow({ kind: 6, state: 40, description: 'Mỗi lượt gây 0.5 lần sát thương ma pháp' }), 2);
    assert.deepEqual(dot.dot, { kind: 'magic', value: 0.5 });
    const sk = buildNpcSkill(tpl({ type: 1, buffId: 900, buffRate: 30, buffRound: 2 }), () => buffRow({ kind: 1, state: 10 }));
    assert.deepEqual([sk.buff?.rate, sk.buff?.def.rounds, sk.buff?.def.icon], [0.3, 2, '77']);
  });
  it('MP cost: a fraction of max MP, else absolute', () => {
    assert.equal(npcSkillCost(buildNpcSkill(tpl({ useMp: 0.1 }), none), 500), 50);
    assert.equal(npcSkillCost(buildNpcSkill(tpl({ useMp: 30 }), none), 500), 30);
  });
});
