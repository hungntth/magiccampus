// Unit vectors for PPVE / arena pet script target selection (Go scripted_pet.go rules and its test cases).

import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleAction } from '@mc/shared';
import type { Fighter } from '../combat/battle.types';
import { selectPetScript } from './pet-script';

function fighter(slot: number, side: Fighter['side'], over: Partial<Fighter> = {}): Fighter {
  return {
    slot, side, kind: 'pet', refId: slot, name: String(slot), level: 1, hp: 100, hpMax: 100, mp: 10, mpMax: 10, sp: 0, spMax: 0,
    resCode: '0', bossFlag: 0, alive: true, expBase: 0, attack: 10, magicAttack: 10, defense: 1, magicDefense: 1,
    hit: 1, dodge: 0, critical: 0, criticalDmg: 200, speed: 10, combo: 0, counter: 0, resiCritical: 0, resiDefy: 0,
    praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0, enhPhyHurt: 0, enhMagicHurt: 0, ...over,
  };
}

// The Go fixture: enemies e5 (hp 90, atk 10, spd 5), e6 (hp 30, atk 50, spd 1), e7 (hp 60, atk 20, spd 99) at positions 5, 6, 7.
const own = (): Fighter => fighter(15, 'player', { skills: [7010] });
const foes = (): Fighter[] => [
  fighter(5, 'enemy', { hp: 90, attack: 10, speed: 5 }), fighter(6, 'enemy', { hp: 30, attack: 50, speed: 1 }), fighter(7, 'enemy', { hp: 60, attack: 20, speed: 99 }),
];
const pick = (t: number, round = 1, rng = (): number => 0, f = foes()): number => {
  const me = own();
  return selectPetScript({ 0: { action: -10, id: 0, level: 1, t } }, round, me, [me, ...f], rng)!.targetSlot;
};

test('target rules: highest attack, lowest HP, fastest and fixed position', () => {
  assert.equal(pick(2), 6);
  assert.equal(pick(3), 6);
  assert.equal(pick(4), 7);
  assert.equal(pick(50), 5);
  assert.equal(pick(51), 6);
  assert.equal(pick(52), 7);
});

test('highest attack looks at the larger of attack and magic attack', () => {
  const f = foes();
  f[0].magicAttack = 400;
  assert.equal(pick(2, 1, () => 0, f), 5);
});

test('lowest HP is the absolute current HP, not the ratio', () => {
  const f = [fighter(5, 'enemy', { hp: 60, hpMax: 60 }), fighter(6, 'enemy', { hp: 50, hpMax: 1000 })];
  assert.equal(pick(3, 1, () => 0, f), 6);
  f[0].hp = 40;
  assert.equal(pick(3, 1, () => 0, f), 5);
});

test('a dead or missing fixed position falls back to a random living target', () => {
  const f = foes();
  f[0].alive = false;
  assert.equal(pick(50, 1, () => 0, f), 6);
  assert.equal(pick(50, 1, () => 0.99, f), 7);
  assert.equal(pick(54, 1, () => 0, foes()), 5); // position 5 is absent: random pick index 0
  assert.equal(pick(54, 1, () => 0.5, foes()), 6);
});

test('fixed position matches the opposing slot modulo 10 (arena attackers sit at 15..19)', () => {
  const attacker = fighter(5, 'enemy', {}); // a defender looking at attackers at 15..19
  const targets = [fighter(15, 'player'), fighter(16, 'player'), fighter(17, 'player')];
  assert.equal(selectPetScript({ 0: { action: -10, id: 0, level: 1, t: 51 } }, 1, attacker, [attacker, ...targets], () => 0)!.targetSlot, 16);
});

test('random uses the injected rng over the living enemies in slot order', () => {
  assert.equal(pick(1, 1, () => 0), 5);
  assert.equal(pick(1, 1, () => 0.5), 6);
  assert.equal(pick(1, 1, () => 0.99), 7);
});

test('a script cycles by round and falls back when a skill is absent', () => {
  const me = own();
  const script = { 0: { action: -50, id: 7010, level: 1, t: 52 }, 1: { action: -50, id: 9, level: 1, t: 1 } };
  const all = [me, ...foes()];
  assert.deepEqual(selectPetScript(script, 1, me, all, () => 0), { action: BattleAction.SKILL, skillId: 7010, targetSlot: 7 });
  assert.deepEqual(selectPetScript(script, 2, me, all, () => 0.99), { action: BattleAction.ATTACK, targetSlot: 7 }); // skill 9 not owned
  assert.deepEqual(selectPetScript(script, 3, me, all, () => 0), { action: BattleAction.SKILL, skillId: 7010, targetSlot: 7 });
  assert.deepEqual(selectPetScript(script, 4, me, all, () => 0.99), { action: BattleAction.ATTACK, targetSlot: 7 });
});

test('a three-entry script wraps after three rounds', () => {
  const me = own();
  const script = { 0: { action: -10, id: 0, level: 1, t: 50 }, 1: { action: -10, id: 0, level: 1, t: 51 }, 2: { action: -10, id: 0, level: 1, t: 52 } };
  const all = [me, ...foes()];
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((r) => selectPetScript(script, r, me, all, () => 0)!.targetSlot), [5, 6, 7, 5, 6, 7, 5]);
});

test('an empty script attacks a random enemy; no living enemy gives no command', () => {
  const me = own();
  assert.deepEqual(selectPetScript(undefined, 1, me, [me, ...foes()], () => 0.5), { action: BattleAction.ATTACK, targetSlot: 6 });
  assert.equal(selectPetScript({}, 1, me, [me], () => 0), null);
});
