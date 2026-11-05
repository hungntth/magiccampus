// Tests for the auto-battle brain: chain order, thresholds, missing items, MP-short fallback and back-row targeting.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleAction, type BagItem, type LearnedSkill } from '@mc/shared';
import { autoCharacterCommand, autoPetCommand, isFrontSlot, type AutoInput, type AutoUnit } from './autoBattle';

const u = (slot: number, o: Partial<AutoUnit> = {}): AutoUnit => ({
  slot, side: slot < 10 ? 'enemy' : 'player', kind: slot < 10 ? 'creature' : slot < 15 ? 'character' : 'pet',
  hp: 100, hpMax: 100, mp: 100, mpMax: 100, alive: true, ...o,
});
const skill = (sid: number, o: Partial<LearnedSkill> = {}): LearnedSkill => ({
  sid, level: 1, position: 0, kind: 1, name: `s${sid}`, type: 3, useMp: 10, iconCode: '0', targetType: 4, ...o,
});
const bag = (tid: number, id: number): BagItem => ({ id, tid, stackNum: 3 } as BagItem);
const base = (o: Partial<AutoInput> = {}): AutoInput => ({
  units: [u(10), u(15), u(0), u(5)], self: 10, skills: [], bag: [], settings: {}, defend: false, rng: () => 0, ...o,
});

describe('autoCharacterCommand', () => {
  it('no settings: basic attack; the back row hits a front enemy', () => {
    const pick = autoCharacterCommand(base());
    assert.equal(pick.cmd.action, BattleAction.ATTACK);
    assert.equal(pick.cmd.tid, 5); // slot 0 is covered by 5
  });

  it('self HP item under the threshold, skipped without the item', () => {
    const units = [u(10, { hp: 20 }), u(0)];
    const settings = { bs1: 1, bt1: 29, p2: 50 };
    assert.deepEqual(autoCharacterCommand(base({ units, settings, bag: [bag(1, 77)] })).cmd, { tid: 10, action: BattleAction.ITEM, id: 77, level: -1 });
    assert.equal(autoCharacterCommand(base({ units, settings })).cmd.action, BattleAction.ATTACK);
    assert.equal(autoCharacterCommand(base({ units: [u(10, { hp: 60 }), u(0)], settings, bag: [bag(1, 77)] })).cmd.action, BattleAction.ATTACK);
  });

  it('self HP skill heals self; MP item next', () => {
    const heal = skill(40, { type: 5, targetType: 2 });
    const pick = autoCharacterCommand(base({ units: [u(10, { hp: 5 }), u(0)], skills: [heal], settings: { bs1: 40, bt1: 52, p2: 10 } }));
    assert.deepEqual(pick.cmd, { tid: 10, action: BattleAction.SKILL, id: 40, level: 1 });
    const mp = autoCharacterCommand(base({ units: [u(10, { mp: 1 }), u(0)], bag: [bag(158, 9)], settings: { bs9: 158, p3: 20 } }));
    assert.deepEqual(mp.cmd, { tid: 10, action: BattleAction.ITEM, id: 9, level: -1 });
  });

  it('team heal skill targets the first wounded ally; items on others are skipped', () => {
    const heal = skill(41, { type: 5, targetType: 8 });
    const units = [u(10), u(11, { hp: 10 }), u(0)];
    assert.equal(autoCharacterCommand(base({ units, skills: [heal], settings: { bs3: 41, bt3: 52, p4: 50 } })).cmd.tid, 11);
    assert.equal(autoCharacterCommand(base({ units, bag: [bag(1, 5)], settings: { bs3: 1, bt3: 29, p4: 50 } })).cmd.action, BattleAction.ATTACK);
  });

  it('auto-defence before the attack skill', () => {
    assert.equal(autoCharacterCommand(base({ defend: true, skills: [skill(7)], settings: { bs7: 7 } })).cmd.action, BattleAction.DEFENCE);
  });

  it('attack skill, MP short falls back to a basic attack with a note', () => {
    const sk = skill(7, { useMp: 50 });
    assert.deepEqual(autoCharacterCommand(base({ skills: [sk], settings: { bs7: 7 } })).cmd, { tid: 0, action: BattleAction.SKILL, id: 7, level: 1 });
    const short = autoCharacterCommand(base({ units: [u(10, { mp: 10 }), u(0)], skills: [sk], settings: { bs7: 7 } }));
    assert.equal(short.cmd.action, BattleAction.ATTACK);
    assert.equal(short.note, 'MP của nhân vật không đủ,hãy bổ sung!');
  });

  it('close skill from the back row picks a front enemy', () => {
    const sk = skill(8, { type: 1 });
    assert.equal(autoCharacterCommand(base({ skills: [sk], settings: { bs7: 8 } })).cmd.tid, 5);
  });

  it('a configured skill no longer learned is skipped', () => {
    assert.equal(autoCharacterCommand(base({ settings: { bs7: 99 } })).cmd.action, BattleAction.ATTACK);
  });
});

describe('autoPetCommand', () => {
  it('uses the pet keys and the front-row rule from the pet slot', () => {
    const sk = skill(70, { useMp: 5 });
    const pick = autoPetCommand(base({ self: 15, skills: [sk], settings: { bs8: 70, bs7: 1 } }));
    assert.deepEqual(pick.cmd, { tid: 0, action: BattleAction.SKILL, id: 70, level: 1 });
    const basic = autoPetCommand(base({ self: 15 }));
    assert.equal(basic.cmd.tid, 0); // front row: any enemy
  });

  it('pet self item under p6', () => {
    const units = [u(10), u(15, { hp: 5 }), u(0)];
    assert.deepEqual(autoPetCommand(base({ units, self: 15, bag: [bag(1, 3)], settings: { bs2: 1, bt2: 29, p6: 10 } })).cmd,
      { tid: 15, action: BattleAction.ITEM, id: 3, level: -1 });
  });
});

it('front slots', () => {
  assert.equal(isFrontSlot(5), true);
  assert.equal(isFrontSlot(4), false);
  assert.equal(isFrontSlot(15), true);
  assert.equal(isFrontSlot(10), false);
});
