// toMovable guards (M9 phase G): busy while a move runs, 18.1 s between calls, per character.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UnstuckLimiter } from './unstuck';

test('one move at a time and 18.1 s apart, per character', () => {
  const l = new UnstuckLimiter();
  assert.equal(l.begin(1, 0), true);
  assert.equal(l.begin(1, 0), false, 'busy');
  l.done(1);
  assert.equal(l.begin(1, 18_000), false, 'too soon');
  assert.equal(l.begin(2, 18_000), true, 'other character');
  assert.equal(l.begin(1, 18_100), true);
});
