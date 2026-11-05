// Strike sequences (M10 E2.-1): basic-attack combo chain with retarget, counter chain cap, Miễn Tử and miss texts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BattleBehavior } from '@mc/shared';
import type { Fighter } from './battle.types';
import { BASIC_ATTACK } from './damage';
import { meleeAttack, RESIST_TEXT, type StrikeCtx } from './strike';

const mk = (slot: number, side: Fighter['side'], o: Partial<Fighter> = {}): Fighter => ({
  slot, side, kind: side === 'player' ? 'character' : 'creature', refId: slot, name: `f${slot}`, level: 5,
  hp: 100, hpMax: 100, mp: 0, mpMax: 0, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive: true, expBase: -1,
  attack: 20, magicAttack: 0, defense: 0, magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 200, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0, ...o,
});
const ctxOf = (...fs: Fighter[]): StrikeCtx => ({ fighters: new Map(fs.map((f) => [f.slot, f])), rng: () => 0.5, defending: new Set(), groups: [] });
const attacks = (ctx: StrikeCtx, sid: number): number =>
  ctx.groups.flat().filter((s) => s.sid === sid && s.bid === BattleBehavior.ATTACK).length;

test('combo 100 chains 10 extra hits and moves on to the next living enemy', () => {
  const p = mk(10, 'player', { combo: 100, attack: 1000 });
  const e1 = mk(0, 'enemy', { hp: 50 });
  const e2 = mk(2, 'enemy', { hp: 100000, hpMax: 100000 });
  const ctx = ctxOf(p, e1, e2);
  meleeAttack(ctx, p, e1, BASIC_ATTACK);
  assert.equal(e1.alive, false);
  assert.equal(attacks(ctx, 10), 11);
  assert.ok(e2.hp < 100000);
});

test('counters alternate up to five times per exchange', () => {
  const p = mk(10, 'player', { counter: 100, hp: 1e6, hpMax: 1e6 });
  const e = mk(0, 'enemy', { counter: 100, hp: 1e6, hpMax: 1e6 });
  const ctx = ctxOf(p, e);
  meleeAttack(ctx, p, e, BASIC_ATTACK);
  assert.equal(attacks(ctx, 0) + attacks(ctx, 10), 1 + 5); // the main hit + 5 counters (e, p, e, p, e)
});

test('a Miễn Giảm 100 % target shows "Kháng cự" and can still counter', () => {
  const p = mk(10, 'player', { hp: 1e6, hpMax: 1e6 });
  const e = mk(0, 'enemy', { reduceHurt1: 100, counter: 100 });
  const ctx = ctxOf(p, e);
  meleeAttack(ctx, p, e, BASIC_ATTACK);
  assert.equal(ctx.groups.flat().find((s) => s.sid === 10)?.bid, BattleBehavior.TURNTO);
  assert.ok(ctx.groups.flat().some((s) => s.tSObj?.status === RESIST_TEXT));
  assert.ok(attacks(ctx, 0) >= 1);
});

test('Miễn Tử leaves the target at 1 HP with tSObj.reborn', () => {
  const p = mk(10, 'player', { attack: 1e6 });
  const e = mk(0, 'enemy', { rebornRate: 100 });
  const ctx = ctxOf(p, e);
  meleeAttack(ctx, p, e, BASIC_ATTACK);
  assert.equal(e.hp, 1);
  assert.ok(ctx.groups.flat().some((s) => s.tSObj?.reborn === 1));
});
