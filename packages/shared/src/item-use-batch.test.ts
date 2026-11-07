// Tests of the batch use helpers: quantity dialog kinds, pet grow room / units and the count cap of useMultiItem.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { petExpOfLevel } from './pet.ts';
import { batchUseKind, capUseCount, petGrowExpRoom, petGrowMaxUnits, USE_MULTI_MAX } from './item-use-batch.ts';

test('quantity dialog kinds follow Player.useItem', () => {
  assert.equal(batchUseKind(5375), 'stack');
  assert.equal(batchUseKind(5697), 'stack');
  assert.equal(batchUseKind(5698), null);
  assert.equal(batchUseKind(6562), 'stack');
  assert.equal(batchUseKind(643), 'one');
  assert.equal(batchUseKind(4276), 'one'); // last Thien Phu Thach bag
  assert.equal(batchUseKind(4201), 'one');
  assert.equal(batchUseKind(962), 'petGrow');
  assert.equal(batchUseKind(1), null);
});

test('pet grow room is the exp up to the start of owner level + 5', () => {
  assert.equal(petGrowExpRoom(0, 10), petExpOfLevel(15));
  assert.equal(petGrowExpRoom(petExpOfLevel(15), 10), 0);
  assert.equal(petGrowExpRoom(petExpOfLevel(15) + 5, 10), 0);
  assert.equal(petGrowExpRoom(0, 1000), petExpOfLevel(160)); // capped by the pet level maximum
});

test('pet grow units round up and need a grow item', () => {
  const room = petGrowExpRoom(0, 10);
  assert.equal(petGrowMaxUnits(961, 0, 10), Math.ceil(room / 30000));
  assert.equal(petGrowMaxUnits(961, petExpOfLevel(15), 10), 0);
  assert.equal(petGrowMaxUnits(5, 0, 10), 0);
});

test('capUseCount caps by the stack and rejects bad requests', () => {
  assert.equal(capUseCount(5, 3), 3);
  assert.equal(capUseCount(2, 3), 2);
  assert.equal(capUseCount(0, 3), 0);
  assert.equal(capUseCount(-1, 3), 0);
  assert.equal(capUseCount(1.5, 3), 0);
  assert.equal(capUseCount(5, 0), 0);
  assert.equal(capUseCount(1_000_000, 1_000_000), USE_MULTI_MAX);
});
