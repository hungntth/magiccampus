// Unit tests for the NPC AI: Go order (opener > rotation > support > 30 % roll > attack), scaled rolls, MP rules, mana upkeep.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { npcChance, restoreBossMana, selectNpcCommand } from './npc-ai';
import { board, buffRow, env, mk, seq } from './test-kit';

const bolt = { tpl: { type: 3, useMp: 10 } };
const nameOf = (c: ReturnType<typeof selectNpcCommand>): string => (c.kind === 'skill' ? `skill ${c.skill.id}` : 'attack');

describe('selectNpcCommand', () => {
  it('no skill rows: a basic attack on a living opponent', () => {
    const npc = mk(0, 'enemy');
    const cmd = selectNpcCommand(npc, board(npc, mk(10, 'player')), env({}), seq([]), 1);
    assert.deepEqual([cmd.kind, cmd.kind === 'attack' ? cmd.target?.slot : 0], ['attack', 10]);
  });
  it('casts from the creature pool when the roll is under 30 %, else attacks', () => {
    const e = env({ 101: bolt }, { 0: [101] });
    const npc = mk(0, 'enemy');
    const b = board(npc, mk(10, 'player'));
    assert.equal(nameOf(selectNpcCommand(npc, b, e, seq([0.29]), 1)), 'skill 101');
    assert.equal(nameOf(selectNpcCommand(npc, b, e, seq([0.31]), 1)), 'attack');
  });
  it('SkillChanceScale raises the roll: 2 → 60 %, 3 → 90 %, capped at 1', () => {
    assert.equal(npcChance(mk(0, 'enemy', { npc: { chanceScale: 2 } }), 0.3), 0.6);
    assert.ok(Math.abs(npcChance(mk(0, 'enemy', { npc: { chanceScale: 3 } }), 0.3) - 0.9) < 1e-9);
    assert.equal(npcChance(mk(0, 'enemy', { npc: { chanceScale: 5 } }), 0.3), 1);
    const npc = mk(0, 'enemy', { npc: { chanceScale: 2, pool: [101] } });
    assert.equal(nameOf(selectNpcCommand(npc, board(npc, mk(10, 'player')), env({ 101: bolt }), seq([0.59]), 1)), 'skill 101');
  });
  it('an unaffordable skill is skipped; passives are never cast', () => {
    const e = env({ 101: bolt, 102: { tpl: { type: 11 } } }, { 0: [101, 102] });
    const npc = mk(0, 'enemy', { mp: 5 });
    assert.equal(nameOf(selectNpcCommand(npc, board(npc, mk(10, 'player')), e, seq([0]), 1)), 'attack');
  });
  it('support: a heal on the most hurt ally under 50 % at 60 %', () => {
    const e = env({ 201: { tpl: { type: 5, targetType: 8 } } }, { 0: [201] });
    const npc = mk(0, 'enemy');
    const hurt = mk(2, 'enemy', { hp: 300 });
    const cmd = selectNpcCommand(npc, board(npc, hurt, mk(10, 'player')), e, seq([0.5]), 1);
    assert.deepEqual([nameOf(cmd), cmd.kind === 'skill' ? cmd.target.slot : -1], ['skill 201', 2]);
  });
  it('support: a team buff on an ally without it at 25 %', () => {
    const e = env({ 202: { tpl: { type: 6, targetType: 8, buffId: 900, buffRate: 100, buffRound: 2 }, buff: buffRow({ prop1: 6, prop_num1: 10 }) } }, { 0: [202] });
    const npc = mk(0, 'enemy');
    assert.equal(nameOf(selectNpcCommand(npc, board(npc, mk(10, 'player')), e, seq([0.2, 0]), 1)), 'skill 202');
    npc.buffs = [{ id: 900, expireAfter: 9, appliedRound: 1, deltas: {} }];
    assert.equal(nameOf(selectNpcCommand(npc, board(npc, mk(10, 'player')), e, seq([0.2, 0, 0.9]), 1)), 'attack');
  });
  it('the opener queue pops one skill a turn before any roll, skipping unaffordable ones', () => {
    const e = env({ 301: { tpl: { type: 3, useMp: 500 } }, 302: bolt, 303: bolt });
    const npc = mk(0, 'enemy', { npc: { opener: [301, 302, 303] } });
    const b = board(npc, mk(10, 'player'));
    assert.equal(nameOf(selectNpcCommand(npc, b, e, seq([0.99]), 1)), 'skill 302');
    assert.deepEqual(npc.npc?.opener, [303]);
    assert.equal(nameOf(selectNpcCommand(npc, b, e, seq([0.99]), 2)), 'skill 303');
    assert.equal(nameOf(selectNpcCommand(npc, b, e, seq([0.99]), 3)), 'attack');
  });
  it('rotation: slot (round − 1) mod 4, one random candidate per slot (Rada 2196 boss row)', () => {
    const e = env({ 6836: bolt, 6837: bolt, 6835: bolt, 6831: bolt, 6833: bolt, 6834: bolt, 6832: bolt });
    const rada = mk(0, 'enemy', { refId: 2196, bossFlag: 1 });
    const b = board(rada, mk(10, 'player'));
    assert.equal(nameOf(selectNpcCommand(rada, b, e, seq([0]), 1)), 'skill 6836');
    assert.equal(nameOf(selectNpcCommand(rada, b, e, seq([0.9]), 2)), 'skill 6831');
    assert.equal(nameOf(selectNpcCommand(rada, b, e, seq([]), 4)), 'skill 6832');
    assert.equal(nameOf(selectNpcCommand(rada, b, e, seq([0]), 5)), 'skill 6836');
  });
  it('a silenced NPC only attacks', () => {
    const npc = mk(0, 'enemy', { statuses: [{ type: 80, duration: 2, buffId: 1, appliedRound: 1, sourceSlot: 10 }] });
    assert.equal(nameOf(selectNpcCommand(npc, board(npc, mk(10, 'player')), env({ 101: bolt }, { 0: [101] }), seq([0]), 1)), 'attack');
  });
});

describe('restoreBossMana', () => {
  it('boss rows regain max(10 % max MP, dearest cost, 1); max MP rises to the dearest cost', () => {
    const e = env({ 101: { tpl: { type: 3, useMp: 300 } } }, { 0: [101] });
    const boss = mk(0, 'enemy', { bossFlag: 1, mp: 0, mpMax: 200 });
    restoreBossMana(boss, e);
    assert.deepEqual([boss.mp, boss.mpMax], [300, 300]);
    const minion = mk(0, 'enemy', { mp: 0 });
    restoreBossMana(minion, e);
    assert.equal(minion.mp, 0);
  });
});
