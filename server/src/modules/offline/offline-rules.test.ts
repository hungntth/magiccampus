// Offline claim gates: level first, then the pet checks in Go order.

import assert from 'node:assert/strict';
import test from 'node:test';
import { OfflineCode } from '@mc/shared';
import { charClaimError, petClaimError } from './offline-rules';

test('character claim needs level 30', () => {
  assert.equal(charClaimError(29), OfflineCode.LEVEL);
  assert.equal(charClaimError(30), null);
});

test('pet gates: level, no pet, not bound, too high, capped', () => {
  assert.equal(petClaimError(20, { level: 5, binded: 1 }), OfflineCode.LEVEL);
  assert.equal(petClaimError(40, null), OfflineCode.NO_PET);
  assert.equal(petClaimError(40, { level: 10, binded: 0 }), OfflineCode.PET_NOT_BOUND);
  assert.equal(petClaimError(40, { level: 46, binded: 1 }), OfflineCode.PET_TOO_HIGH);
  assert.equal(petClaimError(200, { level: 160, binded: 1 }), OfflineCode.PET_CAPPED);
  assert.equal(petClaimError(40, { level: 45, binded: 1 }), null);
});
