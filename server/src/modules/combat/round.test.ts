// Unit tests for resolveRound: speed order, miss on a dead target, defend, escape, victory and the round cap.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, BattleBehavior, BattleResult, type BattleStep } from '@mc/shared';
import type { Fighter, PlayerCommand } from './battle.types';
import { actOrder, MAX_ROUNDS, resolveRound } from './round';

const mk = (slot: number, side: Fighter['side'], o: Partial<Fighter> = {}): Fighter => ({
  slot, side, kind: side === 'player' ? 'character' : 'creature', refId: slot, name: `f${slot}`, level: 5,
  hp: 100, hpMax: 100, mp: 0, mpMax: 0, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive: true, expBase: -1,
  attack: 20, magicAttack: 0, defense: 0, magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 150, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0, ...o,
});
const board = (...fs: Fighter[]): Map<number, Fighter> => new Map(fs.map((f) => [f.slot, f]));
const attack = (target: number): PlayerCommand => ({ action: BattleAction.ATTACK, targetSlot: target });
const flat = (groups: BattleStep[][]): BattleStep[] => groups.flat();
const half = (): number => 0.5;

describe('actOrder', () => {
  it('sorts by speed descending and breaks ties with the RNG', () => {
    const a = mk(10, 'player', { speed: 120 });
    const b = mk(0, 'enemy', { speed: 100 });
    const c = mk(2, 'enemy', { speed: 100 });
    assert.deepEqual(actOrder([b, c, a], half).map((f) => f.slot), [10, 0, 2]);
    const rolls = [0.9, 0.5, 0.1]; // a, b, c: c draws the lowest tie key
    let i = 0;
    assert.deepEqual(actOrder([a, b, c], () => rolls[i++]).map((f) => f.slot), [10, 2, 0]);
  });
  it('skips dead fighters', () => {
    assert.deepEqual(actOrder([mk(10, 'player', { alive: false }), mk(0, 'enemy')], half).map((f) => f.slot), [0]);
  });
});

describe('resolveRound', () => {
  it('the faster actor strikes first; a kill ends the round for slower actors', () => {
    const p = mk(10, 'player', { speed: 200, attack: 5000 });
    const e = mk(0, 'enemy', { speed: 100, hp: 10, hpMax: 10 });
    const out = resolveRound(board(p, e), attack(0), 1, half);
    assert.equal(out.ended, true);
    assert.equal(out.result, BattleResult.WIN);
    const steps = flat(out.groups);
    assert.equal(steps.find((s) => s.bid === BattleBehavior.ATTACK)?.sid, 10);
    assert.ok(steps.some((s) => s.bid === BattleBehavior.DIE && s.sid === 0)); // creature dies with 10120
    assert.equal(steps.filter((s) => s.bid === BattleBehavior.ATTACK).length, 1); // the dead enemy never acts
    assert.equal(p.hp, 100);
    assert.equal(out.groups.at(-1)?.[0].end, true);
    assert.equal(out.groups.at(-1)?.[0].result, BattleResult.WIN);
  });

  it('carries the unclamped new hp (overkill) in hHp and clamps the fighter at 0', () => {
    const p = mk(10, 'player', { speed: 200, attack: 5000 });
    const e = mk(0, 'enemy', { hp: 10, hpMax: 10 });
    const out = resolveRound(board(p, e), attack(0), 1, half);
    const hit = flat(out.groups).find((s) => s.bid === BattleBehavior.ATTACK);
    assert.ok((hit?.tSObj?.hHp ?? 0) < 0);
    assert.equal(e.hp, 0);
  });

  it('an enemy whose target died earlier in the round attacks in place with tid -1', () => {
    const p = mk(10, 'player', { speed: 50, hp: 1, hpMax: 1 });
    const e1 = mk(0, 'enemy', { speed: 300, attack: 5000 });
    const e2 = mk(2, 'enemy', { speed: 200 });
    // e1 kills the player; the victory check ends the round before e2 acts
    const out = resolveRound(board(p, e1, e2), attack(0), 1, half);
    assert.equal(out.result, BattleResult.LOSE);
    assert.equal(p.alive, false);
    assert.ok(flat(out.groups).some((s) => s.bid === BattleBehavior.DEAD && s.sid === 10)); // player dies with 4
    assert.equal(flat(out.groups).filter((s) => s.sid === 2).length, 0);
  });

  it('a player attack on an already dead slot is a miss with tid -1', () => {
    const p = mk(10, 'player');
    const dead = mk(0, 'enemy', { alive: false, hp: 0 });
    const e = mk(2, 'enemy', { speed: 1 });
    const out = resolveRound(board(p, dead, e), attack(0), 1, half);
    const first = flat(out.groups).find((s) => s.bid === BattleBehavior.ATTACK);
    assert.equal(first?.tid, -1);
    assert.equal(out.ended, false);
  });

  it('defend halves the damage taken and the hurt uses behaviour 6; timeout does not', () => {
    const mkBoard = (): Map<number, Fighter> =>
      board(mk(10, 'player', { speed: 1, hp: 10000, hpMax: 10000 }), mk(0, 'enemy', { speed: 100, attack: 100 }));
    const noGuard = mkBoard();
    resolveRound(noGuard, { action: BattleAction.TIMEOUT, targetSlot: -1 }, 1, half);
    const guard = mkBoard();
    const out = resolveRound(guard, { action: BattleAction.DEFENCE, targetSlot: -1 }, 1, half);
    const lostFull = 10000 - noGuard.get(10)!.hp;
    const lostGuard = 10000 - guard.get(10)!.hp;
    assert.equal(lostGuard, Math.trunc(lostFull / 2));
    assert.ok(flat(out.groups).some((s) => s.bid === BattleBehavior.DEFENCE && s.sid === 10));
  });

  it('escape always succeeds: result 2, no deaths, hp kept', () => {
    const p = mk(10, 'player', { speed: 500 });
    const e = mk(0, 'enemy');
    const out = resolveRound(board(p, e), { action: BattleAction.ESCAPE, targetSlot: -1 }, 1, half);
    assert.equal(out.ended, true);
    assert.equal(out.result, BattleResult.FLED);
    assert.ok(flat(out.groups).some((s) => s.bid === BattleBehavior.ESCAPE));
    assert.equal(p.hp, 100);
    assert.equal(e.hp, 100);
  });

  it('item heals the player capped at the max and reports the new hp in tSObj.rHp', () => {
    const p = mk(10, 'player', { hp: 40, hpMax: 100, speed: 500 });
    const e = mk(0, 'enemy', { attack: 0 });
    const out = resolveRound(board(p, e), { action: BattleAction.ITEM, targetSlot: 10, heal: { hp: 300, mp: 0 } }, 1, half);
    const use = flat(out.groups).find((s) => s.bid === BattleBehavior.MAGIC);
    assert.equal(use?.tSObj?.rHp, 100);
  });

  it('round 30 without a winner ends in an enemy win', () => {
    const p = mk(10, 'player', { attack: 0, hp: 100000, hpMax: 100000 });
    const e = mk(0, 'enemy', { attack: 0, hp: 100000, hpMax: 100000, defense: 100000 });
    assert.equal(resolveRound(board(p, e), attack(0), MAX_ROUNDS - 1, half).ended, false);
    const last = resolveRound(board(p, e), attack(0), MAX_ROUNDS, half);
    assert.equal(last.ended, true);
    assert.equal(last.result, BattleResult.LOSE);
  });
});

