// Unit tests for planCast: fraction vs absolute MP cost, passive refusal, basic-attack fallback without MP.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSkillTable } from '../gamedata/skill-data';
import { planCast } from './skill-cast';

const t = buildSkillTable([
  { id: 1, name: 'Melee', type: 1, use_mp: 10 },
  { id: 2, name: 'Frac', type: 3, use_mp: 0.05 },
  { id: 3, name: 'Passive', type: 11, use_mp: 0 },
  { id: 4, name: 'Buff', type: 6, use_mp: 5 },
  { id: 5, name: 'Heal', type: 5, use_mp: 15 },
  { id: 6, name: 'Ranged', type: 2, use_mp: 10 },
]);
const plan = (id: number, mp: number, mpMax: number) => planCast(t.get(id)!, mp, mpMax);

describe('planCast', () => {
  it('absolute cost: 10 MP', () => {
    const p = plan(1, 50, 100);
    assert.equal(p.kind, 'cast');
    if (p.kind === 'cast') assert.deepEqual([p.cast.mpCost, p.cast.category, p.cast.spec.magic, p.cast.spec.base, p.cast.spec.mult], [10, 'melee', false, 10, 1]);
  });
  it('fraction cost: 5 % of max MP', () => {
    const p = plan(2, 50, 200);
    assert.equal(p.kind === 'cast' && p.cast.mpCost, 10);
    assert.equal(p.kind === 'cast' && p.cast.spec.magic, true);
  });
  it('exactly enough MP casts, one short falls back to a basic attack', () => {
    assert.equal(plan(1, 10, 100).kind, 'cast');
    assert.equal(plan(1, 9, 100).kind, 'basic');
    assert.equal(plan(2, 9, 200).kind, 'basic'); // needs 10
  });
  it('passive skills are refused even with MP', () => {
    assert.deepEqual(plan(3, 100, 100), { kind: 'refused', reason: 'passive' });
  });
  it('status skills are unsupported in M2', () => {
    assert.deepEqual(plan(4, 100, 100), { kind: 'refused', reason: 'unsupported' });
  });
  it('remote skills stay physical, heals are magic-scaled', () => {
    const r = plan(6, 100, 100);
    assert.equal(r.kind === 'cast' && r.cast.spec.magic, false);
    assert.equal(plan(5, 100, 100).kind, 'cast');
  });
});
