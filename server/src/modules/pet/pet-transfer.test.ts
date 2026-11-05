// Unit test for the shared pet transfer rule.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PetState } from '@mc/shared';
import { petTransferBlock, petTransferNote } from './pet-transfer';

const ok = { binded: 0, state: PetState.REST, following: false, equ: [0, 0, 0, 0, 0, 0, 0, 0] };

describe('petTransferBlock', () => {
  it('lets a resting unbound pet without gear go', () => {
    assert.equal(petTransferBlock(ok), null);
  });
  it('refuses bound pets first', () => {
    assert.equal(petTransferBlock({ ...ok, binded: 1, state: PetState.BATTLE }), 'bound');
  });
  it('refuses battle, following and unknown states', () => {
    assert.equal(petTransferBlock({ ...ok, state: PetState.BATTLE }), 'active');
    assert.equal(petTransferBlock({ ...ok, state: PetState.FOLLOW }), 'active');
    assert.equal(petTransferBlock({ ...ok, following: true }), 'active');
    assert.equal(petTransferBlock({ ...ok, state: 4 }), 'active');
  });
  it('refuses pets wearing gear', () => {
    assert.equal(petTransferBlock({ ...ok, equ: [0, 12, 0, 0, 0, 0, 0, 0] }), 'equipped');
  });
  it('maps a block to the caller text', () => {
    const texts = { bound: 'b', active: 'a', equipped: 'e' };
    assert.equal(petTransferNote({ ...ok, equ: [3] }, texts), 'e');
    assert.equal(petTransferNote(ok, texts), null);
  });
});
