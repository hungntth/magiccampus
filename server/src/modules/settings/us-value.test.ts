// us(map) whitelist (M9 phases C / G): ignored keys, bad values, hotbar lock and system keys.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usValue } from './us-value';

test('unknown keys are ignored, known keys are validated', () => {
  assert.equal(usValue('st1', 52), undefined, 'hotbar slots go through uif, not us');
  assert.equal(usValue('zz', 1), undefined);
  assert.equal(usValue('ubl', true), true);
  assert.equal(usValue('hn', true), true);
  assert.equal(usValue('ac', 0), 0);
  assert.equal(usValue('hc', 'x'), null);
  assert.equal(usValue('maxView', 50), 50);
  assert.equal(usValue('maxView', 500), null);
});
