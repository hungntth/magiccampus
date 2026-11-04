// Unit tests for the catch action (-70) in a round: the step layout of success (die 10160, caught mark, counts as killed and
// wins the battle) and failure (catchF with cid / rate / selfCatch), the rate 0 gates, the injectable roll, and that a caught
// creature stays in the settle's dead list. The pet capacity / catchable template facts are baked into the command.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, BattleBehavior, BattleResult, type BattleStep } from '@mc/shared';
import type { Fighter, PlayerCommand } from './battle.types';
import { resolveRound } from './round';

const mk = (slot: number, side: Fighter['side'], o: Partial<Fighter> = {}): Fighter => ({
  slot, side, kind: side === 'player' ? 'character' : 'creature', refId: slot, name: `f${slot}`, level: 5, hp: 100, hpMax: 100,
  mp: 0, mpMax: 0, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive: true, expBase: -1, attack: 0, magicAttack: 0, defense: 0,
  magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 150, speed: 100, combo: 0, counter: 0, resiCritical: 0, resiDefy: 0,
  praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0, enhPhyHurt: 0, enhMagicHurt: 0, ...o,
});
const board = (...fs: Fighter[]): Map<number, Fighter> => new Map(fs.map((f) => [f.slot, f]));
const flat = (groups: BattleStep[][]): BattleStep[] => groups.flat();
const catchCmd = (target: number, over: { catchable?: number; room?: number } = {}): PlayerCommand => ({
  action: BattleAction.CATCH, targetSlot: target, catch: { catchable: 1, room: 1, ...over },
});
// Owner Lv1 (cid 19) vs Lv3 creature at full HP: rate 16 %; at 20 % HP: 68 %.
const owner = (): Fighter => mk(10, 'player', { refId: 19, level: 1 });
const nut = (hp = 100): Fighter => mk(0, 'enemy', { refId: 56, level: 3, hp, hpMax: 100 });

describe('catch round', () => {
  it('success: the target dies with behaviour 10160, is marked caught and the battle is won', () => {
    const fs = board(owner(), nut(20));
    const out = resolveRound(fs, catchCmd(0), 1, () => 0.5); // roll 50 < 68
    const steps = flat(out.groups);
    assert.ok(steps.some((s) => s.sid === 0 && s.bid === BattleBehavior.CATCHED));
    assert.ok(!steps.some((s) => s.sSObj?.catchF));
    assert.deepEqual([fs.get(0)!.alive, fs.get(0)!.hp, fs.get(0)!.caughtBy], [false, 0, 10]);
    assert.deepEqual([out.ended, out.result], [true, BattleResult.WIN]);
  });

  it('failure: a cast step carries catchF {cid, rate, selfCatch} and nothing dies', () => {
    const fs = board(owner(), nut(100), mk(2, 'enemy'));
    const out = resolveRound(fs, catchCmd(0), 1, () => 0.5); // roll 50 >= 16
    const f = flat(out.groups).find((s) => s.sSObj?.catchF);
    assert.deepEqual(f?.sSObj?.catchF, { cid: 19, rate: 16, selfCatch: 1 });
    assert.equal(f?.sid, 10);
    assert.equal(fs.get(0)!.alive, true);
    assert.equal(fs.get(0)!.caughtBy, undefined);
  });

  it('the roll is rand(100) < rate with the injected RNG', () => {
    const run = (r: number): boolean => {
      const fs = board(owner(), nut(100), mk(2, 'enemy'));
      resolveRound(fs, catchCmd(0), 1, () => r);
      return fs.get(0)!.caughtBy === 10;
    };
    assert.equal(run(0.15), true); // 15 < 16
    assert.equal(run(0.16), false); // 16 < 16 is false
  });

  it('gates fail with rate 0: not catchable == 1, creature 6+ levels above, no room', () => {
    const rateOf = (cmd: PlayerCommand, creatureLevel = 3): number | undefined => {
      const fs = board(owner(), mk(0, 'enemy', { refId: 56, level: creatureLevel }), mk(2, 'enemy'));
      return flat(resolveRound(fs, cmd, 1, () => 0.99).groups).find((s) => s.sSObj?.catchF)?.sSObj?.catchF?.rate;
    };
    assert.equal(rateOf(catchCmd(0, { catchable: 0 })), 0);
    assert.equal(rateOf(catchCmd(0, { catchable: 2 })), 0);
    assert.equal(rateOf(catchCmd(0, { room: 0 })), 0);
    assert.equal(rateOf(catchCmd(0), 7), 0);
    assert.equal(rateOf(catchCmd(0), 6), 10); // owner 1 + 5: allowed, 20 - 2*5
  });

  it('a caught creature counts as dead for the settle list and gets no more turns', () => {
    const fs = board(owner(), nut(20), mk(2, 'enemy', { attack: 50, speed: 1 }));
    resolveRound(fs, catchCmd(0), 1, () => 0.5);
    const dead = [...fs.values()].filter((f) => f.side === 'enemy' && !f.alive);
    assert.deepEqual(dead.map((f) => f.refId), [56]);
  });

  it('a target that died before the catcher\'s turn is a cast at nothing', () => {
    const fs = board(owner(), nut(100), mk(2, 'enemy'));
    fs.get(0)!.alive = false;
    const out = resolveRound(fs, catchCmd(0), 1, () => 0);
    assert.equal(flat(out.groups).some((s) => s.sSObj?.catchF || s.bid === BattleBehavior.CATCHED), false);
    assert.equal(fs.get(0)!.caughtBy, undefined);
  });
});
