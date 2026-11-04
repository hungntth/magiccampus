// Unit tests for the start skill list parser and the LearnedSkill mapping.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSkillTable } from '../gamedata/skill-data';
import { parseStartSkills, toLearnedSkill } from './skill-rules';

describe('parseStartSkills', () => {
  it('splits the pipe list', () => assert.deepEqual(parseStartSkills('1010|1086'), [1010, 1086]));
  it('ignores empty, junk and duplicate entries', () => {
    assert.deepEqual(parseStartSkills('|1010||x|1010|-3|'), [1010]);
    assert.deepEqual(parseStartSkills(null), []);
    assert.deepEqual(parseStartSkills(''), []);
  });
});

describe('skill table', () => {
  const t = buildSkillTable([
    { id: 1010, name: 'Khai Sơn Chi Lực', type: 1, kind: 1, level: 1, use_mp: 10, target_type: 4, icon_code: 4140200000001, exp_skill: 0, dex_skill: -1 },
    { id: 2012, name: 'Khinh Nhu Chi Âm', type: 3, use_mp: 0.05, target_type: 4, exp_skill: 0, dex_skill: -1 },
  ]);
  it('applies the Go adapter defaults (base 10, mult 1.0)', () => {
    assert.deepEqual([t.get(1010)!.base, t.get(1010)!.mult], [10, 1]);
  });
  it('maps a row to the wire DTO with icon code as string', () => {
    const dto = toLearnedSkill({ skillId: 1010, level: 1, position: 0 }, t.get(1010)!);
    assert.deepEqual(dto, {
      sid: 1010, level: 1, position: 0, kind: 1, name: 'Khai Sơn Chi Lực', type: 1, useMp: 10, iconCode: '4140200000001', targetType: 4,
    });
    assert.equal(t.get(2012)!.useMp, 0.05);
  });
});
