// Unit tests for the pure command helpers: AUTO's random living enemy pick and the wire command parse.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction } from '@mc/shared';
import type { Fighter } from './battle.types';
import { parseCommands, randomEnemy } from './battle-command.service';

const f = (slot: number, side: Fighter['side'], alive = true): Fighter => ({
  slot, side, kind: side === 'player' ? 'character' : 'creature', refId: slot, name: `f${slot}`, level: 5,
  hp: alive ? 100 : 0, hpMax: 100, mp: 0, mpMax: 0, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive, expBase: -1,
  attack: 20, magicAttack: 0, defense: 0, magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 150, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0,
});

describe('randomEnemy', () => {
  const me = f(10, 'player');
  const fighters = new Map([me, f(15, 'player'), f(0, 'enemy', false), f(1, 'enemy'), f(2, 'enemy')].map((x) => [x.slot, x]));
  it('picks only living fighters of the other side', () => {
    assert.equal(randomEnemy({ fighters }, me, () => 0)?.slot, 1);
    assert.equal(randomEnemy({ fighters }, me, () => 0.99)?.slot, 2);
  });
  it('none left -> undefined', () => {
    const solo = new Map([[10, me], [0, f(0, 'enemy', false)]]);
    assert.equal(randomEnemy({ fighters: solo }, me), undefined);
  });
});

describe('parseCommands', () => {
  it('reads AUTO for owner and pet', () => {
    const out = parseCommands([{ tid: -1, action: BattleAction.AUTO }, { action: BattleAction.AUTO }]);
    assert.equal(out.own.action, BattleAction.AUTO);
    assert.equal(out.pet?.action, BattleAction.AUTO);
  });
});
