// Headless pet battle runner: determinism, the round limit, script fallbacks and the replay-shaped output.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, BattleBehavior, PPVE_RESULT } from '@mc/shared';
import type { Fighter } from '../combat/battle.types';
import { mk, tpl } from '../combat/mechanics/test-kit';
import { choiceToCommand, hpShareOf, scriptedCommands, simulatePetBattle, winnerByHp } from './pet-sim';
import { seededRng } from './ppve-scaling';

const pet = (slot: number, side: Fighter['side'], o: Partial<Fighter> = {}): Fighter =>
  mk(slot, side, { kind: 'pet', ownerCid: 0, speed: 100 + slot, ...o });

const board = (): Fighter[] => [
  pet(15, 'player', { attack: 400, hp: 3000, hpMax: 3000 }),
  pet(16, 'player', { attack: 300, hp: 3000, hpMax: 3000 }),
  mk(0, 'enemy', { hp: 900, hpMax: 900, attack: 60 }),
  mk(2, 'enemy', { hp: 900, hpMax: 900, attack: 60 }),
];

describe('simulatePetBattle', () => {
  it('is deterministic for a seeded rng and shaped like a replay', () => {
    const run = (): ReturnType<typeof simulatePetBattle> => simulatePetBattle({ fighters: board(), rng: seededRng(7), battleFieldId: 'ppve_1_1' });
    const a = run();
    const b = run();
    assert.deepEqual(a.playList, b.playList);
    assert.equal(a.outcome, PPVE_RESULT.WIN);
    assert.ok(a.rounds >= 1 && a.rounds <= 24);
    assert.equal(a.start.battleFieldId, 'ppve_1_1');
    assert.deepEqual(Object.keys(a.start.cList).sort(), ['0', '15', '16', '2']);
    const last = a.playList[a.playList.length - 1];
    assert.equal(last.length, 1);
    assert.equal(last[0].end, true);
    assert.equal(last[0].result, undefined); // bare marker: no result / report
    assert.equal(a.playList.filter((g) => g.some((s) => s.end)).length, 1);
    assert.equal(a.hpShare.enemy, 0);
    assert.ok(a.hpShare.player > 0);
  });

  it('does not touch the caller fighters', () => {
    const fighters = board();
    simulatePetBattle({ fighters, rng: seededRng(1), battleFieldId: 'x' });
    assert.ok(fighters.every((f) => f.hp === f.hpMax && f.alive));
  });

  it('a losing side ends as a loss', () => {
    const fighters = [pet(15, 'player', { attack: 1, hp: 50, hpMax: 50 }), mk(0, 'enemy', { hp: 100000, hpMax: 100000, attack: 900 })];
    const r = simulatePetBattle({ fighters, rng: seededRng(3), battleFieldId: 'x' });
    assert.equal(r.outcome, PPVE_RESULT.LOSE);
    assert.equal(r.hpShare.player, 0);
  });

  it('stops at the round limit with NOT_END and a bare end marker', () => {
    const fighters = [
      pet(15, 'player', { attack: 1, hp: 1e9, hpMax: 1e9, defense: 1e9 }),
      mk(0, 'enemy', { hp: 1e9, hpMax: 1e9, attack: 1, defense: 1e9 }),
    ];
    const r = simulatePetBattle({ fighters, rng: seededRng(5), battleFieldId: 'x', roundLimit: 3 });
    assert.equal(r.outcome, PPVE_RESULT.NOT_END);
    assert.equal(r.rounds, 3);
    const last = r.playList[r.playList.length - 1][0];
    assert.equal(last.end, true);
    assert.equal(last.bid, BattleBehavior.STAND);
    assert.equal(r.playList.filter((g) => g.some((s) => s.end)).length, 1);
  });

  it('defaults to 24 rounds', () => {
    const fighters = [
      pet(15, 'player', { attack: 1, hp: 1e9, hpMax: 1e9, defense: 1e9 }),
      mk(0, 'enemy', { hp: 1e9, hpMax: 1e9, attack: 1, defense: 1e9 }),
    ];
    assert.equal(simulatePetBattle({ fighters, rng: seededRng(5), battleFieldId: 'x' }).rounds, 24);
  });

  it('pet vs pet (arena) runs on the same engine', () => {
    const fighters = [pet(15, 'player', { attack: 500, hp: 4000, hpMax: 4000 }), pet(5, 'enemy', { attack: 50, hp: 400, hpMax: 400 })];
    const r = simulatePetBattle({ fighters, rng: seededRng(9), battleFieldId: 'pvp' });
    assert.equal(r.outcome, PPVE_RESULT.WIN);
  });
});

