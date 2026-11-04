// Tests for PvP: the two-sided board and slots, round readiness for two player sides, player-vs-player round targeting, the result
// from each viewer's side, the settle vitals (no rewards, 1 HP loser) and who loses on a disconnect.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, BattleBehavior, BattleResult, PK_SLOTS } from '@mc/shared';
import type { Fighter, PlayerCommand } from './battle.types';
import { applyPvpVitals, endStepFor, leaveResult, loserSide, pvpBoard, viewResult } from './pvp-rules';
import { missingCommands } from './roster';
import { resolveRound } from './round';

const mk = (slot: number, o: Partial<Fighter> = {}): Fighter => ({
  slot, side: 'player', kind: 'character', refId: slot, name: `f${slot}`, level: 5,
  hp: 100, hpMax: 100, mp: 0, mpMax: 0, sp: 0, spMax: 0, resCode: '0', bossFlag: 0, alive: true, expBase: -1,
  attack: 20, magicAttack: 0, defense: 0, magicDefense: 0, hit: 100, dodge: 0, critical: 0, criticalDmg: 150, speed: 100,
  combo: 0, counter: 0, resiCritical: 0, resiDefy: 0, praDef: 0, praMagDef: 0, reduceHurt1: 0, reduceHurt2: 0,
  enhPhyHurt: 0, enhMagicHurt: 0, ...o,
});
const pet = (owner: number, o: Partial<Fighter> = {}): Fighter => mk(owner + 5, { kind: 'pet', ownerCid: owner, ...o });
const half = (): number => 0.5;
const attack = (t: number): PlayerCommand => ({ action: BattleAction.ATTACK, targetSlot: t });

describe('pvpBoard', () => {
  it('attacker at 10 (pet 15) on the player side, target at 0 (pet 5) on the enemy side', () => {
    const b = pvpBoard(mk(1), pet(1), mk(2), pet(2));
    assert.deepEqual([...b.keys()].sort((x, y) => x - y), [PK_SLOTS.target, PK_SLOTS.targetPet, PK_SLOTS.attacker, PK_SLOTS.attackerPet]);
    assert.equal(b.get(10)?.side, 'player');
    assert.equal(b.get(15)?.side, 'player');
    assert.equal(b.get(0)?.side, 'enemy');
    assert.equal(b.get(5)?.side, 'enemy');
    assert.equal(b.get(0)?.refId, 2);
    assert.equal(b.get(0)?.kind, 'character');
  });
  it('pets are optional and the inputs are not mutated', () => {
    const a = mk(1);
    const t = mk(2);
    const b = pvpBoard(a, undefined, t, undefined);
    assert.equal(b.size, 2);
    assert.equal(a.slot, 1);
    assert.equal(t.side, 'player');
  });
});

describe('round readiness with two player sides', () => {
  const board = pvpBoard(mk(1), pet(1), mk(2), pet(2));
  it('waits for both alive characters (pets never block)', () => {
    assert.deepEqual(missingCommands(board.values(), new Set(), new Set()).sort((x, y) => x - y), [0, 10]);
    assert.deepEqual(missingCommands(board.values(), new Set([10]), new Set()), [0]);
    assert.deepEqual(missingCommands(board.values(), new Set([10, 0]), new Set()), []);
  });
  it('a dead or departed character owes nothing', () => {
    board.get(0)!.alive = false;
    assert.deepEqual(missingCommands(board.values(), new Set(), new Set()), [10]);
    board.get(0)!.alive = true;
    assert.deepEqual(missingCommands(board.values(), new Set([10]), new Set([0])), []);
  });
});

