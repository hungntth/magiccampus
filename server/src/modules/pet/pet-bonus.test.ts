// Pet stat bonuses: gear order (attrs -> formula -> flats -> percents) and passive-skill buffs (percent_flag).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSkillTable } from '../gamedata/skill-data';
import { passiveBuffs, petBonuses, type PetBonusLookups } from './pet-bonus';
import { petStats } from './pet-stats';

const ZERO = { str: 0, agi: 0, sta: 0, int: 0, eng: 0 };
const creature32 = {
  att: { str: 6, agi: 5, sta: 20, int: 5, eng: 5 },
  apt: { str: 1900, agi: 1600, sta: 2500, int: 1500, eng: 1500 },
};
const base = (bonuses?: ReturnType<typeof petBonuses>) =>
  petStats({ ...creature32, level: 1, growRate: 1.6, growRateAdd: 0, aptEx: ZERO, bonuses });

const skills = buildSkillTable([
  { id: 5527, name: 'Thụ Bì', type: 11, buff_id: 2113, level: 1, cre_kind: '3|3' },
  { id: 6001, name: 'Cương Phong', type: 11, buff_id: 7001, level: 1 },
  { id: 6002, name: 'Chủ Động', type: 1, buff_id: 2113, level: 1 },
]);
const buffs: Record<number, Record<string, unknown>> = {
  2113: { id: 2113, percent_flag: 1, prop1: 1, prop_num1: 22 }, // +22 % HP
  7001: { id: 7001, percent_flag: 0, prop1: 4, prop_num1: 15, prop2: 11, prop_num2: 7 }, // +15 attack, +7 speed flat
};
const look: PetBonusLookups = { skill: (id) => skills.get(id), buff: (id) => buffs[id] };

test('no bonuses keeps the creature 32 vector (hp 972)', () => {
  assert.equal(base().stats.maxHp, 972);
  assert.equal(base(petBonuses([], [], look)).stats.maxHp, 972);
});

test('passive skill type 11 + percent buff: +22 % HP of the running value', () => {
  const s = base(petBonuses([], [5527], look)).stats;
  assert.equal(s.maxHp, 972 + Math.trunc((972 * 22) / 100));
  assert.equal(s.attack, base().stats.attack); // other stats untouched
});

test('passive flat buff adds flat values', () => {
  const s = base(petBonuses([], [6001], look)).stats;
  assert.equal(s.attack, base().stats.attack + 15);
  assert.equal(s.speed, base().stats.speed + 7);
});

test('only type 11 skills with a known buff are passive; empty and locked slots are ignored', () => {
  assert.equal(passiveBuffs([6002, 0, -1, 99999], look).length, 0);
  assert.equal(passiveBuffs([5527, 6001, 0, -1], look).length, 2);
});

test('gear: attribute props feed the formula, flats are added, percent props apply last on the running value', () => {
  const sword = { main_prop1: 4, main_prop_num1: 10, main_prop2: 24, main_prop_num2: 10 }; // +10 attack, +10 % HP
  const ring = { main_prop1: 21, main_prop_num1: 5, prop1: 1, prop_num1: 100 }; // +5 stamina, +100 HP flat
  const none = base();
  const s = base(petBonuses([sword, ring], [], look));
  assert.equal(s.attrs.sta, none.attrs.sta + 5);
  const hpFromFormula = petStats({ ...creature32, level: 1, growRate: 1.6, growRateAdd: 0, aptEx: { ...ZERO, sta: 5 } }).stats.maxHp;
  assert.equal(s.stats.maxHp, hpFromFormula + 100 + Math.trunc(((hpFromFormula + 100) * 10) / 100));
  assert.equal(s.stats.attack, petStats({ ...creature32, level: 1, growRate: 1.6, growRateAdd: 0, aptEx: { ...ZERO, sta: 5 } }).stats.attack + 10);
});

test('gear percents come before passive percents', () => {
  const helm = { main_prop1: 24, main_prop_num1: 10 }; // +10 % HP
  const s = base(petBonuses([helm], [5527], look)).stats;
  const afterGear = 972 + Math.trunc((972 * 10) / 100);
  assert.equal(s.maxHp, afterGear + Math.trunc((afterGear * 22) / 100));
});
