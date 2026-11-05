// Unit tests for battle buffs / statuses: apply + replace + expire + revert, land chance and control resist, skip-turn,
// sleep wake, DOT kill at turn start (die step with buffClear), HOT from the next round.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleBehavior } from '@mc/shared';
import type { StrikeCtx } from '../strike';
import { addStatus, applyBuff, expireBuffs, landChance, tickStatuses, wakeOnHit } from './battle-buffs';
import type { BuffDef } from './npc-skills';
import { board, mk } from './test-kit';
import { roundStartExpiry, turnStart } from './turn-start';

const def = (o: Partial<BuffDef>): BuffDef => ({ id: 50, icon: '1', rounds: 2, mods: [], ...o });
const ctxOf = (...fs: ReturnType<typeof mk>[]): StrikeCtx => ({ fighters: board(...fs), rng: () => 0.5, defending: new Set(), groups: [] });

describe('table buffs', () => {
  it('percent mods scale the pre-buff value, flat-point props add their value; the same id replaces', () => {
    const caster = mk(0, 'enemy');
    const t = mk(10, 'player', { attack: 200, combo: 10 });
    const d = def({ mods: [{ prop: 4, value: 20, percent: true }, { prop: 12, value: 15, percent: true }] });
    applyBuff(caster, t, d, 1);
    assert.deepEqual([t.attack, t.combo], [240, 25]);
    applyBuff(caster, t, d, 1);
    assert.deepEqual([t.attack, t.combo], [240, 25]);
    assert.equal(t.buffs?.length, 1);
  });
  it('applied in round N with R rounds: active through N + R, reverted at the start of N + R + 1', () => {
    const t = mk(10, 'player', { defense: 100 });
    applyBuff(mk(0, 'enemy'), t, def({ rounds: 2, mods: [{ prop: 6, value: -50, percent: false }] }), 1);
    assert.equal(t.defense, 50);
    assert.deepEqual(expireBuffs(t, 3), []);
    assert.deepEqual(expireBuffs(t, 4), [50]);
    assert.equal(t.defense, 100);
  });
  it('max HP buffs clamp HP back on expiry; immunity props set the flags', () => {
    const t = mk(10, 'player', { hp: 1000, hpMax: 1000 });
    applyBuff(t, t, def({ rounds: 1, mods: [{ prop: 1, value: 500, percent: false }, { prop: 908, value: 1, percent: true }] }), 1);
    t.hp = 1500;
    assert.equal(t.immunePhys, 1);
    expireBuffs(t, 3);
    assert.deepEqual([t.hp, t.hpMax, t.immunePhys], [1000, 1000, 0]);
  });
});

describe('statuses', () => {
  it('a stun landing in round 1 blocks the turns of rounds 1 and 2 (duration 1), its icon drops in round 2', () => {
    const t = mk(10, 'player');
    assert.equal(addStatus(t, { type: 10, duration: 1, buffId: 14, appliedRound: 1, sourceSlot: 0 }, 'enemy'), true);
    assert.deepEqual(tickStatuses(t, 1), { canAct: false, expired: [] });
    assert.deepEqual(tickStatuses(t, 2), { canAct: false, expired: [14] });
    assert.deepEqual(tickStatuses(t, 3), { canAct: true, expired: [] });
  });
  it('control-immune NPCs refuse hostile control; own-side statuses still land', () => {
    const boss = mk(0, 'enemy', { npc: { controlImmune: true } });
    assert.equal(addStatus(boss, { type: 10, duration: 1, buffId: 1, appliedRound: 1, sourceSlot: 10 }, 'player'), false);
    assert.equal(addStatus(boss, { type: 10, duration: 1, buffId: 1, appliedRound: 1, sourceSlot: 1 }, 'enemy'), true);
  });
  it('a landed hit wakes a sleeping unit', () => {
    const t = mk(10, 'player');
    addStatus(t, { type: 30, duration: 2, buffId: 16, appliedRound: 1, sourceSlot: 0 }, 'enemy');
    assert.deepEqual(wakeOnHit(t), [16]);
    assert.equal(t.statuses?.length, 0);
  });
});

describe('landChance', () => {
  const stun = def({ status: 10 });
  it('allies and beneficial buffs keep buff_rate; hostile ones add accuracy minus resist', () => {
    const a = mk(0, 'enemy', { debuffHit: [10, 20, 0, 0, 0, 0, 0] });
    assert.equal(landChance(a, mk(1, 'enemy'), stun, 0.3), 0.3);
    assert.equal(landChance(a, mk(10, 'player'), def({ mods: [{ prop: 4, value: 10, percent: false }] }), 0.3), 0.3);
    assert.ok(Math.abs(landChance(a, mk(10, 'player', { debuffResist: [5, 0, 0, 0, 0, 0, 0] }), stun, 0.3) - 0.55) < 1e-9);
  });
  it('boss rows take hard control at (accuracy − 150) / 100; immune NPCs at 0', () => {
    const p = mk(10, 'player', { debuffHit: [100, 100, 0, 0, 0, 0, 0] });
    assert.equal(landChance(p, mk(0, 'enemy', { bossFlag: 1 }), stun, 1), 0.5);
    assert.equal(landChance(p, mk(0, 'enemy', { npc: { controlImmune: true } }), stun, 1), 0);
    assert.equal(landChance(p, mk(0, 'enemy', { npc: { debuffImmune: true } }), def({ mods: [{ prop: 6, value: -5, percent: false }] }), 1), 0);
    assert.equal(landChance(p, mk(0, 'enemy', { npc: { controlResist: 70 } }), stun, 0), 1);
  });
});

describe('turn start', () => {
  it('a DOT kill plays a self hurt then the die step with buffClear', () => {
    const caster = mk(0, 'enemy', { magicAttack: 500 });
    const t = mk(10, 'player', { hp: 100 });
    applyBuff(caster, t, def({ dot: { kind: 'magic', value: 0.5 } }), 1);
    const ctx = ctxOf(caster, t);
    assert.deepEqual(turnStart(ctx, t, 2), { canAct: false, died: true });
    assert.deepEqual(ctx.groups[0][0], { sid: 10, tid: -1, bid: BattleBehavior.HURT, delay: 100, sSObj: { hHp: 0 } });
    assert.deepEqual(ctx.groups[1][0].sSObj, { buffClear: 1 });
    assert.equal(ctx.groups[1][0].bid, BattleBehavior.DEAD);
  });
  it('HOT ticks from the round after it landed; expiry sends buffDel at round start', () => {
    const t = mk(10, 'player', { hp: 500 });
    applyBuff(t, t, def({ rounds: 1, hot: { kind: 'flat', value: 100 } }), 1);
    const ctx = ctxOf(t);
    turnStart(ctx, t, 1);
    assert.equal(ctx.groups.length, 0);
    turnStart(ctx, t, 2);
    assert.deepEqual(ctx.groups[0][0].sSObj, { rHp: 600 });
    roundStartExpiry(ctx, 3);
    assert.deepEqual(ctx.groups[1][0].sSObj, { buffDel: [50] });
  });
});