describe('PvP round', () => {
  it('both players act on their own command; the enemy side is not run by AI', () => {
    const fighters = pvpBoard(mk(1), undefined, mk(2), undefined);
    const out = resolveRound(fighters, new Map([[10, attack(0)], [0, attack(10)]]), 1, half);
    const attacks = out.groups.flat().filter((s) => s.bid === BattleBehavior.ATTACK);
    assert.deepEqual(attacks.map((s) => s.sid).sort((x, y) => x - y), [0, 10]);
    assert.ok(fighters.get(10)!.hp < 100);
    assert.ok(fighters.get(0)!.hp < 100);
    assert.equal(out.ended, false);
  });
  it('a missing command is a timeout: the idle target only takes damage', () => {
    const fighters = pvpBoard(mk(1), undefined, mk(2), undefined);
    const out = resolveRound(fighters, new Map([[10, attack(0)]]), 1, half);
    assert.equal(fighters.get(10)!.hp, 100);
    assert.ok(fighters.get(0)!.hp < 100);
    assert.equal(out.ended, false);
  });
  it('killing the target (and its pet) wins for the attacker', () => {
    const fighters = pvpBoard(mk(1, { attack: 9000, speed: 200 }), undefined, mk(2), undefined);
    const out = resolveRound(fighters, new Map([[10, attack(0)], [0, attack(10)]]), 1, half);
    assert.equal(out.ended, true);
    assert.equal(out.result, BattleResult.WIN);
    assert.equal(fighters.get(0)!.alive, false);
    assert.equal(fighters.get(10)!.hp, 100); // the dead target never acted
  });
  it('the target winning is a LOSE from the attacker view', () => {
    const fighters = pvpBoard(mk(1), undefined, mk(2, { attack: 9000, speed: 200 }), undefined);
    const out = resolveRound(fighters, new Map([[10, attack(0)], [0, attack(10)]]), 1, half);
    assert.equal(out.result, BattleResult.LOSE);
  });
  it('a pet without a command attacks a character or pet on the OTHER side, for both sides', () => {
    const fighters = pvpBoard(mk(1, { speed: 1 }), pet(10, { speed: 500, attack: 10 }), mk(2, { speed: 1 }), pet(0, { speed: 400, attack: 10 }));
    // owner slots are 10 / 0, so the pets sit at 15 / 5
    const out = resolveRound(fighters, new Map([[10, attack(0)], [0, attack(10)]]), 1, half);
    const hits = out.groups.flat().filter((s) => s.bid === BattleBehavior.ATTACK && (s.sid === 15 || s.sid === 5));
    assert.equal(hits.length, 2);
    assert.ok(hits.find((s) => s.sid === 15)!.tid < 10); // the attacker's pet hits the target side
    assert.ok(hits.find((s) => s.sid === 5)!.tid >= 10); // the target's pet hits the attacker side
  });
  it('fleeing loses in PvP (attacker flee = LOSE, target flee = WIN); not a FLED draw', () => {
    const esc: PlayerCommand = { action: BattleAction.ESCAPE, targetSlot: -1 };
    const a = resolveRound(pvpBoard(mk(1, { speed: 200 }), undefined, mk(2), undefined), new Map([[10, esc], [0, attack(10)]]), 1, half);
    assert.equal(a.result, BattleResult.LOSE);
    const t = resolveRound(pvpBoard(mk(1), undefined, mk(2, { speed: 200 }), undefined), new Map([[10, attack(0)], [0, esc]]), 1, half);
    assert.equal(t.result, BattleResult.WIN);
  });
  it('the round cap is a draw in PvP', () => {
    const fighters = pvpBoard(mk(1, { attack: 1 }), undefined, mk(2, { attack: 1 }), undefined);
    fighters.get(10)!.defense = 9999;
    fighters.get(0)!.defense = 9999;
    const out = resolveRound(fighters, new Map([[10, attack(0)], [0, attack(10)]]), 30, half);
    assert.equal(out.ended, true);
    assert.equal(out.result, BattleResult.FLED);
  });
});

describe('PvP result views and settle vitals', () => {
  it('the target sees WIN and LOSE swapped, the attacker and a draw as stored', () => {
    assert.equal(viewResult(true, 'player', BattleResult.WIN), BattleResult.WIN);
    assert.equal(viewResult(true, 'enemy', BattleResult.WIN), BattleResult.LOSE);
    assert.equal(viewResult(true, 'enemy', BattleResult.LOSE), BattleResult.WIN);
    assert.equal(viewResult(true, 'enemy', BattleResult.FLED), BattleResult.FLED);
    assert.equal(viewResult(false, 'enemy', BattleResult.WIN), BattleResult.WIN); // PvE untouched
  });
  it('the loser is left at 1 HP, the winner keeps its HP, nobody ends at 0', () => {
    const board = pvpBoard(mk(1, { hp: 60 }), pet(10, { hp: 0, alive: false }), mk(2, { hp: 0, alive: false }), undefined);
    const losers = applyPvpVitals(board.values(), BattleResult.WIN);
    assert.deepEqual(losers, [0]);
    assert.equal(board.get(0)!.hp, 1);
    assert.equal(board.get(10)!.hp, 60);
    assert.equal(board.get(15)!.hp, 0); // pets are not touched
  });
  it('a loser that fled keeps its remaining HP; a dead winner (pet carried) is lifted to 1', () => {
    const board = pvpBoard(mk(1, { hp: 0, alive: false }), undefined, mk(2, { hp: 70 }), undefined);
    applyPvpVitals(board.values(), BattleResult.LOSE);
    assert.equal(board.get(0)!.hp, 70);
    assert.equal(board.get(10)!.hp, 1);
  });
  it('a draw has no loser; loserSide maps the attacker-view result', () => {
    assert.deepEqual(applyPvpVitals(pvpBoard(mk(1), undefined, mk(2), undefined).values(), BattleResult.FLED), []);
    assert.equal(loserSide(BattleResult.WIN), 'enemy');
    assert.equal(loserSide(BattleResult.LOSE), 'player');
    assert.equal(loserSide(BattleResult.FLED), null);
  });
  it('a disconnecting player loses: attacker leaves = LOSE, target leaves = WIN', () => {
    assert.equal(leaveResult('player'), BattleResult.LOSE);
    assert.equal(leaveResult('enemy'), BattleResult.WIN);
  });
});

describe('endStepFor', () => {
  const marker = { sid: -1, tid: -1, bid: 0, end: true, result: BattleResult.WIN };
  const report = { exp: 5, money: 6, items: [] };
  it('PvE keeps the result and adds the report', () => {
    assert.deepEqual(endStepFor(false, 'player', marker, report), { ...marker, report });
  });
  it('PvP has no report and flips the result for the target only', () => {
    assert.deepEqual(endStepFor(true, 'player', marker, report), marker);
    assert.deepEqual(endStepFor(true, 'enemy', marker, report), { ...marker, result: BattleResult.LOSE });
  });
});
