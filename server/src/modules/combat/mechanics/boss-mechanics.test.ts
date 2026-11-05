// Unit tests for E2.2-E2.10: summons (due windows, slots, refill, step shape), revives and death rules, Hydra split,
// death marks, Ngày Diệt Vong and the boss-row / minion / elite floors.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleBehavior as B } from '@mc/shared';
import type { PlayerCommand } from '../battle.types';
import { resolveRound } from '../round';
import { bossDefenseFloor, eliteKit, minionStatFloor } from './boss-floors';
import { DEATH_MARK, markHit } from './death-mark';
import { doomsdaySteps } from './doomsday';
import { guardedRevive, roundRevives, twinRevive } from './revive';
import { splitRegen } from './split';
import { executeSummon, summonDue, summonSlots, type SummonPlan } from './summon';
import { board, env, mk, seq } from './test-kit';

const plan = (o: Partial<SummonPlan>): SummonPlan => ({ startRound: 1, perRound: 1, every: 1, refill: false, split: 0, pending: [], ...o });
const unit = (id: number) => mk(-1, 'enemy', { refId: id, hp: 0, hpMax: 500 });
const none = new Map<number, PlayerCommand>();

describe('summons', () => {
  it('due from StartRound every Every rounds while units are pending', () => {
    const p = plan({ startRound: 3, every: 2, pending: [unit(1)] });
    assert.deepEqual([1, 2, 3, 4, 5].map((r) => summonDue(p, r)), [false, false, true, false, true]);
    assert.equal(summonDue(plan({ pending: [] }), 1), false);
    assert.equal(summonDue(plan({ perRound: 0, pending: [unit(1)] }), 1), false);
  });
  it('free slots in battle-start order, refill adds dead non-caster slots', () => {
    const caster = mk(0, 'enemy');
    const b = board(caster, mk(2, 'enemy', { alive: false }), mk(10, 'player'));
    assert.deepEqual(summonSlots(b, caster, false).slice(0, 3), [1, 4, 3]);
    assert.deepEqual(summonSlots(b, caster, true).slice(-1), [2]);
  });
  it('places at most PerRound units at full HP; refill replaces the corpse; steps 16000 → 18000… → 10100', () => {
    const caster = mk(0, 'enemy', { summon: plan({ perRound: 2, refill: true, pending: [unit(7), unit(8), unit(9)] }) });
    const corpse = mk(2, 'enemy', { alive: false });
    const fs = board(caster, corpse, mk(1, 'enemy'), mk(4, 'enemy'), mk(3, 'enemy'), ...[5, 6, 7, 8, 9].map((s) => mk(s, 'enemy')), mk(10, 'player'));
    const groups: Parameters<typeof executeSummon>[2] = [];
    const removed: ReturnType<typeof mk>[] = [];
    assert.equal(executeSummon(fs, caster, groups, removed), true);
    assert.equal(fs.get(2)?.refId, 7);
    assert.deepEqual([fs.get(2)?.hp, removed], [500, [corpse]]);
    assert.equal(caster.summon?.pending.length, 2);
    assert.deepEqual(groups.map((g) => g.map((s) => s.bid)), [[B.SUMMON], [B.SUMMONED], [B.TURNBACK]]);
    assert.equal(groups[0][0].type, 2);
    assert.deepEqual(groups[0][0].creList?.map((p) => p.battleId), [2]);
  });
  it('in a round the summon costs the caster its turn; the unit cannot summon', () => {
    const caster = mk(0, 'enemy', { speed: 999, summon: plan({ pending: [unit(7)] }) });
    const fs = board(caster, mk(10, 'player'));
    const out = resolveRound(fs, none, 1, seq([]), undefined, env({}));
    assert.ok(out.groups.flat().some((s) => s.bid === B.SUMMON));
    assert.equal(out.groups.flat().some((s) => s.sid === 0 && s.bid === B.ATTACK), false);
    assert.equal(fs.get(2)?.summon, undefined);
  });
});

describe('revives and death rules', () => {
  it('Atula: dead enemies with revives left return at round start while any enemy lives', () => {
    const a = mk(0, 'enemy', { alive: false, hp: 0, roundRevives: 1 });
    const fs = board(a, mk(2, 'enemy'));
    assert.deepEqual(roundRevives(fs, 1), []);
    const steps = roundRevives(fs, 2);
    assert.deepEqual(steps.map((g) => g[0].bid), [B.STAND, B.RELIVE]);
    assert.deepEqual(steps[0][0].sSObj, { reborn: 1000, buffClear: 1 });
    assert.deepEqual([a.alive, a.roundRevives], [true, 0]);
    a.alive = false;
    assert.deepEqual(roundRevives(fs, 3), []);
  });
  it('all must die in one round: no revive when every enemy is dead', () => {
    const fs = board(mk(0, 'enemy', { alive: false, roundRevives: 5 }), mk(2, 'enemy', { alive: false, roundRevives: 5 }));
    assert.deepEqual(roundRevives(fs, 2), []);
  });
  it('guarded revive: once while a guide lives, never after the guides', () => {
    const rule = guardedRevive(1846, [1840]);
    const boss = mk(0, 'enemy', { refId: 1846, alive: false });
    const guide = mk(2, 'enemy', { refId: 1840 });
    assert.deepEqual(rule.revivals(board(boss, guide), 1), [boss]);
    assert.deepEqual(rule.revivals(board(boss, guide), 2), []);
    const rule2 = guardedRevive(1846, [1840]);
    guide.alive = false;
    assert.deepEqual(rule2.revivals(board(boss, guide), 1), []);
  });
  it('twins: a dead twin returns 2 rounds after its death while the other lives', () => {
    const rule = twinRevive(1821, 1822, 2);
    const a = mk(0, 'enemy', { refId: 1821, alive: false });
    const b = mk(2, 'enemy', { refId: 1822 });
    const fs = board(a, b);
    assert.deepEqual(rule.revivals(fs, 3), []);
    assert.deepEqual(rule.revivals(fs, 4), []);
    assert.deepEqual(rule.revivals(fs, 5), [a]);
  });
  it('a death rule revive keeps the battle going (no victory)', () => {
    const p = mk(10, 'player', { speed: 999, attack: 100000 });
    const boss = mk(0, 'enemy', { refId: 1846, hp: 10 });
    const out = resolveRound(board(p, boss, mk(2, 'enemy', { refId: 1840, speed: 1 })), new Map([[10, { action: -10, targetSlot: 0 }]]), 1, seq([0.9]), undefined, env({}), guardedRevive(1846, [1840]));
    assert.equal(out.ended, false);
    assert.equal(boss.alive, true);
    assert.ok(out.groups.flat().some((s) => s.sid === 0 && s.bid === B.RELIVE));
  });
});

