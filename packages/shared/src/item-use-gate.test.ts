// Tests of the client use gate (Flash Player.useItem decision tree).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_USE_TEXT } from './item-use-batch.ts';
import { useGate } from './item-use-gate.ts';

const ctx = { charLevel: 30, classId: 2, petLevel: 12 };

test('character target: use_type 1 / 3 only', () => {
  assert.equal(useGate('char', { useType: 1, reqLevel: 1 }, ctx), null);
  assert.equal(useGate('char', { useType: 3, reqLevel: 1 }, ctx), null);
  assert.equal(useGate('char', { useType: 2, reqLevel: 1 }, ctx), PLAYER_USE_TEXT.NOT_FOR_CHAR);
  assert.equal(useGate('char', { useType: 4, reqLevel: 1 }, ctx), PLAYER_USE_TEXT.NOT_FOR_CHAR);
});

test('character level and class gates', () => {
  assert.equal(useGate('char', { useType: 1, reqLevel: 31 }, ctx), PLAYER_USE_TEXT.LEVEL);
  assert.equal(useGate('char', { useType: 1, reqLevel: 30 }, ctx), null);
  assert.equal(useGate('char', { useType: 1, reqLevel: 1, reqClass: '|1|3|' }, ctx), PLAYER_USE_TEXT.CLASS);
  assert.equal(useGate('char', { useType: 1, reqLevel: 1, reqClass: '|1|2|3|' }, ctx), null);
  assert.equal(useGate('char', { useType: 1, reqLevel: 1, reqClass: '' }, ctx), null);
});

test('pet target: use_type 2 / 3 and the pet level; no class check', () => {
  assert.equal(useGate('pet', { useType: 2, reqLevel: 12 }, ctx), null);
  assert.equal(useGate('pet', { useType: 3, reqLevel: 13 }, ctx), PLAYER_USE_TEXT.PET_LEVEL);
  assert.equal(useGate('pet', { useType: 1, reqLevel: 1 }, ctx), PLAYER_USE_TEXT.NOT_FOR_PET);
  assert.equal(useGate('pet', { useType: 2, reqLevel: 1, reqClass: '|9|' }, ctx), null);
});
