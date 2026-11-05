// Integration tests: NPC skills inside resolveRound (multi-target cluster shape, buff icons, stun skip, MP spent).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, BattleBehavior as B } from '@mc/shared';
import type { PlayerCommand } from '../battle.types';
import { resolveRound } from '../round';
import { board, buffRow, env, mk, seq } from './test-kit';

const timeout = (): Map<number, PlayerCommand> => new Map();

describe('NPC skills in a round', () => {
  it('a horizontal magic skill plays one cast, one hurt wave owned by the targets and a follow wave', () => {
    const e = env({ 101: { tpl: { name: 'Lôi', type: 3, areaAttack: 2, targetNum: 3, useMp: 10 } } }, { 0: [101] });
    const npc = mk(0, 'enemy', { speed: 999 });
    const ps = [mk(10, 'player', { hp: 5000, hpMax: 5000 }), mk(11, 'player', { hp: 5000, hpMax: 5000 }), mk(12, 'player', { hp: 5000, hpMax: 5000 })];
    const out = resolveRound(board(npc, ...ps), timeout(), 1, seq([0, 0]), undefined, e);
    const cast = out.groups.find((g) => g[0].sid === 0 && g[0].bid === B.MAGIC)!;
    assert.deepEqual([cast[0].sSObj, cast[0].tSObj], [{ skill: 'Lôi', uMp: 90 }, {}]);
    const hurt = out.groups[out.groups.indexOf(cast) + 1];
    assert.deepEqual(hurt.map((s) => [s.sid, s.bid]), [[10, B.HURT], [11, B.HURT], [12, B.HURT]]);
    for (const s of hurt) assert.ok((s.sSObj?.hHp ?? 5000) < 5000);
    assert.equal(npc.mp, 90);
  });
  it('a stun state skill shows buffAdd on the target and the target loses its turn', () => {
    const e = env({ 102: { tpl: { name: 'Choáng', type: 6, buffId: 14, buffRate: 100, buffRound: 1 }, buff: buffRow({ id: 14, kind: 1, state: 10, icon_code: '5005' }) } }, { 0: [102] });
    const npc = mk(0, 'enemy', { speed: 999, hp: 100000, hpMax: 100000 });
    const p = mk(10, 'player');
    const cmds = new Map<number, PlayerCommand>([[10, { action: BattleAction.ATTACK, targetSlot: 0 }]]);
    const out = resolveRound(board(npc, p), cmds, 1, seq([0, 0, 0]), undefined, e);
    const add = out.groups.flat().find((s) => s.sSObj?.buffAdd);
    assert.deepEqual([add?.sid, add?.sSObj?.buffAdd], [10, { id: 14, round: 2, icon: '5005' }]);
    assert.equal(out.groups.flat().some((s) => s.sid === 10 && s.bid === B.RUN_FAST), false);
    assert.equal(npc.hp, 100000);
  });
  it('a creature without skill rows still basic-attacks', () => {
    const npc = mk(0, 'enemy', { speed: 999 });
    const out = resolveRound(board(npc, mk(10, 'player')), timeout(), 1, seq([]), undefined, env({}));
    assert.ok(out.groups.flat().some((s) => s.sid === 0 && s.bid === B.ATTACK && s.tid === 10));
  });
});
