// Pet rules: state gates, state values, name parsing, starting skills, changePetProperty parsing, capacity.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  battleStateBlocker, hasPetRoom, initialSkills, isSettableState, parsePetName, parsePetProperty, petShownOnMap,
} from './pet-rules';

const ok = { petLevel: 1, ownerLevel: 2, useLv: 1, life: 10000 };

test('battle state gates: life, level gap and use_lv', () => {
  assert.equal(battleStateBlocker(ok), null);
  assert.match(battleStateBlocker({ ...ok, life: 0 })!, /thọ mệnh/);
  assert.equal(battleStateBlocker({ ...ok, petLevel: 7, ownerLevel: 2 }), null); // exactly 5 above is allowed
  assert.match(battleStateBlocker({ ...ok, petLevel: 8, ownerLevel: 2 })!, /5 cấp/);
  assert.match(battleStateBlocker({ ...ok, useLv: 10, ownerLevel: 2 })!, /cấp 10/);
});

test('only states 1 and 3 can be set', () => {
  assert.ok(isSettableState(1));
  assert.ok(isSettableState(3));
  assert.ok(!isSettableState(2));
  assert.ok(!isSettableState(0));
});

test('pet name: trimmed 1..20, empty resets, junk rejected', () => {
  assert.deepEqual(parsePetName('  Mi Mi '), { ok: true, name: 'Mi Mi' });
  assert.deepEqual(parsePetName(''), { ok: true, name: null });
  assert.deepEqual(parsePetName('   '), { ok: true, name: null });
  assert.deepEqual(parsePetName('a'.repeat(20)), { ok: true, name: 'a'.repeat(20) });
  assert.deepEqual(parsePetName('a'.repeat(21)), { ok: false });
  assert.deepEqual(parsePetName('x<b>'), { ok: false });
  assert.deepEqual(parsePetName('a\nb'), { ok: false });
  assert.deepEqual(parsePetName(5), { ok: false });
});

test('starting skills: five open slots seeded from defaults, ten locked', () => {
  assert.deepEqual(initialSkills([]), [0, 0, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
  assert.deepEqual(initialSkills([11, 22]), [11, 22, 0, 0, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
  assert.equal(initialSkills([1, 2, 3, 4, 5, 6, 7]).length, 15);
});

test('changePetProperty parsing: strings, blanks, negatives, non-objects', () => {
  assert.deepEqual(parsePetProperty({ addStrength: '3', addAgility: '', addStamina: '2', addIntelligence: 'x', addEnergy: '-4' }), {
    add: { str: 3, agi: 0, sta: 2, int: 0, eng: 0 }, total: 5,
  });
  assert.equal(parsePetProperty({})?.total, 0);
  assert.equal(parsePetProperty(null), null);
  assert.equal(parsePetProperty([1]), null);
  assert.equal(parsePetProperty('3'), null);
});

test('capacity: count + incoming must fit petMaxNum', () => {
  assert.ok(hasPetRoom(5, 6));
  assert.ok(!hasPetRoom(6, 6));
  assert.ok(!hasPetRoom(5, 6, 2));
});

test('petShownOnMap: hidden only for active party members', () => {
  assert.equal(petShownOnMap({ inGroup: false, groupAfk: false }), true);
  assert.equal(petShownOnMap({ inGroup: true, groupAfk: false }), false);
  assert.equal(petShownOnMap({ inGroup: true, groupAfk: true }), true);
});