describe('Hydra split', () => {
  it('a dead host revives; each dead clone leaves and 3 come from the pool; pool exhaustion stops it', () => {
    const host = mk(0, 'enemy', { refId: 1300, alive: false, hp: 0, summon: plan({ perRound: 0, split: 3, pending: [unit(1301), unit(1301), unit(1301), unit(1301)] }) });
    const clone = mk(2, 'enemy', { refId: 1301, alive: false, hp: 0 });
    const fs = board(host, clone, mk(1, 'enemy', { refId: 1301 }), mk(10, 'player'));
    const removed: ReturnType<typeof mk>[] = [];
    const steps = splitRegen(fs, host, removed);
    assert.equal(host.alive, true);
    assert.deepEqual(removed, [clone]);
    assert.equal([...fs.values()].filter((f) => f.refId === 1301 && f.alive).length, 4);
    assert.ok(steps.some((g) => g[0].bid === B.SUMMON));
    assert.equal(host.summon?.pending.length, 1);
  });
  it('host and every clone dead in one round: no regeneration', () => {
    const host = mk(0, 'enemy', { refId: 1300, alive: false, summon: plan({ perRound: 0, split: 3, pending: [unit(1301)] }) });
    assert.deepEqual(splitRegen(board(host, mk(2, 'enemy', { refId: 1301, alive: false })), host, []), []);
  });
});

describe('death marks', () => {
  it('4 stacks from either brother, then the doom at the next turn start', () => {
    const t = mk(10, 'player');
    const m1 = mk(0, 'enemy', { refId: 1304 });
    const m2 = mk(2, 'enemy', { refId: 1303 });
    for (const m of [m1, m2, m1, m2]) assert.equal(markHit(m, t)?.buffAdd?.id, DEATH_MARK.BUFF_ID);
    assert.equal(markHit(m1, t), null);
    const out = resolveRound(board(t, mk(1, 'enemy', { speed: 1 })), none, 1, seq([]), undefined, env({}));
    const doom = out.groups.flat().find((s) => s.sid === 10 && s.bid === B.HURT);
    assert.deepEqual(doom?.sSObj, { hHp: 0, buffDel: [3038] });
    assert.equal(t.alive, false);
    assert.equal(markHit(mk(4, 'enemy'), mk(11, 'player')), null);
  });
});

describe('doomsday', () => {
  it('round 6: every living opponent loses all HP before anyone acts, once', () => {
    const boss = mk(0, 'enemy', { doomsday: { round: 6, skillId: 5935 } });
    const fs = board(boss, mk(10, 'player'), mk(11, 'player'));
    assert.deepEqual(doomsdaySteps(fs, 5, () => 'x'), []);
    const steps = doomsdaySteps(fs, 6, () => undefined);
    assert.equal(steps[0][0].sSObj?.skill, 'Ngày Diệt Vong');
    assert.deepEqual(steps[1].map((s) => s.sSObj), [{ hHp: 0, cri: 1 }, { hHp: 0, cri: 1 }]);
    assert.equal([...fs.values()].filter((f) => f.side === 'player' && f.alive).length, 0);
    assert.deepEqual(doomsdaySteps(board(boss, mk(12, 'player')), 7, () => 'x'), []);
  });
});

describe('boss floors and kits', () => {
  it('boss rows rise to 30 / 30 / 100 (map bosses 30 / 15 / 50), minions untouched', () => {
    const boss = mk(0, 'enemy', { bossFlag: 1, resiCritical: 150 });
    bossDefenseFloor(boss);
    assert.deepEqual([boss.praDef, boss.praMagDef, boss.resiDefy, boss.resiCritical], [30, 30, 30, 150]);
    const map = mk(0, 'enemy', { bossFlag: 1 });
    bossDefenseFloor(map, true);
    assert.deepEqual([map.resiDefy, map.resiCritical], [15, 50]);
    const minion = mk(2, 'enemy');
    bossDefenseFloor(minion);
    assert.equal(minion.praDef, 0);
  });
  it('minions rise to 60 % of the boss per stat; the elite kit sets combo 99 / counter 100 / × 3 rolls', () => {
    const boss = mk(0, 'enemy', { bossFlag: 1, hpMax: 10000, attack: 1000 });
    const minion = mk(2, 'enemy', { hpMax: 100, attack: 900 });
    minionStatFloor([boss, minion]);
    assert.deepEqual([minion.hpMax, minion.hp, minion.attack, minion.npc?.controlResist], [6000, 6000, 900, 70]);
    eliteKit(boss);
    assert.deepEqual([boss.combo, boss.counter, boss.npc?.chanceScale, boss.debuffResist?.[1]], [99, 100, 3, 10000]);
  });
});