describe('skill casts', () => {
  const melee = { name: 'Khai Sơn Chi Lực', category: 'melee', mpCost: 10, spec: { magic: false, mult: 1, base: 10 } } as const;
  const magic = { name: 'Phi Vũ', category: 'magic', mpCost: 20, spec: { magic: true, mult: 1, base: 10 } } as const;
  const heal = { name: 'Thần Chi Mệnh', category: 'heal', mpCost: 15, spec: { magic: true, mult: 1, base: 10 } } as const;
  const cast = (skill: PlayerCommand['skill'], target = 0): PlayerCommand => ({ action: BattleAction.ATTACK, targetSlot: target, skill });
  const bigEnemy = (): Fighter => mk(0, 'enemy', { hp: 9999, hpMax: 9999, attack: 1 });

  it('a melee skill spends MP, approaches like an attack and carries the banner + uMp on its first step', () => {
    const p = mk(10, 'player', { speed: 200, mp: 50, mpMax: 50 });
    const out = resolveRound(board(p, bigEnemy()), cast(melee), 1, half);
    assert.equal(p.mp, 40);
    const steps = flat(out.groups);
    assert.ok(steps.some((s) => s.sid === 10 && s.bid === BattleBehavior.RUN_FAST));
    const first = steps[0];
    assert.deepEqual([first.sid, first.bid, first.sSObj], [10, BattleBehavior.TURNTO, { skill: 'Khai Sơn Chi Lực', uMp: 40 }]);
  });

  it('a magic skill casts in place with bid 7 and never runs', () => {
    const p = mk(10, 'player', { speed: 200, mp: 50, mpMax: 50, magicAttack: 30 });
    const e = bigEnemy();
    const out = resolveRound(board(p, e), cast(magic), 1, half);
    const steps = flat(out.groups);
    const hit = steps.find((s) => s.sid === 10 && s.bid === BattleBehavior.MAGIC);
    assert.ok(hit && (hit.tSObj?.hHp ?? 9999) < 9999);
    assert.equal(p.mp, 30);
    assert.ok(!steps.some((s) => s.sid === 10 && s.bid === BattleBehavior.RUN_FAST));
    assert.deepEqual(steps[0].sSObj, { skill: 'Phi Vũ', uMp: 30 });
    assert.ok(e.hp < 9999);
  });

  it('a basic attack leaves MP alone and has no banner', () => {
    const p = mk(10, 'player', { speed: 200, mp: 50, mpMax: 50 });
    const out = resolveRound(board(p, bigEnemy()), attack(0), 1, half);
    assert.equal(p.mp, 50);
    assert.ok(flat(out.groups).every((s) => s.sSObj === undefined));
  });

  it('a heal skill restores the caster (clamped to max) with rHp', () => {
    const p = mk(10, 'player', { speed: 200, hp: 10, mp: 50, mpMax: 50, magicAttack: 100 });
    const out = resolveRound(board(p, bigEnemy()), cast(heal, 10), 1, half);
    const step = flat(out.groups).find((s) => s.sid === 10 && s.bid === BattleBehavior.MAGIC);
    assert.equal(p.mp, 35);
    assert.ok((step?.tSObj?.rHp ?? 0) > 10 && (step?.tSObj?.rHp ?? 0) <= 100); // the enemy strikes afterwards
    assert.deepEqual(step?.sSObj, { skill: 'Thần Chi Mệnh', uMp: 35 });
  });
});