describe('scripts', () => {
  const skills = (id: number): ReturnType<typeof tpl> | undefined => (id === 8 ? tpl({ id: 8, name: 'Chem', type: 2, useMp: 5 }) : id === 9 ? tpl({ id: 9, name: 'Chua', type: 5, useMp: 5 }) : undefined);

  it('an unlearned skill becomes a basic attack on the same target rule', () => {
    const own = pet(15, 'player', { skills: [8] });
    const foes = [mk(0, 'enemy'), mk(2, 'enemy', { attack: 500 })];
    const b = new Map([own, ...foes].map((f) => [f.slot, f]));
    const script = { 0: { action: -50, id: 77, level: 1, t: 2 } };
    const cmds = scriptedCommands(b, new Map([[15, script]]), 1, () => 0, skills);
    assert.deepEqual(cmds.get(15), { action: BattleAction.ATTACK, targetSlot: 2 });
  });

  it('a learned skill is planned against MP; too little MP is a basic attack', () => {
    const own = pet(15, 'player', { skills: [8], mp: 100, mpMax: 100 });
    const choice = { action: BattleAction.SKILL, skillId: 8, targetSlot: 0 };
    const cast = choiceToCommand(choice, own, skills);
    assert.equal(cast.skill?.name, 'Chem');
    assert.equal(cast.targetSlot, 0);
    const dry = choiceToCommand(choice, { ...own, mp: 0 }, skills);
    assert.equal(dry.skill, undefined);
    assert.equal(dry.targetSlot, 0);
  });

  it('a heal skill targets the caster', () => {
    const own = pet(15, 'player', { skills: [9], mp: 100, mpMax: 100 });
    const cmd = choiceToCommand({ action: BattleAction.SKILL, skillId: 9, targetSlot: 0 }, own, skills);
    assert.equal(cmd.skill?.category, 'heal');
    assert.equal(cmd.targetSlot, 15);
  });

  it('pets without a script and creatures are left to the engine', () => {
    const b = new Map([pet(15, 'player'), pet(16, 'player'), mk(0, 'enemy')].map((f) => [f.slot, f]));
    const cmds = scriptedCommands(b, new Map([[15, { 0: { action: -10, id: 0, level: 1, t: 51 } }]]), 1, () => 0, () => undefined);
    assert.deepEqual([...cmds.keys()], [15]);
    assert.equal(cmds.get(15)!.targetSlot, 0); // t 51 = fixed slot 1: absent, falls back to the first foe (slot 0)
  });

  it('the script cycles by round', () => {
    const own = pet(15, 'player', { skills: [8], mp: 100, mpMax: 100 });
    const b = new Map([own, mk(0, 'enemy')].map((f) => [f.slot, f]));
    const script = { 0: { action: -50, id: 8, level: 1, t: 1 }, 1: { action: -10, id: 0, level: 1, t: 1 } };
    const at = (round: number): boolean => scriptedCommands(b, new Map([[15, script]]), round, () => 0, skills).get(15)!.skill !== undefined;
    assert.deepEqual([1, 2, 3, 4].map(at), [true, false, true, false]);
  });
});

describe('hp share', () => {
  it('the attacker wins a tie, otherwise the higher share', () => {
    const f = [mk(10, 'player', { hp: 50, hpMax: 100 }), mk(0, 'enemy', { hp: 50, hpMax: 100 })];
    assert.equal(winnerByHp(hpShareOf(f)), 'player');
    f[0].hp = 49;
    assert.equal(winnerByHp(hpShareOf(f)), 'enemy');
  });
});
