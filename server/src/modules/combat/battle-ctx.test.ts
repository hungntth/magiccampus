// M10 phase A battle context: per-battle round cap (PvE has none by default, Go) and the boss-centre line-up order.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BattleAction, BattleResult } from '@mc/shared';
import type { Fighter } from './battle.types';
import { lineupLevel, orderLineup } from './npc-battle';
import { resolveRound } from './round';

const mk = (slot: number, side: Fighter['side']): Fighter => ({
  slot, side, kind: side === 'player' ? 'character' : 'creature', refId: slot, name: `f${slot}`, level: 5,
  hp: 1000, hpMax: 1000, mp: 0, mpMax: 0, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive: true, expBase: -1,
  attack: 1, magicAttack: 0, defense: 0, magicDefense: 0, hit: 0, dodge: 100, critical: 0, criticalDmg: 150, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0,
});
const board = (): Map<number, Fighter> => new Map([mk(10, 'player'), mk(0, 'enemy')].map((f) => [f.slot, f]));
const defend = { action: BattleAction.DEFENCE, targetSlot: -1 };

test('PvE without a cap goes on past round 30', () => {
  assert.equal(resolveRound(board(), defend, 200, () => 0.5).ended, false);
});

test('a ctx round cap ends an undecided PvE battle as a loss', () => {
  assert.equal(resolveRound(board(), defend, 149, () => 0.5, 150).ended, false);
  const out = resolveRound(board(), defend, 150, () => 0.5, 150);
  assert.equal(out.ended, true);
  assert.equal(out.result, BattleResult.LOSE);
});

test('boss rows lead the line-up; level falls back to the dungeon level', () => {
  const rows = [{ id: 1, bossFlag: 0 }, { id: 2, bossFlag: 1 }, { id: 3, bossFlag: 0 }];
  assert.deepEqual(orderLineup(rows).map((r) => r.id), [2, 1, 3]);
  assert.equal(lineupLevel(0, 0, 60), 60);
  assert.equal(lineupLevel(0, 0), 10);
  assert.equal(lineupLevel(0, 35, 60), 35);
});
