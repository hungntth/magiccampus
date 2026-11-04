// Unit tests for pets in battle: slot +5 and the cList entry, the second battleUpdateCmd entry, the pet AI fallback, targeting and
// victory with pets, a dead owner with a live pet, and the settle plan (exp share incl. a dead pet, life drain for all).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, BattleBehavior, BattleParticipantType, BattleResult, petExpOfLevel, type BattleStep } from '@mc/shared';
import type { BattlePet } from '../pet/pet-battle.service';
import { applyPetExp } from '../pet/pet-level';
import { PET_BATTLE_LIFE_COST, petBattleExp, petLifeAfterBattle } from '../pet/pet-rules';
import { parseCommands } from './battle-command.service';
import type { Fighter, PlayerCommand } from './battle.types';
import { petFighter, toParticipant } from './fighters';
import { petSettlements } from './roster';
import { petFallbackCommand, resolveRound } from './round';

const pet: BattlePet = {
  petId: 77, ownerCid: 5, tid: 32, name: 'Nấm', level: 3, resCode: '123', colorCode: '9', iconCode: '8', element: 2, skills: [14], skillList: [],
  stats: {
    maxHp: 300, maxMp: 40, maxSp: 150, attack: 30, magicAttack: 10, defense: 5, magicDefense: 5, hit: 100, critical: 0, dodge: 0, speed: 90,
  },
};
const mk = (slot: number, side: Fighter['side'], o: Partial<Fighter> = {}): Fighter => ({
  slot, side, kind: side === 'player' ? 'character' : 'creature', refId: slot, name: `f${slot}`, level: 5, hp: 100, hpMax: 100,
  mp: 0, mpMax: 0, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive: true, expBase: -1, attack: 20, magicAttack: 0, defense: 0,
  magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 150, speed: 100, combo: 0, counter: 0, resiCritical: 0, resiDefy: 0,
  praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0, enhPhyHurt: 0, enhMagicHurt: 0, ...o,
});
const board = (...fs: Fighter[]): Map<number, Fighter> => new Map(fs.map((f) => [f.slot, f]));
const half = (): number => 0.5;
const defend: PlayerCommand = { action: BattleAction.DEFENCE, targetSlot: -1 };
const steps = (groups: BattleStep[][]): BattleStep[] => groups.flat();

describe('pet fighter', () => {
  it('sits at owner slot + 5 on the player side with full HP/MP', () => {
    for (const owner of [10, 11, 14]) assert.equal(petFighter(owner, pet).slot, owner + 5);
    const f = petFighter(10, pet);
    assert.deepEqual([f.side, f.kind, f.hp, f.hpMax, f.mp, f.mpMax, f.alive, f.refId], ['player', 'pet', 300, 300, 40, 40, true, 77]);
  });
  it('is a type 39 cList entry with the owner cid, template and look codes', () => {
    const p = toParticipant(petFighter(12, pet));
    assert.equal(p.type, BattleParticipantType.PET);
    assert.deepEqual([p.id, p.battleId, p.cid, p.tid, p.colorCode, p.iconCode, p.element, p.bossFlag], [77, 17, 5, 32, '9', '8', 2, 0]);
  });
});

describe('parseCommands', () => {
  const entry = (o: Record<string, unknown>): Record<string, unknown> => ({ tid: 0, action: BattleAction.ATTACK, id: -1, level: -1, ...o });
  it('index 0 is the owner, index 1 the pet', () => {
    const c = parseCommands([entry({ tid: 0 }), entry({ tid: 2, action: BattleAction.SKILL, id: 14, level: 1 })]);
    assert.equal(c.own.tid, 0);
    assert.deepEqual(c.pet, { tid: 2, action: BattleAction.SKILL, id: 14, level: 1 });
  });
  it('one entry (or a bare object) has no pet command', () => {
    assert.equal(parseCommands([entry({})]).pet, undefined);
    assert.equal(parseCommands(entry({})).pet, undefined);
  });
  it('rejects a malformed pet entry', () => {
    assert.throws(() => parseCommands([entry({}), { action: 'x' }]));
  });
});

describe('petFallbackCommand', () => {
  it('basic attack on a random living enemy', () => {
    const fs = [mk(0, 'enemy', { alive: false }), mk(2, 'enemy'), mk(1, 'enemy'), mk(10, 'player')];
    assert.deepEqual(petFallbackCommand(fs, () => 0), { action: BattleAction.ATTACK, targetSlot: 2 });
    assert.deepEqual(petFallbackCommand(fs, () => 0.99), { action: BattleAction.ATTACK, targetSlot: 1 });
  });
  it('stands when no enemy is left', () => {
    assert.equal(petFallbackCommand([mk(10, 'player')], half).action, BattleAction.TIMEOUT);
  });
});

