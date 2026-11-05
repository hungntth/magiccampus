// Tests of the pure Tiến hóa window rules (run from server/: node --test --import tsx ../client/src/ui/petevo/petEvoRules.test.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PetView } from '@mc/shared';
import {
  applyContractReply, contractFigures, evolveGate, evolvablePets, featherMessage, featherPlan, featherRows, serieBonusText,
} from './petEvoRules';

const pet = (over: Partial<PetView>): PetView => ({ id: 1, tid: 1672, binded: 1, growRate: 1, aptStrength: 100, aptAgility: 100, aptStamina: 100, aptIntelligence: 100, aptEnergy: 100, ...over }) as PetView;
const def = { id: 81, name: 'Hắc Nhân Mã' };

test('only unevolved pets of an evolvable creature are listed', () => {
  const list = evolvablePets([pet({ id: 1 }), pet({ id: 2, tid: 1677, envoInfo: { envo: true, round: 0, stage: 0 } }), pet({ id: 3, tid: 5 })]);
  assert.deepEqual(list.map((p) => p.id), [1]);
});

test('evolve gate: level, bound, activation in that order', () => {
  const all = { '81': { pid: 81, actived: true, activedNum: 1500 } };
  assert.equal(evolveGate(pet({}), def as never, all, 119).ok, false);
  assert.equal(evolveGate(pet({ binded: 0 }), def as never, all, 120).ok, false);
  assert.equal(evolveGate(pet({}), def as never, {}, 120).ok, false);
  assert.equal(evolveGate(pet({}), def as never, all, 120).ok, true);
});

test('feather plan mirrors the Flash checks and the shared cost tables', () => {
  const p = featherPlan({ envo: true, round: 0, stage: 1 }, 100, 5, true);
  assert.deepEqual(p, { ok: true, np: 50, charms: 1, rate: 29 });
  assert.equal(featherPlan({ envo: true, round: 0, stage: 1 }, 49, 5, false).ok, false);
  assert.equal(featherPlan({ envo: true, round: 0, stage: 1 }, 100, 0, true).ok, false);
  assert.equal(featherPlan({ envo: true, round: 0, stage: 0 }, 100, 0, true).ok, true); // milestone stage needs no charm
  assert.equal(featherPlan({ envo: true, round: 2, stage: 9 }, 999, 99, false).ok, false);
});

test('feather messages and table rows', () => {
  const before = { envo: true, round: 0, stage: 4 };
  assert.match(featherMessage(before, { pid: 1, success: true, round: 0, stage: 5, protect: false }), /Cảnh Giới 1 cấp 5/);
  assert.match(featherMessage(before, { pid: 1, success: false, round: 0, stage: 3, protect: false }), /giảm xuống Cảnh Giới 1 cấp 3/);
  assert.equal(featherMessage(before, { pid: 1, success: false, round: 0, stage: 4, protect: true }), 'Vũ Hóa thất bại!');
  const rows = featherRows(pet({ tid: 1677, envoInfo: before }), before);
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.next >= r.feather));
});

test('contract figures read the login object and the reply patches it', () => {
  const f = contractFigures({ hp: 3, hpExp: 40 }, 1, false);
  assert.equal(f.level, 3);
  assert.equal(f.exp, 40);
  assert.ok(f.expMax > 0 && f.stones > 0 && f.next > f.now);
  assert.equal(contractFigures({ hp: 50 }, 1, false).maxed, true);
  assert.equal(contractFigures(undefined, 2, false).level, 0);
  const patched = applyContractReply({ hp: 1, speedExp: 5 }, { type: 2, newLvl: 4, newExp: 7 });
  assert.equal(patched.speed, 4);
  assert.equal(patched.speedExp, 7);
  assert.equal(patched.hp, 1);
});

test('series bonus text lists the three props of series 1..8 only', () => {
  assert.equal(serieBonusText(1).split(', ').length, 3);
  assert.equal(serieBonusText(9), '');
});
