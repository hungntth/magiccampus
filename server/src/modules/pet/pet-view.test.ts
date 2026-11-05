// Unit test for the following-pet scene view (pet-view.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PetTemplate } from '../gamedata/pet-data';
import { petSceneView } from './pet-view';

test('petSceneView carries the scene keys the Flash Pet object reads', () => {
  const tpl = { resCode: '2060100000014', colorCode: '-173', iconCode: '3060100000014' } as PetTemplate;
  const v = petSceneView({ _id: 7, characterId: 3, tid: 32, petName: 'Nấm', level: 5, element: 0 }, tpl);
  assert.deepEqual(v, {
    id: 7, cid: 3, tid: 32, name: 'Nấm', level: 5, resCode: '2060100000014', colorCode: '-173',
    iconCode: '3060100000014', element: 0,
  });
});

// --- aptitude pipeline (apt = refined ?? creature + Vu Hoa + Ao Hoa; aptEx stays distributed points only) ---

import { petStats } from './pet-stats';
import { petView, propertyOfPet, sheetAptitudes, statsOfPet } from './pet-view';
import type { Pet } from './pet.schema';

const ZERO = { str: 0, agi: 0, sta: 0, int: 0, eng: 0 };
const c32 = {
  att: { str: 6, agi: 5, sta: 20, int: 5, eng: 5 },
  apt: { str: 1900, agi: 1600, sta: 2500, int: 1500, eng: 1500 },
  name: 'Nam', classId: 3, qLevel: 1, useLevel: 1, resCode: '1', iconCode: '2', colorCode: '3',
} as PetTemplate;
const apt0 = { strength: 0, agility: 0, stamina: 0, intelligence: 0, energy: 0 };
const petRow = (over: Partial<Pet> = {}): Pet => ({
  _id: 1, characterId: 3, tid: 32, petName: 'Nam', level: 1, exp: 1, growRate: 1.6, growRateAdd: 0, attrPoints: 0, life: 10000, state: 3,
  binded: 0, following: false, skills: [], equ: [], upgradeNum: 0, element: 0, aptEx: apt0, aptRefined: apt0, aptIllusion: apt0, ...over,
} as Pet);

test('an unrefined pet (all-zero aptRefined) uses the creature aptitude: the sheet equals the plain formula', () => {
  const plain = petStats({ att: c32.att, apt: c32.apt, level: 1, growRate: 1.6, growRateAdd: 0, aptEx: ZERO }).stats;
  assert.deepEqual(statsOfPet(petRow(), c32).stats, plain);
  assert.equal(statsOfPet(petRow(), c32).stats.maxHp, 972);
  assert.deepEqual(statsOfPet(petRow({ aptRefined: undefined, aptIllusion: undefined }), c32).stats, plain);
});

test('a refined aptitude replaces the creature value and is never added as distributed points', () => {
  const refined = petRow({ aptRefined: { ...apt0, stamina: 2900 } });
  const want = petStats({ att: c32.att, apt: { ...c32.apt, sta: 2900 }, level: 1, growRate: 1.6, growRateAdd: 0, aptEx: ZERO });
  assert.deepEqual(statsOfPet(refined, c32), want);
  assert.equal(statsOfPet(refined, c32).attrs.sta, 20); // attributes untouched: points are not apt
  assert.equal(sheetAptitudes(refined, c32).base.sta, 2900);
});

test('illusion aptitude adds on top of the aptitude, still not to the points', () => {
  const row = petRow({ aptRefined: { ...apt0, strength: 2000 }, aptIllusion: { ...apt0, strength: 200, energy: 150 }, aptEx: { ...apt0, strength: 7 } });
  const want = petStats({
    att: c32.att, apt: { ...c32.apt, str: 2200, eng: 1650 }, level: 1, growRate: 1.6, growRateAdd: 0, aptEx: { ...ZERO, str: 7 },
  });
  assert.deepEqual(statsOfPet(row, c32), want);
  assert.equal(statsOfPet(row, c32).attrs.str, 6 + 7);
});

test('an evolved pet adds the Vu Hoa table aptitude of its evolved creature at its round / stage', () => {
  const evolved = petRow({ tid: 1407, envoInfo: { envo: true, round: 0, stage: 4 } });
  const apt = sheetAptitudes(evolved, c32);
  assert.deepEqual(apt.evolution, { str: 60, sta: 60, agi: 73, int: 66, eng: 95 });
  assert.equal(apt.total.str, 1900 + 60);
  assert.equal(apt.total.eng, 1500 + 95);
  const plain = petRow({ tid: 1407 }); // not evolved: no table apt
  assert.deepEqual(sheetAptitudes(plain, c32).evolution, ZERO);
});

test('the pet view exposes base aptitude, Ex = points + illusion, and the Evolution / Illusion keys (also in property)', () => {
  const row = petRow({
    tid: 1407, envoInfo: { envo: true, round: 0, stage: 4 }, aptRefined: { ...apt0, agility: 1700 },
    aptEx: { ...apt0, agility: 5 }, aptIllusion: { ...apt0, agility: 100 },
  });
  const v = petView(row, c32);
  assert.equal(v.aptAgility, 1700);
  assert.equal(v.aptStrength, 1900);
  assert.equal(v.aptAgilityEx, 105);
  assert.equal(v.aptAgilityEvolution, 73);
  assert.equal(v.aptAgilityIllusion, 100);
  assert.equal(v.aptStrengthEvolution, 60);
  assert.equal(v.property.aptAgilityEvolution, 73);
  assert.equal(v.property.aptEnergyEvolution, 95);
  assert.deepEqual(propertyOfPet(row, c32), v.property);
});
