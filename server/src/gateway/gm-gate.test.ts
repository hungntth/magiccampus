// Unit tests for the GM gate used by requireGm RPCs (gmGoMap, gmAddBuff, gmGrant).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { envFlag, gmAllowed } from './gm-gate';

test('non-GM RPCs are always allowed', () => {
  assert.equal(gmAllowed({ gmLevel: 0, devCommands: false }), true);
});

test('GM RPCs need gmLevel > 0 unless dev commands are enabled', () => {
  assert.equal(gmAllowed({ requireGm: true, gmLevel: 0, devCommands: false }), false);
  assert.equal(gmAllowed({ requireGm: true, gmLevel: 1, devCommands: false }), true);
  assert.equal(gmAllowed({ requireGm: true, gmLevel: 0, devCommands: true }), true);
});

test('envFlag accepts 1/true/yes only', () => {
  for (const v of ['1', 'true', 'TRUE', ' yes ']) assert.equal(envFlag(v), true, v);
  for (const v of [undefined, '', '0', 'false', 'no', 'on']) assert.equal(envFlag(v), false, String(v));
});
