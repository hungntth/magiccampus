// Unit tests for resolveRound with several players: per-slot commands, missing = timeout, flee ends for all, queued leave.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, BattleBehavior, BattleResult } from '@mc/shared';
import type { Fighter, PlayerCommand } from './battle.types';
import { resolveRound } from './round';

const mk = (slot: number, side: Fighter['side'], o: Partial<Fighter> = {}): Fighter => ({
  slot, side, kind: side === 'player' ? 'character' : 'creature', refId: slot, name: `f${slot}`, level: 5,
  hp: 100, hpMax: 100, mp: 0, mpMax: 0, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive: true, expBase: -1,
  attack: 20, magicAttack: 0, defense: 0, magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 150, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0, ...o,
});
const board = (...fs: Fighter[]): Map<number, Fighter> => new Map(fs.map((f) => [f.slot, f]));
const attack = (target: number): PlayerCommand => ({ action: BattleAction.ATTACK, targetSlot: target });
const half = (): number => 0.5;

describe('resolveRound with several players', () => {
  it('each player acts with its own command', () => {
    const a = mk(10, 'player', { attack: 5000, speed: 300 });
    const b = mk(11, 'player', { attack: 5000, speed: 200 });
    const e1 = mk(0, 'enemy', { hp: 10, hpMax: 10, speed: 1 });
    const e2 = mk(2, 'enemy', { hp: 10, hpMax: 10, speed: 1 });
    const out = resolveRound(board(a, b, e1, e2), new Map([[10, attack(0)], [11, attack(2)]]), 1, half);
    assert.equal(out.ended, true);
    assert.equal(out.result, BattleResult.WIN);
    assert.equal(e1.alive, false);
    assert.equal(e2.alive, false);
  });

  it('a missing command counts as a timeout (the player only stands)', () => {
    const a = mk(10, 'player', { speed: 300 });
    const b = mk(11, 'player', { speed: 200 });
    const e = mk(0, 'enemy', { hp: 1000, hpMax: 1000, speed: 1, attack: 0 });
    const out = resolveRound(board(a, b, e), new Map([[10, attack(0)]]), 1, half);
    assert.equal(e.hp < 1000, true); // only a struck
    const stands = out.groups.flat().filter((s) => s.sid === 11 && s.bid === BattleBehavior.STAND);
    assert.equal(stands.length > 0, true);
  });

  it('defend only protects the player that chose it', () => {
    const run = (cmd11: PlayerCommand): number => {
      const a = mk(10, 'player');
      const b = mk(11, 'player', { defense: 0 });
      const e = mk(0, 'enemy', { attack: 100, hit: 1000 });
      // rng 0.9 -> the enemy picks the second living player (slot 11)
      resolveRound(board(a, b, e), new Map([[10, attack(0)], [11, cmd11]]), 1, () => 0.9);
      return b.hp;
    };
    assert.equal(run({ action: BattleAction.DEFENCE, targetSlot: -1 }) > run({ action: BattleAction.TIMEOUT, targetSlot: -1 }), true);
  });

  it('a flee by any member ends the battle for everyone', () => {
    const a = mk(10, 'player', { speed: 300 });
    const b = mk(11, 'player', { speed: 200 });
    const e = mk(0, 'enemy', { hp: 1000, hpMax: 1000 });
    const out = resolveRound(board(a, b, e), new Map([[10, attack(0)], [11, { action: BattleAction.ESCAPE, targetSlot: -1 }]]), 1, half);
    assert.equal(out.ended, true);
    assert.equal(out.result, BattleResult.FLED);
    assert.equal(a.alive && b.alive, true);
  });

  it('a queued leave drops the member out without ending the battle', () => {
    const a = mk(10, 'player', { speed: 300 });
    const b = mk(11, 'player', { speed: 200 });
    const e = mk(0, 'enemy', { hp: 1000, hpMax: 1000, attack: 0 });
    const out = resolveRound(board(a, b, e), new Map([[10, attack(0)], [11, { action: BattleAction.ESCAPE, targetSlot: -1, leave: true }]]), 1, half);
    assert.equal(out.ended, false);
    assert.equal(b.alive, false);
    assert.equal(b.hp, 0);
    assert.equal(a.alive, true);
  });

  it('the last alive player leaving loses the battle for the dead ones left behind', () => {
    const a = mk(10, 'player', { speed: 300, alive: false, hp: 0 });
    const b = mk(11, 'player', { speed: 200 });
    const e = mk(0, 'enemy', { hp: 1000, hpMax: 1000, attack: 0 });
    const out = resolveRound(board(a, b, e), new Map([[11, { action: BattleAction.ESCAPE, targetSlot: -1, leave: true }]]), 1, half);
    assert.equal(out.ended, true);
    assert.equal(out.result, BattleResult.LOSE);
  });
});
