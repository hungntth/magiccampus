// Pet stat registry: context filtering, per-pet merge, and the parity pin (a registry with no sources changes nothing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { addProp, BUFF_PROP, emptyBonuses, type Bonuses } from '../character/character-stats';
import { buildSkillTable } from '../gamedata/skill-data';
import type { PetTemplate } from '../gamedata/pet-data';
import { petBonuses, type PetBonusLookups } from './pet-bonus';
import { collectPetBonuses, type PetStatContext, type PetStatProvider } from './pet-stat-provider';
import type { PetBonuses } from './pet-stats';
import type { Pet } from './pet.schema';
import { propertyOfPet, statsOfPet } from './pet-view';

const tpl = {
  att: { str: 6, agi: 5, sta: 20, int: 5, eng: 5 },
  apt: { str: 1900, agi: 1600, sta: 2500, int: 1500, eng: 1500 },
} as PetTemplate;
const row = (over: Partial<Pet> = {}): Pet => ({ _id: 1, tid: 32, level: 1, growRate: 1.6, growRateAdd: 0, attrPoints: 0, ...over } as Pet);

const skills = buildSkillTable([{ id: 5527, name: 'Thu Bi', type: 11, buff_id: 2113, level: 1, cre_kind: '3|3' }]);
const look: PetBonusLookups = { skill: (id) => skills.get(id), buff: (id) => (id === 2113 ? { id: 2113, percent_flag: 1, prop1: 1, prop_num1: 22 } : undefined) };
const sword = { main_prop1: 4, main_prop_num1: 10, main_prop2: 24, main_prop_num2: 10 }; // +10 attack, +10 % HP

const hp = (pct: number): Bonuses => {
  const b = emptyBonuses();
  addProp(b, BUFF_PROP, 1, pct, true);
  return b;
};
const provider = (key: string, contexts: readonly PetStatContext[], out: (ids: number[]) => Map<number, Bonuses>): PetStatProvider => ({
  key, contexts, bonuses: async (_owner, pets) => out(pets.map((p) => p._id)),
});

test('parity: a pet with gear + passive keeps exactly today\'s sheet when the registry adds nothing', async () => {
  const base: PetBonuses = petBonuses([sword], [5527], look);
  const today = statsOfPet(row(), tpl, base).stats;
  // Pinned (creature 32 Lv1 grow 1.6): hp 972 -> gear +10 % (1069) -> passive +22 % (1304); attack 62 + 10.
  assert.equal(today.maxHp, 1304);
  assert.equal(today.attack, 72);
  const collected = await collectPetBonuses([], 7, [row()], 'panel');
  assert.equal(collected.size, 0);
  const viaRegistry: PetBonuses = { ...base, ...(collected.get(1) ? { feature: collected.get(1) } : {}) };
  assert.deepEqual(statsOfPet(row(), tpl, viaRegistry).stats, today);
  assert.deepEqual(propertyOfPet(row(), tpl, viaRegistry), propertyOfPet(row(), tpl, base));
});

test('a provider whose bonuses are empty does not move the sheet either', async () => {
  const base = petBonuses([sword], [5527], look);
  const collected = await collectPetBonuses([provider('noop', ['panel'], (ids) => new Map(ids.map((id) => [id, emptyBonuses()])))], 7, [row()], 'panel');
  const withFeature: PetBonuses = { ...base, feature: collected.get(1) };
  assert.deepEqual(statsOfPet(row(), tpl, withFeature).stats, statsOfPet(row(), tpl, base).stats);
});

test('providers apply only in their contexts', async () => {
  const talent = provider('talent', ['panel', 'battle', 'arena', 'ppve'], (ids) => new Map(ids.map((id) => [id, hp(10)])));
  const handbook = provider('handbook', ['battle', 'ppve'], (ids) => new Map(ids.map((id) => [id, hp(5)])));
  const pets = [row()];
  assert.equal((await collectPetBonuses([talent, handbook], 7, pets, 'panel')).get(1)?.pct.maxHp, 10);
  assert.equal((await collectPetBonuses([talent, handbook], 7, pets, 'battle')).get(1)?.pct.maxHp, 15);
  assert.equal((await collectPetBonuses([talent, handbook], 7, pets, 'arena')).get(1)?.pct.maxHp, 10);
  assert.equal((await collectPetBonuses([talent, handbook], 7, pets, 'ppve')).get(1)?.pct.maxHp, 15);
});

test('merging is per pet and never mutates a provider-owned bonus object', async () => {
  const shared = hp(10);
  const talent = provider('talent', ['panel'], (ids) => new Map(ids.map((id) => [id, shared])));
  const onlyPet2 = provider('soul', ['panel'], () => new Map([[2, hp(4)]]));
  const out = await collectPetBonuses([talent, onlyPet2], 7, [row({ _id: 1 }), row({ _id: 2 })], 'panel');
  assert.equal(out.get(1)?.pct.maxHp, 10);
  assert.equal(out.get(2)?.pct.maxHp, 14);
  assert.equal(shared.pct.maxHp, 10);
});

test('the provider bonuses land in the feature bucket: flats then percents on the running value', async () => {
  const base = petBonuses([], [], look);
  const none = statsOfPet(row(), tpl, base).stats.maxHp;
  const out = await collectPetBonuses([provider('talent', ['panel'], (ids) => new Map(ids.map((id) => [id, hp(10)])))], 7, [row()], 'panel');
  const s = statsOfPet(row(), tpl, { ...base, feature: out.get(1) }).stats;
  assert.equal(s.maxHp, none + Math.trunc((none * 10) / 100));
});
