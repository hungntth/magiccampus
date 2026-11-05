// Unit pins for M12 pet-stone composition, absorb and inlay rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeStoneHoles, parseStoneHoles, petStoneAbsorbValid, petStoneCanInlay, petStoneComposeNeed, petStoneFitsHole, petStoneInlayRefusal,
  stoneHolesWire,
} from './petStone.js';

test('pet-stone composition consumes three per result and refuses level five / energy stones', () => {
  assert.equal(petStoneComposeNeed({ level: 1, nextId: 2, energyFlag: false }, 4), 12);
  assert.equal(petStoneComposeNeed({ level: 5, nextId: 2, energyFlag: false }, 1), null);
  assert.equal(petStoneComposeNeed({ level: 6, nextId: 0, energyFlag: true }, 1), null);
});

test('pet-stone holes separate energy stones and reject duplicate property families', () => {
  assert.equal(petStoneFitsHole(1, true), true);
  assert.equal(petStoneFitsHole(1, false), false);
  assert.equal(petStoneFitsHole(2, false), true);
  assert.equal(petStoneCanInlay(2, { energyFlag: false, propType: 4 }, { 3: 11 }, (id) => id === 11 ? { propType: 4 } : undefined), false);
  assert.equal(petStoneCanInlay(2, { energyFlag: false, propType: 4 }, { 3: 12 }, () => ({ propType: 5 })), true);
});

test('pet-stone absorb converts five regular level-five stones to the main energy id', () => {
  const source = { level: 5, energyFlag: false, energyId: 1001 };
  assert.equal(petStoneAbsorbValid([source, source, source, source, source]), 1001);
  assert.equal(petStoneAbsorbValid([{ ...source, energyFlag: true }, source, source, source, source]), null);
});

test('pet-stone inlay refusals follow the Go order', () => {
  const tpl = (id: number) => ({ propType: id === 11 ? 4 : 5 });
  const regular = { energyFlag: false, propType: 4 };
  const energy = { energyFlag: true, propType: 4 };
  assert.equal(petStoneInlayRefusal(7, regular, {}, tpl), 'hole');
  assert.equal(petStoneInlayRefusal(0, regular, {}, tpl), 'hole');
  assert.equal(petStoneInlayRefusal(1, regular, {}, tpl), 'notEnergySlot');
  assert.equal(petStoneInlayRefusal(2, energy, {}, tpl), 'energyOnlyFirst');
  assert.equal(petStoneInlayRefusal(2, regular, { 2: 12 }, tpl), 'taken');
  assert.equal(petStoneInlayRefusal(3, regular, { 2: 11 }, tpl), 'sameProp');
  assert.equal(petStoneInlayRefusal(1, energy, { 2: 11 }, tpl), 'sameProp', 'the energy stone shares its family property');
  assert.equal(petStoneInlayRefusal(3, regular, { 2: 12 }, tpl), null);
});

test('flag3 holes round-trip and accept the unquoted GM form', () => {
  const holes = { 1: { tid: 18, skillId: 5135 }, 3: { tid: 7, skillId: 0 } };
  const text = encodeStoneHoles(holes);
  assert.equal(text, '{"1":[18,0,5135],"3":[7,0,0]}');
  assert.deepEqual(parseStoneHoles(text), holes);
  assert.deepEqual(parseStoneHoles('{1:[1,1,12345]}'), { 1: { tid: 1, skillId: 12345 } });
  assert.deepEqual(parseStoneHoles('nonsense'), {});
  assert.deepEqual(parseStoneHoles(undefined), {});
  assert.deepEqual(parseStoneHoles('{"9":[1,0,0],"2":[0,0,0],"4":"x"}'), {});
  assert.equal(encodeStoneHoles({}), '');
  assert.deepEqual(stoneHolesWire(holes), { 1: [18, 0, 5135], 3: [7, 0, 0] });
});

test('absorb needs exactly five selections', () => {
  const source = { level: 5, energyFlag: false, energyId: 24 };
  assert.equal(petStoneAbsorbValid([source, source, source, source]), null);
  assert.equal(petStoneAbsorbValid([source, source, source, source, { ...source, level: 4 }]), null);
  assert.equal(petStoneAbsorbValid([{ ...source, energyId: 18 }, source, source, source, source]), 18, 'the main stone decides');
});
