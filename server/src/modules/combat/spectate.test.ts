// startWatch gates (M9 phase H): the six refusals in Go order, and the happy path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WATCH_ERR } from '@mc/shared';
import { watchRefusal, type WatchFacts } from './spectate';

const ok: WatchFacts = {
  self: false, watcherInBattle: false, targetOnline: true, sameMap: true, targetInBattle: true, battleEnded: false, hasStart: true,
};

test('refusals in order', () => {
  assert.equal(watchRefusal(ok), null);
  assert.equal(watchRefusal({ ...ok, self: true, watcherInBattle: true }), WATCH_ERR.INVALID);
  assert.equal(watchRefusal({ ...ok, watcherInBattle: true, targetOnline: false }), WATCH_ERR.SELF_IN_BATTLE);
  assert.equal(watchRefusal({ ...ok, targetOnline: false, sameMap: false }), WATCH_ERR.OFFLINE);
  assert.equal(watchRefusal({ ...ok, sameMap: false, targetInBattle: false }), WATCH_ERR.OTHER_MAP);
  assert.equal(watchRefusal({ ...ok, targetInBattle: false }), WATCH_ERR.NOT_IN_BATTLE);
  assert.equal(watchRefusal({ ...ok, battleEnded: true }), WATCH_ERR.ENDED);
  assert.equal(watchRefusal({ ...ok, hasStart: false }), WATCH_ERR.INVALID);
});
