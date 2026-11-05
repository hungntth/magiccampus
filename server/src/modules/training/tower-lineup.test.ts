// Tests for the Ảo Ma Tháp line-up: guardian cycle / level / attribute scaling, escort count, centre slot, missing rows.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CreatureTemplate } from '../gamedata/combat-data';
import { scaledTemplate, towerEnemies } from './tower-lineup';

const tpl = (id: number): CreatureTemplate => ({
  id, name: `c${id}`, useLevel: 200, life: 10000, growBase: 1, att: { str: 200, agi: 200, sta: 200, int: 200, eng: 200 },
  apt: { str: 0, agi: 0, sta: 0, int: 0, eng: 0 }, propHit: 0, propDodge: 0, propSpeed: 0, propCritical: 0, resCode: '0', element: 0,
});
const all = (id: number): CreatureTemplate | undefined => (id >= 763 && id <= 774 ? tpl(id) : undefined);
const keep = <T>(items: T[]): T[] => items;

test('floor 1: the guardian alone, level 60, attributes scaled to 10 %', () => {
  const e = towerEnemies(1, all, keep);
  assert.equal(e.length, 1);
  assert.equal(e[0].refId, 763);
  assert.equal(e[0].level, 60);
  assert.equal(e[0].slot, 0);
  assert.equal(e[0].bossFlag, 1);
  const full = towerEnemies(400, all, keep)[0];
  assert.ok(full.hpMax > e[0].hpMax * 20); // level 200 at factor 1.0 vs level 60 at 0.1
});

test('escorts: one per 100 floors (max 3), same level, unscaled, in the following slots', () => {
  const e = towerEnemies(350, all, keep);
  assert.equal(e.length, 4);
  assert.deepEqual(e.map((f) => f.refId), [763 + ((350 - 1) % 6), 769, 770, 771]);
  assert.deepEqual(e.map((f) => f.slot), [0, 2, 1, 4]);
  assert.ok(e.every((f) => f.level === e[0].level));
  assert.equal(e[1].bossFlag, 0);
});

test('a missing guardian row means no battle; missing escorts are skipped', () => {
  assert.deepEqual(towerEnemies(5, () => undefined, keep), []);
  const onlyGuardian = (id: number): CreatureTemplate | undefined => (id === 763 ? tpl(id) : undefined);
  assert.equal(towerEnemies(301, onlyGuardian, keep).length, 1);
});

test('scaledTemplate multiplies the five attributes and nothing else', () => {
  const s = scaledTemplate(tpl(763), 0.5);
  assert.deepEqual(s.att, { str: 100, agi: 100, sta: 100, int: 100, eng: 100 });
  assert.equal(s.life, 10000);
});