describe('resolveRound with a pet', () => {
  it('a pet without a command attacks on its own', () => {
    const p = mk(10, 'player', { speed: 10 });
    const pf = { ...petFighter(10, pet), attack: 5000 };
    const e = mk(0, 'enemy', { hp: 50, hpMax: 50, speed: 1 });
    const out = resolveRound(board(p, pf, e), new Map([[10, defend]]), 1, half);
    assert.equal(e.alive, false);
    assert.equal(out.result, BattleResult.WIN);
    assert.ok(steps(out.groups).some((s) => s.sid === 15 && s.bid === BattleBehavior.ATTACK));
  });
  it('the pet command picks the target', () => {
    const e0 = mk(0, 'enemy', { hp: 100000, hpMax: 100000, attack: 1 });
    const e2 = mk(2, 'enemy', { hp: 100000, hpMax: 100000, attack: 1 });
    const cmds = new Map<number, PlayerCommand>([[10, defend], [15, { action: BattleAction.ATTACK, targetSlot: 2 }]]);
    resolveRound(board(mk(10, 'player'), petFighter(10, pet), e0, e2), cmds, 1, half);
    assert.ok(e2.hp < 100000);
    assert.equal(e0.hp, 100000);
  });
  it('enemies can target the pet', () => {
    const hit = new Set<number>();
    for (let i = 0; i < 6; i++) {
      const b = board(mk(10, 'player', { hp: 100000, hpMax: 100000 }), petFighter(10, pet), mk(0, 'enemy', { attack: 5, speed: 500 }));
      resolveRound(b, new Map([[10, defend]]), 1, () => (i % 2 === 0 ? 0 : 0.99));
      for (const f of b.values()) if (f.side === 'player' && f.hp < f.hpMax) hit.add(f.slot);
    }
    assert.ok(hit.has(15) && hit.has(10));
  });
  it('a living pet keeps the battle going after the owner fell; both down loses', () => {
    const owner = mk(10, 'player', { alive: false, hp: 0 });
    const e = mk(0, 'enemy', { hp: 100000, hpMax: 100000, attack: 1, speed: 1 });
    const out = resolveRound(board(owner, petFighter(10, pet), e), new Map([[15, defend]]), 1, half);
    assert.equal(out.ended, false);
    const dead = { ...petFighter(10, pet), hp: 0, alive: false };
    assert.equal(resolveRound(board(owner, dead, e), new Map(), 1, half).result, BattleResult.LOSE);
  });
  it('the pet killing the last enemy wins even though the owner is dead', () => {
    const owner = mk(10, 'player', { alive: false, hp: 0 });
    const pf = { ...petFighter(10, pet), attack: 5000 };
    const e = mk(0, 'enemy', { hp: 10, hpMax: 10 });
    assert.equal(resolveRound(board(owner, pf, e), new Map(), 1, half).result, BattleResult.WIN);
  });
});

describe('pet settle', () => {
  const fighters = [
    mk(10, 'player'), { ...petFighter(10, pet), alive: false, hp: 0 }, mk(11, 'player'), petFighter(11, { ...pet, petId: 78, ownerCid: 6 }),
  ];
  it('exp only for surviving owners (the dead pet included), a plan entry for every pet', () => {
    const plan = petSettlements(fighters, new Set([5]), petBattleExp(101));
    assert.deepEqual(plan, [{ petId: 77, ownerCid: 5, exp: 50 }, { petId: 78, ownerCid: 6, exp: null }]);
  });
  it('petBattleExp is floor(0.5 x split exp); life drains by 10 and never goes below 0', () => {
    assert.deepEqual([petBattleExp(0), petBattleExp(1), petBattleExp(99)], [0, 0, 49]);
    assert.equal(PET_BATTLE_LIFE_COST, 10);
    assert.deepEqual([petLifeAfterBattle(10000), petLifeAfterBattle(7), petLifeAfterBattle(0)], [9990, 0, 0]);
  });
});

describe('pet exp from battle / quest', () => {
  it('level-ups give +5 points per level; the full quest exp uses the same rule', () => {
    const r = applyPetExp(1, 1, petExpOfLevel(3) - 1);
    assert.deepEqual([r.level, r.levelsGained, r.pointsGained], [3, 2, 10]);
    assert.deepEqual([applyPetExp(100, 4, 0).levelsGained, applyPetExp(100, 4, -5).exp], [0, 100]);
  });
});
